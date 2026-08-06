import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isAssessmentCourse,
  checkAssessmentCourse,
  getAssessmentCourseInfo,
  clearAssessmentCourseCache,
  normalizeLearningPathTree,
  isAssessmentLevel,
  getLevelRole,
  getLevelDisplayInfo,
  resolveOpenAssessmentSlot,
  canReorderLevel,
  canAddCourseToLevel,
  hasExplicitCurriculum,
  getExplicitCurriculum,
  computeSkillsCovered,
  computePathShape,
  validateLearningPathStructure,
  revalidateAssessmentSlots,
} from './lpStructure';
import { readCourseHierarchy } from '../api/hierarchy';
import type { INode } from '../types/editor';

vi.mock('../api/hierarchy', () => ({
  readCourseHierarchy: vi.fn(),
}));

const questionSet = (id: string) => ({
  identifier: id,
  objectType: 'QuestionSet',
  mimeType: 'application/vnd.sunbird.questionset',
  children: [],
});
const videoResource = (id: string) => ({
  identifier: id,
  objectType: 'Content',
  mimeType: 'video/mp4',
  children: [],
});
const ecmlAssessment = (id: string) => ({
  identifier: id,
  objectType: 'Content',
  mimeType: 'application/vnd.ekstep.ecml-archive',
  children: [],
});

describe('isAssessmentCourse', () => {
  it('is true when every leaf, directly under the course, is a QuML QuestionSet', () => {
    const course = { children: [questionSet('q1'), questionSet('q2')] };
    expect(isAssessmentCourse(course)).toBe(true);
  });

  it('is true when QuestionSets are nested under intermediate units', () => {
    const course = { children: [{ children: [questionSet('q1'), questionSet('q2')] }] };
    expect(isAssessmentCourse(course)).toBe(true);
  });

  it('is false when any leaf is a non-QuestionSet resource', () => {
    const course = { children: [questionSet('q1'), videoResource('v1')] };
    expect(isAssessmentCourse(course)).toBe(false);
  });

  it('is false for legacy ECML assessment content, even though historically labelled "assessment"', () => {
    const course = { children: [ecmlAssessment('e1')] };
    expect(isAssessmentCourse(course)).toBe(false);
  });

  it('is false for an empty course (no leaves at all)', () => {
    expect(isAssessmentCourse({ children: [] })).toBe(false);
    expect(isAssessmentCourse({})).toBe(false);
  });
});

describe('checkAssessmentCourse', () => {
  beforeEach(() => {
    clearAssessmentCourseCache();
    vi.mocked(readCourseHierarchy).mockReset();
  });

  it('reads the course hierarchy and evaluates it', async () => {
    vi.mocked(readCourseHierarchy).mockResolvedValue({ children: [questionSet('q1')] });
    expect(await checkAssessmentCourse('course-1')).toBe(true);
    expect(readCourseHierarchy).toHaveBeenCalledWith('course-1');
  });

  it('caches the result per courseId for the session, avoiding a second read', async () => {
    vi.mocked(readCourseHierarchy).mockResolvedValue({ children: [questionSet('q1')] });
    await checkAssessmentCourse('course-2');
    await checkAssessmentCourse('course-2');
    expect(readCourseHierarchy).toHaveBeenCalledTimes(1);
  });

  it("getAssessmentCourseInfo exposes the course's own metadata (children stripped) for slot linking", async () => {
    vi.mocked(readCourseHierarchy).mockResolvedValue({
      identifier: 'course-3', framework: 'usf', skill: ['Python programming'],
      children: [questionSet('q1')],
    });
    const { qualifies, meta } = await getAssessmentCourseInfo('course-3');
    expect(qualifies).toBe(true);
    expect(meta).toEqual({ identifier: 'course-3', framework: 'usf', skill: ['Python programming'] });
  });
});

describe('normalizeLearningPathTree', () => {
  beforeEach(() => {
    clearAssessmentCourseCache();
    vi.mocked(readCourseHierarchy).mockReset();
  });

  const loadedCourse = (id: string, children: unknown[]): INode => ({
    id, identifier: id, name: id, isFolder: true, // mapToINode marks collection-mimeType courses as folders
    mimeType: 'application/vnd.ekstep.content-collection',
    children: children as INode[],
    metadata: {},
  });
  const loadedLevel = (id: string, children: INode[]): INode => ({
    id, identifier: id, name: id, isFolder: true, children,
    metadata: { primaryCategory: 'Level' },
  });

  it('re-flattens linked courses to terminal leaves and restores isAssessmentCourse from the expanded subtree', async () => {
    const root: INode = {
      id: 'root', identifier: 'root', name: 'LP', isFolder: true,
      children: [
        loadedLevel('lvl-pre', [loadedCourse('prior', [questionSet('q1')])]),
        loadedLevel('lvl-1', [loadedCourse('c1', [videoResource('v1')])]),
      ],
    };

    const normalized = await normalizeLearningPathTree(root);

    const prior = normalized.children![0].children![0];
    expect(prior.isFolder).toBe(false);
    expect(prior.children).toHaveLength(0);
    expect(prior.metadata?.isAssessmentCourse).toBe(true);

    const regular = normalized.children![1].children![0];
    expect(regular.isFolder).toBe(false);
    expect(regular.children).toHaveLength(0);
    expect(regular.metadata?.isAssessmentCourse).toBeUndefined();
    expect(readCourseHierarchy).not.toHaveBeenCalled(); // subtrees were expanded — no network needed
  });

  it('falls back to a course-hierarchy read for a single-course first/last Level with no expanded subtree', async () => {
    vi.mocked(readCourseHierarchy).mockResolvedValue({ children: [questionSet('q1')] });
    const root: INode = {
      id: 'root', identifier: 'root', name: 'LP', isFolder: true,
      children: [loadedLevel('lvl-pre', [loadedCourse('prior', [])])],
    };

    const normalized = await normalizeLearningPathTree(root);

    expect(readCourseHierarchy).toHaveBeenCalledWith('prior');
    expect(normalized.children![0].children![0].metadata?.isAssessmentCourse).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Structural rules (Phase 2)
// ---------------------------------------------------------------------------

const level = (over: Partial<INode>): INode => ({
  id: over.id ?? 'level', identifier: over.id ?? 'level', name: 'Level', isFolder: true, children: [], ...over,
});
const course = (id: string, over: Partial<INode> = {}): INode => ({
  id, identifier: id, name: 'Course', isFolder: false, children: [], metadata: {}, ...over,
});
const assessmentCourse = (id: string): INode => course(id, { metadata: { isAssessmentCourse: true } });
const assessmentCourseWithSkills = (id: string, skills: string[]): INode =>
  course(id, { metadata: { isAssessmentCourse: true, skill: skills } });

describe('isAssessmentLevel', () => {
  it('is true only for a Level wrapping exactly one assessment-flagged course', () => {
    expect(isAssessmentLevel(level({ children: [assessmentCourse('a1')] }))).toBe(true);
    expect(isAssessmentLevel(level({ children: [course('c1')] }))).toBe(false);
    expect(isAssessmentLevel(level({ children: [] }))).toBe(false);
    expect(isAssessmentLevel(level({ children: [assessmentCourse('a1'), course('c1')] }))).toBe(false);
    expect(isAssessmentLevel(undefined)).toBe(false);
  });
});

describe('getLevelRole', () => {
  it('is content when there is no assessment course', () => {
    expect(getLevelRole(0, 3, false)).toBe('content');
    expect(getLevelRole(2, 3, false)).toBe('content');
  });

  it('is pre at index 0, post at the last index, levelAssessment in between', () => {
    expect(getLevelRole(0, 4, true)).toBe('pre');
    expect(getLevelRole(3, 4, true)).toBe('post');
    expect(getLevelRole(1, 4, true)).toBe('levelAssessment');
    expect(getLevelRole(2, 4, true)).toBe('levelAssessment');
  });

  it('breaks the levelCount === 1 tie in favor of pre', () => {
    expect(getLevelRole(0, 1, true)).toBe('pre');
  });
});

describe('getLevelDisplayInfo', () => {
  it('returns null for an id that is not one of the given levels', () => {
    expect(getLevelDisplayInfo([level({ id: 'l1' })], 'missing')).toBeNull();
  });

  it('is pre for the first level when it wraps an assessment course, post otherwise', () => {
    const pre = level({ id: 'pre', children: [assessmentCourse('a1')] });
    const content = level({ id: 'l1' });
    const post = level({ id: 'post', children: [assessmentCourse('a2')] });
    expect(getLevelDisplayInfo([pre, content, post], 'pre')).toEqual({ role: 'pre', levelNumber: null });
    expect(getLevelDisplayInfo([pre, content, post], 'post')).toEqual({ role: 'post', levelNumber: null });
  });

  it('numbers regular Levels 1-based, excluding assessment slots from the count', () => {
    const pre = level({ id: 'pre', children: [assessmentCourse('a1')] });
    const l1 = level({ id: 'l1' });
    const l2 = level({ id: 'l2' });
    const post = level({ id: 'post', children: [assessmentCourse('a2')] });
    expect(getLevelDisplayInfo([pre, l1, l2, post], 'l1')).toEqual({ role: 'level', levelNumber: 1 });
    expect(getLevelDisplayInfo([pre, l1, l2, post], 'l2')).toEqual({ role: 'level', levelNumber: 2 });
  });
});

describe('resolveOpenAssessmentSlot', () => {
  it('offers pre first on an empty path', () => {
    expect(resolveOpenAssessmentSlot([])).toBe('pre');
  });

  it('offers post once pre is filled', () => {
    expect(resolveOpenAssessmentSlot([level({ id: 'pre', children: [assessmentCourse('a1')] })])).toBe('post');
  });

  it('offers pre even if a content Level already occupies index 0 (pre gets inserted ahead of it)', () => {
    expect(resolveOpenAssessmentSlot([level({ id: 'c1', children: [course('c1')] })])).toBe('pre');
  });

  it('returns null once both pre and post are filled', () => {
    const levels = [
      level({ id: 'pre', children: [assessmentCourse('a1')] }),
      level({ id: 'mid', children: [course('c1')] }),
      level({ id: 'post', children: [assessmentCourse('a2')] }),
    ];
    expect(resolveOpenAssessmentSlot(levels)).toBeNull();
  });
});

describe('canReorderLevel', () => {
  const levels = [
    level({ id: 'pre', children: [assessmentCourse('a1')] }),
    level({ id: 'mid1', children: [course('c1')] }),
    level({ id: 'mid2', children: [course('c2')] }),
    level({ id: 'post', children: [assessmentCourse('a2')] }),
  ];

  it('allows reordering content Levels between the pinned slots', () => {
    expect(canReorderLevel(levels, 1, 2)).toBe(true);
    expect(canReorderLevel(levels, 2, 1)).toBe(true);
  });

  it('rejects moving the pinned pre Level away from index 0', () => {
    expect(canReorderLevel(levels, 0, 2)).toBe(false);
  });

  it('rejects moving the pinned post Level away from the last index', () => {
    expect(canReorderLevel(levels, 3, 1)).toBe(false);
  });

  it('rejects displacing the pinned pre Level by moving another Level to index 0', () => {
    expect(canReorderLevel(levels, 2, 0)).toBe(false);
  });

  it('rejects displacing the pinned post Level by moving another Level to the last index', () => {
    expect(canReorderLevel(levels, 1, 3)).toBe(false);
  });

  it('allows any reorder when neither slot is pinned yet', () => {
    const contentOnly = [level({ id: 'c1' }), level({ id: 'c2' }), level({ id: 'c3' })];
    expect(canReorderLevel(contentOnly, 0, 2)).toBe(true);
  });
});

describe('canAddCourseToLevel', () => {
  it('rejects any addition once a Level is already an assessment Level (holds exactly one course)', () => {
    const preLevel = level({ children: [assessmentCourse('a1')] });
    expect(canAddCourseToLevel(preLevel, false)).toBe(false);
    expect(canAddCourseToLevel(preLevel, true)).toBe(false);
  });

  it('allows unlimited regular courses on a content Level', () => {
    const contentLevel = level({ children: [course('c1'), course('c2')] });
    expect(canAddCourseToLevel(contentLevel, false)).toBe(true);
  });

  it('allows exactly one Level-assessment course on a content Level', () => {
    const contentLevel = level({ children: [course('c1')] });
    expect(canAddCourseToLevel(contentLevel, true)).toBe(true);
  });

  it('rejects a second Level-assessment course on the same content Level', () => {
    const contentLevel = level({ children: [course('c1'), assessmentCourse('a1')] });
    expect(canAddCourseToLevel(contentLevel, true)).toBe(false);
  });

  it('allows the first course into a brand-new empty Level regardless of flag', () => {
    expect(canAddCourseToLevel(level({ children: [] }), true)).toBe(true);
    expect(canAddCourseToLevel(level({ children: [] }), false)).toBe(true);
  });
});

describe('hasExplicitCurriculum', () => {
  it('is false with no root', () => {
    expect(hasExplicitCurriculum(undefined, {})).toBe(false);
  });

  it('is false when neither the root metadata nor treeCache has a framework', () => {
    const root = level({ id: 'root' });
    expect(hasExplicitCurriculum(root, {})).toBe(false);
  });

  it('is true once treeCache has the live-edited framework (before a save round-trips it)', () => {
    const root = level({ id: 'root' });
    expect(hasExplicitCurriculum(root, { root: { framework: 'NCF' } })).toBe(true);
  });

  it('is true once the root metadata has a saved framework', () => {
    const root = level({ id: 'root', metadata: { framework: 'NCF' } });
    expect(hasExplicitCurriculum(root, {})).toBe(true);
  });
});

describe('getExplicitCurriculum', () => {
  it('is undefined with no root, or with neither treeCache nor root metadata set', () => {
    expect(getExplicitCurriculum(undefined, {})).toBeUndefined();
    expect(getExplicitCurriculum(level({ id: 'root' }), {})).toBeUndefined();
  });

  it('prefers the live treeCache edit over the saved root metadata', () => {
    const root = level({ id: 'root', metadata: { framework: 'NCF' } });
    expect(getExplicitCurriculum(root, { root: { framework: 'USF' } })).toBe('USF');
  });

  it('falls back to the saved root metadata when treeCache has no edit', () => {
    const root = level({ id: 'root', metadata: { framework: 'NCF' } });
    expect(getExplicitCurriculum(root, {})).toBe('NCF');
  });
});

describe('computeSkillsCovered', () => {
  it('unions the prior/outcome assessment skill tags with each content Level\'s selected skills', () => {
    const root = level({
      id: 'root',
      children: [
        level({ id: 'pre', children: [assessmentCourseWithSkills('a1', ['Python programming'])] }),
        level({ id: 'lvl1', metadata: { competencies: ['Java'] }, children: [course('c1')] }),
        level({ id: 'lvl2', metadata: { competencies: ['Java', 'SQL'] }, children: [course('c2')] }),
        level({ id: 'post', children: [assessmentCourseWithSkills('a2', ['SQL', 'Testing'])] }),
      ],
    });
    expect(computeSkillsCovered(root, 'skill').sort()).toEqual(
      ['Java', 'Python programming', 'SQL', 'Testing'].sort(),
    );
  });

  it('never pulls skills from a content Level\'s linked courses, only its own competencies field', () => {
    const root = level({
      id: 'root',
      children: [
        level({ id: 'lvl1', children: [course('c1', { metadata: { skill: ['Should not leak'] } })] }),
      ],
    });
    expect(computeSkillsCovered(root, 'skill')).toEqual([]);
  });

  it('returns an empty array without a root node or a resolved skill category', () => {
    expect(computeSkillsCovered(undefined, 'skill')).toEqual([]);
    expect(computeSkillsCovered(level({ children: [] }), undefined)).toEqual([]);
  });
});

describe('computePathShape', () => {
  it('excludes pre/post assessment slots from the level count, includes their courses in the course count', () => {
    const root = level({
      id: 'root',
      children: [
        level({ id: 'pre', children: [assessmentCourse('a1')] }),
        level({ id: 'lvl1', children: [course('c1'), course('c2')] }),
        level({ id: 'lvl2', children: [course('c3')] }),
        level({ id: 'post', children: [assessmentCourse('a2')] }),
      ],
    });
    expect(computePathShape(root)).toEqual({ levelCount: 2, courseCount: 5 });
  });

  it('returns zeros for a rootless or empty path', () => {
    expect(computePathShape(undefined)).toEqual({ levelCount: 0, courseCount: 0 });
    expect(computePathShape(level({ children: [] }))).toEqual({ levelCount: 0, courseCount: 0 });
  });
});

// ---------------------------------------------------------------------------
// Publish validation (Phase 5)
// ---------------------------------------------------------------------------

function validPath(policy = 'Fixed') {
  return level({
    id: 'root', metadata: { policy },
    children: [
      level({ id: 'pre', children: [assessmentCourseWithSkills('a1', ['Python programming'])] }),
      level({
        id: 'lvl1', metadata: { competencies: ['Java'] },
        children: [course('c1', { metadata: { skill: ['Java'] } })],
      }),
      level({ id: 'post', children: [assessmentCourseWithSkills('a2', ['SQL'])] }),
    ],
  });
}

describe('validateLearningPathStructure', () => {
  it('is clean for a fully-valid Fixed-policy path', () => {
    expect(validateLearningPathStructure(validPath(), 'skill', [])).toEqual([]);
  });

  it('flags a missing policy', () => {
    const root = validPath();
    delete root.metadata!['policy'];
    expect(validateLearningPathStructure(root, 'skill', []).map(i => i.code)).toContain('policyMissing');
  });

  it('requires a Prior Assessment only for Diagnostic/PriorLearning, not Fixed', () => {
    const noPrior = level({
      id: 'root', metadata: { policy: 'Fixed' },
      children: [
        level({ id: 'lvl1', metadata: { competencies: ['Java'] }, children: [course('c1', { metadata: { skill: ['Java'] } })] }),
        level({ id: 'post', children: [assessmentCourseWithSkills('a2', ['SQL'])] }),
      ],
    });
    expect(validateLearningPathStructure(noPrior, 'skill', []).map(i => i.code)).not.toContain('priorAssessmentRequired');

    const diagnostic = { ...noPrior, metadata: { policy: 'Diagnostic' } };
    expect(validateLearningPathStructure(diagnostic, 'skill', []).map(i => i.code)).toContain('priorAssessmentRequired');
  });

  it('always requires an Outcome Assessment', () => {
    const root = validPath();
    root.children = root.children!.slice(0, -1); // drop the post slot
    expect(validateLearningPathStructure(root, 'skill', []).map(i => i.code)).toContain('outcomeAssessmentMissing');
  });

  it('flags a pre/post slot that is not exactly one assessment course', () => {
    const root = validPath();
    root.children![0].children!.push(course('extra')); // second child in the pre slot
    expect(validateLearningPathStructure(root, 'skill', []).map(i => i.code)).toContain('slotNotPure');
  });

  it('flags an empty content Level', () => {
    const root = validPath();
    root.children![1].children = [];
    const issues = validateLearningPathStructure(root, 'skill', []);
    expect(issues.map(i => i.code)).toContain('emptyLevel');
    expect(issues.map(i => i.code)).not.toContain('levelMissingSkills'); // short-circuits on empty
  });

  it('flags a content Level with no selected skills', () => {
    const root = validPath();
    root.children![1].metadata = {};
    expect(validateLearningPathStructure(root, 'skill', []).map(i => i.code)).toContain('levelMissingSkills');
  });

  it('flags a content Level whose selected skills fall outside the current scope', () => {
    const root = validPath();
    expect(validateLearningPathStructure(root, 'skill', ['Python programming']).map(i => i.code))
      .toContain('levelSkillsOutOfScope');
    // Within scope: no issue.
    expect(validateLearningPathStructure(root, 'skill', ['Java']).map(i => i.code))
      .not.toContain('levelSkillsOutOfScope');
  });

  it('flags a linked course with no skill tag', () => {
    const root = validPath();
    root.children![1].children![0].metadata = {};
    expect(validateLearningPathStructure(root, 'skill', []).map(i => i.code)).toContain('courseMissingSkillTag');
  });

  it('flags a course that appears more than once in the path', () => {
    const root = validPath();
    root.children![1].children!.push(course('a1')); // same id as the prior-assessment course
    expect(validateLearningPathStructure(root, 'skill', []).map(i => i.code)).toContain('duplicateCourse');
  });

  it('returns no issues for a rootless tree', () => {
    expect(validateLearningPathStructure(undefined, 'skill', [])).toEqual([]);
  });
});

describe('revalidateAssessmentSlots', () => {
  beforeEach(() => {
    clearAssessmentCourseCache();
    vi.mocked(readCourseHierarchy).mockReset();
  });

  it('flags a slot whose course no longer qualifies as question-set-only', async () => {
    vi.mocked(readCourseHierarchy).mockResolvedValue({ children: [videoResource('v1')] });
    const root = validPath();
    const issues = await revalidateAssessmentSlots(root);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every(i => i.code === 'slotCourseChanged')).toBe(true);
  });

  it('is clean when both slots still qualify', async () => {
    vi.mocked(readCourseHierarchy).mockResolvedValue({ children: [questionSet('q1')] });
    expect(await revalidateAssessmentSlots(validPath())).toEqual([]);
  });

  it('skips slots that are not assessment Levels', async () => {
    const root = level({ id: 'root', children: [level({ id: 'lvl1', children: [course('c1')] })] });
    expect(await revalidateAssessmentSlots(root)).toEqual([]);
    expect(readCourseHierarchy).not.toHaveBeenCalled();
  });
});
