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
  isPrePostSlot,
  hasExplicitCurriculum,
  getExplicitCurriculum,
  computeSkillsCovered,
  resolveSkillsCoveredForSync,
  computeUncoveredSkills,
  findLevelsWithOutOfScopeSkills,
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

  it('a middle Level whose only course is its Level assessment is still role "level", numbered — not misread as the post slot', () => {
    // Same shape as a pre/post slot (isAssessmentLevel is position-agnostic
    // by design), but it's neither first nor last, so it must stay a regular,
    // numbered content Level.
    const l1 = level({ id: 'l1' });
    const l2 = level({ id: 'l2', children: [assessmentCourse('a1')] });
    const l3 = level({ id: 'l3' });
    expect(getLevelDisplayInfo([l1, l2, l3], 'l2')).toEqual({ role: 'level', levelNumber: 2 });
    expect(getLevelDisplayInfo([l1, l2, l3], 'l3')).toEqual({ role: 'level', levelNumber: 3 });
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

  it('fails closed for an out-of-range fromIndex — there is nothing there to move', () => {
    expect(canReorderLevel(levels, -1, 1)).toBe(false);
    expect(canReorderLevel(levels, levels.length, 1)).toBe(false);
  });
});

describe('canAddCourseToLevel', () => {
  it('rejects any addition to a genuine pre/post slot (holds exactly one course, ever)', () => {
    const preLevel = level({ children: [assessmentCourse('a1')] });
    expect(canAddCourseToLevel(preLevel, false, true)).toBe(false);
    expect(canAddCourseToLevel(preLevel, true, true)).toBe(false);
  });

  it('allows unlimited regular courses on a content Level', () => {
    const contentLevel = level({ children: [course('c1'), course('c2')] });
    expect(canAddCourseToLevel(contentLevel, false, false)).toBe(true);
  });

  it('allows exactly one Level-assessment course on a content Level', () => {
    const contentLevel = level({ children: [course('c1')] });
    expect(canAddCourseToLevel(contentLevel, true, false)).toBe(true);
  });

  it('rejects a second Level-assessment course on the same content Level', () => {
    const contentLevel = level({ children: [course('c1'), assessmentCourse('a1')] });
    expect(canAddCourseToLevel(contentLevel, true, false)).toBe(false);
  });

  it('allows the first course into a brand-new empty Level regardless of flag', () => {
    expect(canAddCourseToLevel(level({ children: [] }), true, false)).toBe(true);
    expect(canAddCourseToLevel(level({ children: [] }), false, false)).toBe(true);
  });

  it('still allows regular courses on a middle Level whose only current course is its Level assessment — shape alone is not a pre/post slot', () => {
    // Same shape as a pre/post slot (exactly one assessment-flagged child),
    // but isTargetPrePostSlot=false because it's a middle content Level, not
    // index 0/last — this is exactly the scenario isPrePostSlot must catch.
    const middleLevelAssessmentOnly = level({ children: [assessmentCourse('a1')] });
    expect(canAddCourseToLevel(middleLevelAssessmentOnly, false, false)).toBe(true);
    expect(canAddCourseToLevel(middleLevelAssessmentOnly, true, false)).toBe(false); // still caps at one Level assessment
  });
});

describe('isPrePostSlot', () => {
  it('is false with no matching level, or a level not in the list', () => {
    expect(isPrePostSlot([], undefined)).toBe(false);
    expect(isPrePostSlot([level({ id: 'a' })], level({ id: 'z' }))).toBe(false);
  });

  it('is true only for an assessment-shaped Level at index 0 or the last index', () => {
    const pre = level({ id: 'pre', children: [assessmentCourse('a1')] });
    const mid = level({ id: 'mid', children: [assessmentCourse('a2')] });
    const post = level({ id: 'post', children: [assessmentCourse('a3')] });
    const levels = [pre, mid, post];
    expect(isPrePostSlot(levels, pre)).toBe(true);
    expect(isPrePostSlot(levels, post)).toBe(true);
    expect(isPrePostSlot(levels, mid)).toBe(false); // same shape, wrong position
  });

  it('is false for a Level at slot position that is not assessment-shaped', () => {
    const regular = level({ id: 'lvl1', children: [course('c1')] });
    expect(isPrePostSlot([regular], regular)).toBe(false);
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
        level({ id: 'lvl1', metadata: { skill: ['Java'] }, children: [course('c1')] }),
        level({ id: 'lvl2', metadata: { skill: ['Java', 'SQL'] }, children: [course('c2')] }),
        level({ id: 'post', children: [assessmentCourseWithSkills('a2', ['SQL', 'Testing'])] }),
      ],
    });
    expect(computeSkillsCovered(root, 'skill').sort()).toEqual(
      ['Java', 'Python programming', 'SQL', 'Testing'].sort(),
    );
  });

  it('never pulls skills from a content Level\'s linked courses, only its own resolved skill-category field', () => {
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

  it('reads a middle Level\'s OWN selected skills, not its Level-assessment course\'s tags, even though the shape matches a pre/post slot', () => {
    const root = level({
      id: 'root',
      children: [
        level({ id: 'l1' }),
        level({
          id: 'l2', metadata: { skill: ['Java'] },
          children: [assessmentCourseWithSkills('a1', ['Should not leak'])],
        }),
        level({ id: 'l3' }),
      ],
    });
    expect(computeSkillsCovered(root, 'skill')).toEqual(['Java']);
  });
});

describe('resolveSkillsCoveredForSync', () => {
  it("returns the covered union when it differs from root's stored value — a Level's newly-added skill should attach to the path's own metadata too", () => {
    const root = level({
      id: 'root', metadata: { skill: ['Java'] }, // stale — lvl1 now also selects Python
      children: [
        level({ id: 'lvl1', metadata: { skill: ['Java', 'Python programming'] }, children: [course('c1')] }),
      ],
    });
    expect(resolveSkillsCoveredForSync(root, 'skill', {})?.sort()).toEqual(['Java', 'Python programming']);
  });

  it("returns null once root's stored value already matches the covered union, order-insensitively", () => {
    const root = level({
      id: 'root', metadata: { skill: ['Python programming', 'Java'] }, // different order, same set
      children: [
        level({ id: 'lvl1', metadata: { skill: ['Java'] }, children: [course('c1')] }),
        level({ id: 'lvl2', metadata: { skill: ['Python programming'] }, children: [course('c2')] }),
      ],
    });
    expect(resolveSkillsCoveredForSync(root, 'skill', {})).toBeNull();
  });

  it('prefers treeCache over root.metadata for the stored-value comparison, matching every other field read this way', () => {
    const root = level({
      id: 'root', metadata: { skill: ['Java'] }, // stale metadata — treeCache has the live edit
      children: [level({ id: 'lvl1', metadata: { skill: ['Java'] }, children: [course('c1')] })],
    });
    const treeCache = { root: { skill: ['Java'] } }; // matches the covered union
    expect(resolveSkillsCoveredForSync(root, 'skill', treeCache)).toBeNull();
  });

  it('returns null without a root node or a resolved skill category', () => {
    expect(resolveSkillsCoveredForSync(undefined, 'skill', {})).toBeNull();
    expect(resolveSkillsCoveredForSync(level({ children: [] }), undefined, {})).toBeNull();
  });
});

describe('computeUncoveredSkills', () => {
  it('flags a selected skill with zero linked course tagged for it', () => {
    const lvl = level({
      id: 'lvl1', metadata: { skill: ['Python programming', 'Java'] },
      children: [course('c1', { metadata: { skill: ['Python programming'] } })],
    });
    expect(computeUncoveredSkills(lvl, ['Python programming', 'Java'], 'skill')).toEqual(['Java']);
  });

  it('returns nothing once every selected skill has at least one covering course', () => {
    const lvl = level({
      id: 'lvl1', metadata: { skill: ['Python programming', 'Java'] },
      children: [
        course('c1', { metadata: { skill: ['Python programming'] } }),
        course('c2', { metadata: { skill: ['Java'] } }),
      ],
    });
    expect(computeUncoveredSkills(lvl, ['Python programming', 'Java'], 'skill')).toEqual([]);
  });

  it("doesn't let redundant coverage of one skill mask another selected skill having none — a Level 'looks' populated with 2 courses while Java has zero coverage", () => {
    const lvl = level({
      id: 'lvl1', metadata: { skill: ['Python programming', 'Java'] },
      children: [
        course('c1', { metadata: { skill: ['Python programming'] } }),
        course('c2', { metadata: { skill: ['Python programming'] } }), // redundant with c1
      ],
    });
    expect(computeUncoveredSkills(lvl, ['Python programming', 'Java'], 'skill')).toEqual(['Java']);
  });

  it('unions coverage across multiple courses under the same Level', () => {
    const lvl = level({
      id: 'lvl1', metadata: { skill: ['Python programming', 'Java', 'SQL'] },
      children: [
        course('c1', { metadata: { skill: ['Python programming'] } }),
        course('c2', { metadata: { skill: ['Java', 'SQL'] } }),
      ],
    });
    expect(computeUncoveredSkills(lvl, ['Python programming', 'Java', 'SQL'], 'skill')).toEqual([]);
  });

  it('flags every selected skill when the Level has no courses at all', () => {
    const lvl = level({ id: 'lvl1', metadata: { skill: ['Python programming'] }, children: [] });
    expect(computeUncoveredSkills(lvl, ['Python programming'], 'skill')).toEqual(['Python programming']);
  });

  it('returns an empty array with no level, no skill category, or no selected skills', () => {
    expect(computeUncoveredSkills(undefined, ['Java'], 'skill')).toEqual([]);
    expect(computeUncoveredSkills(level({ children: [] }), ['Java'], undefined)).toEqual([]);
    expect(computeUncoveredSkills(level({ children: [] }), [], 'skill')).toEqual([]);
  });
});

describe('findLevelsWithOutOfScopeSkills', () => {
  it('returns content Levels with at least one selected skill outside the scope', () => {
    const root = level({
      id: 'root',
      children: [
        level({ id: 'lvl1', metadata: { skill: ['Java'] }, children: [course('c1')] }),
        level({ id: 'lvl2', metadata: { skill: ['Python programming'] }, children: [course('c2')] }),
      ],
    });
    const affected = findLevelsWithOutOfScopeSkills(root, 'skill', ['Java']);
    expect(affected.map(l => l.id)).toEqual(['lvl2']);
  });

  it('excludes the pre/post assessment slots — their course tags are not a Level skill selection', () => {
    const root = level({
      id: 'root',
      children: [
        level({ id: 'pre', children: [assessmentCourseWithSkills('a1', ['Python programming'])] }),
        level({ id: 'lvl1', metadata: { skill: ['Java'] }, children: [course('c1')] }),
      ],
    });
    // 'Python programming' (the pre-slot's own course tag) is irrelevant here —
    // only lvl1's OWN selection ('Java') is checked against the scope.
    expect(findLevelsWithOutOfScopeSkills(root, 'skill', ['Java']).map(l => l.id)).toEqual([]);
  });

  it('returns nothing without a root, a skill category, or a non-empty scope', () => {
    const root = level({ id: 'root', children: [level({ id: 'lvl1', metadata: { skill: ['Java'] } })] });
    expect(findLevelsWithOutOfScopeSkills(undefined, 'skill', ['Java'])).toEqual([]);
    expect(findLevelsWithOutOfScopeSkills(root, undefined, ['Java'])).toEqual([]);
    expect(findLevelsWithOutOfScopeSkills(root, 'skill', [])).toEqual([]); // empty scope = no constraint yet
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

  it('counts a middle Level whose only course is its Level assessment — shape alone must not exclude it', () => {
    const root = level({
      id: 'root',
      children: [
        level({ id: 'l1' }),
        level({ id: 'l2', children: [assessmentCourse('a1')] }),
        level({ id: 'l3' }),
      ],
    });
    expect(computePathShape(root)).toEqual({ levelCount: 3, courseCount: 1 });
  });
});

// ---------------------------------------------------------------------------
// Publish validation (Phase 5)
// ---------------------------------------------------------------------------

function validPath(policy = 'strict') {
  return level({
    id: 'root', metadata: { policy },
    children: [
      level({ id: 'pre', children: [assessmentCourseWithSkills('a1', ['Python programming'])] }),
      level({
        id: 'lvl1', metadata: { skill: ['Java'] },
        children: [course('c1', { metadata: { skill: ['Java'] } })],
      }),
      level({ id: 'post', children: [assessmentCourseWithSkills('a2', ['SQL'])] }),
    ],
  });
}

describe('validateLearningPathStructure', () => {
  it('is clean for a fully-valid strict-policy path', () => {
    expect(validateLearningPathStructure(validPath(), 'skill', [])).toEqual([]);
  });

  it('flags a missing policy', () => {
    const root = validPath();
    delete root.metadata!['policy'];
    expect(validateLearningPathStructure(root, 'skill', []).map(i => i.code)).toContain('policyMissing');
  });

  it('requires a Prior Assessment only for adaptive ("Adaptive") — not strict, not priorLearning', () => {
    const noPrior = level({
      id: 'root', metadata: { policy: 'strict' },
      children: [
        level({ id: 'lvl1', metadata: { skill: ['Java'] }, children: [course('c1', { metadata: { skill: ['Java'] } })] }),
        level({ id: 'post', children: [assessmentCourseWithSkills('a2', ['SQL'])] }),
      ],
    });
    expect(validateLearningPathStructure(noPrior, 'skill', []).map(i => i.code)).not.toContain('priorAssessmentRequired');

    const adaptive = { ...noPrior, metadata: { policy: 'adaptive' } };
    expect(validateLearningPathStructure(adaptive, 'skill', []).map(i => i.code)).toContain('priorAssessmentRequired');

    // priorLearning can skip on external evidence (a verified certificate or
    // prior course) "not the assessment alone" — the Prior Assessment stays
    // optional here, unlike adaptive which skips solely on its score.
    const priorLearning = { ...noPrior, metadata: { policy: 'priorLearning' } };
    expect(validateLearningPathStructure(priorLearning, 'skill', []).map(i => i.code)).not.toContain('priorAssessmentRequired');
  });

  it("sees an unsaved policy change from treeCache, not just root.metadata — updateNode's flat patch lands there before a save mirrors it into metadata", () => {
    const noPrior = level({
      id: 'root', metadata: {}, // no policy committed to metadata yet
      children: [
        level({ id: 'lvl1', metadata: { skill: ['Java'] }, children: [course('c1', { metadata: { skill: ['Java'] } })] }),
        level({ id: 'post', children: [assessmentCourseWithSkills('a2', ['SQL'])] }),
      ],
    });
    const treeCache = { root: { policy: 'adaptive' } };
    const issues = validateLearningPathStructure(noPrior, 'skill', [], treeCache).map(i => i.code);
    expect(issues).toContain('priorAssessmentRequired');
    expect(issues).not.toContain('policyMissing');
  });

  it('does not require an Outcome Assessment — an empty post slot is not flagged', () => {
    const root = validPath();
    root.children = root.children!.slice(0, -1); // drop the post slot
    expect(validateLearningPathStructure(root, 'skill', []).map(i => i.code)).not.toContain('outcomeAssessmentMissing');
  });

  it('flags a pre/post slot that is not exactly one assessment course', () => {
    const root = validPath();
    root.children![0].children!.push(course('extra')); // second child in the pre slot
    expect(validateLearningPathStructure(root, 'skill', []).map(i => i.code)).toContain('slotNotPure');
  });

  it('does not flag slotNotPure for an ordinary content Level that just happens to sit first/last — no assessment course attached at all', () => {
    // No Prior/Outcome Assessment was ever added — every Level is regular
    // content. Position alone (index 0 / last) must not make this look like
    // a broken assessment slot; only a Level that HAS an assessment-flagged
    // course but isn't purely that one course should ever trigger this.
    const root = level({
      id: 'root', metadata: { policy: 'strict' },
      children: [
        level({ id: 'lvl1', metadata: { skill: ['Java'] }, children: [course('c1', { metadata: { skill: ['Java'] } }), course('c2', { metadata: { skill: ['Java'] } })] }),
        level({ id: 'lvl2', metadata: { skill: ['SQL'] }, children: [course('c3', { metadata: { skill: ['SQL'] } })] }),
      ],
    });
    expect(validateLearningPathStructure(root, 'skill', []).map(i => i.code)).not.toContain('slotNotPure');
  });

  it('flags an empty content Level', () => {
    const root = validPath();
    root.children![1].children = [];
    const issues = validateLearningPathStructure(root, 'skill', []);
    expect(issues.map(i => i.code)).toContain('emptyLevel');
    expect(issues.map(i => i.code)).not.toContain('levelMissingSkills'); // redundant with emptyLevel
  });

  it("also names the selected skill(s) an empty Level still needs a course for — not just 'no courses yet'", () => {
    const root = validPath();
    root.children![1].children = []; // lvl1 keeps its metadata.skill: ['Java'] selection
    const issues = validateLearningPathStructure(root, 'skill', []);
    expect(issues.map(i => i.code)).toContain('emptyLevel');
    expect(issues.map(i => i.code)).toContain('levelSkillsUncovered');
    expect(issues.find(i => i.code === 'levelSkillsUncovered')?.message).toContain('Java');
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

  it('is clean for a valid path where every selected skill has a covering course', () => {
    expect(validateLearningPathStructure(validPath(), 'skill', []).map(i => i.code))
      .not.toContain('levelSkillsUncovered');
  });

  it('flags a content Level with a selected skill no linked course is tagged with', () => {
    const root = validPath();
    root.children![1].metadata = { skill: ['Java', 'Python programming'] }; // course c1 is only tagged 'Java'
    const issues = validateLearningPathStructure(root, 'skill', []);
    expect(issues.map(i => i.code)).toContain('levelSkillsUncovered');
    expect(issues.find(i => i.code === 'levelSkillsUncovered')?.message).toContain('Python programming');
  });

  it('flags a linked course with no skill tag', () => {
    const root = validPath();
    root.children![1].children![0].metadata = {};
    expect(validateLearningPathStructure(root, 'skill', []).map(i => i.code)).toContain('courseMissingSkillTag');
  });

  it("pairs courseMissingSkillTag with levelSkillsUncovered when that untagged course was the Level's only coverage — the two facts surface together rather than needing one message to explain the other", () => {
    const root = validPath();
    root.children![1].children![0].metadata = {}; // c1 loses its 'Java' tag — lvl1's only course
    const issues = validateLearningPathStructure(root, 'skill', []).map(i => i.code);
    expect(issues).toContain('courseMissingSkillTag');
    expect(issues).toContain('levelSkillsUncovered');
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
