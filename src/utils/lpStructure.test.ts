import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isEvaluationCourse,
  EVALUATION_COURSE_CATEGORY,
  normalizeLearningPathTree,
  isAssessmentLevel,
  getLevelExamCourse,
  getLevelRole,
  getLevelDisplayInfo,
  resolveOpenAssessmentSlot,
  canReorderLevel,
  canAddCourseToLevel,
  isPrePostSlot,
  wouldBecomeAmbiguousSlot,
  getCourseFrameworkId,
  getCourseSkillNames,
  computeSkillsCovered,
  computeUncoveredSkills,
  findLevelsWithOutOfScopeSkills,
  computePathShape,
  validateLearningPathStructure,
  revalidateAssessmentSlots,
  type SkillCategoryByFramework,
} from './lpStructure';
import { fetchContentDetails } from '../api/content';
import type { INode } from '../types/editor';

vi.mock('../api/content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/content')>()),
  fetchContentDetails: vi.fn(),
}));

describe('isEvaluationCourse', () => {
  it('is true only for a course whose primaryCategory is exactly "Evaluation Course"', () => {
    expect(isEvaluationCourse({ primaryCategory: EVALUATION_COURSE_CATEGORY })).toBe(true);
    expect(isEvaluationCourse({ primaryCategory: 'Course' })).toBe(false);
    expect(isEvaluationCourse({})).toBe(false);
    expect(isEvaluationCourse(undefined)).toBe(false);
  });
});

describe('normalizeLearningPathTree', () => {
  const loadedCourse = (id: string, primaryCategory?: string): INode => ({
    id, identifier: id, name: id, isFolder: true, // mapToINode marks collection-mimeType courses as folders
    mimeType: 'application/vnd.ekstep.content-collection',
    children: [{ id: `${id}-leaf`, identifier: `${id}-leaf`, name: 'leaf', isFolder: false, children: [] }],
    metadata: { primaryCategory },
  });
  const loadedLevel = (id: string, children: INode[]): INode => ({
    id, identifier: id, name: id, isFolder: true, children,
    metadata: { primaryCategory: 'Level' },
  });

  it("re-flattens linked courses to terminal leaves and flags isAssessmentCourse from the course's OWN primaryCategory", () => {
    const root: INode = {
      id: 'root', identifier: 'root', name: 'LP', isFolder: true,
      children: [
        loadedLevel('lvl-pre', [loadedCourse('prior', EVALUATION_COURSE_CATEGORY)]),
        loadedLevel('lvl-1', [loadedCourse('c1', 'Course')]),
      ],
    };

    const normalized = normalizeLearningPathTree(root);

    const prior = normalized.children![0].children![0];
    expect(prior.isFolder).toBe(false);
    expect(prior.children).toHaveLength(0);
    expect(prior.metadata?.isAssessmentCourse).toBe(true);

    const regular = normalized.children![1].children![0];
    expect(regular.isFolder).toBe(false);
    expect(regular.children).toHaveLength(0);
    expect(regular.metadata?.isAssessmentCourse).toBeUndefined();
  });

  it('is position-independent — any course categorized Evaluation Course is flagged, not just first/last single-course Levels', () => {
    const root: INode = {
      id: 'root', identifier: 'root', name: 'LP', isFolder: true,
      children: [loadedLevel('lvl-mid', [loadedCourse('c1', 'Course'), loadedCourse('exam', EVALUATION_COURSE_CATEGORY)])],
    };

    const normalized = normalizeLearningPathTree(root);

    const [regular, exam] = normalized.children![0].children!;
    expect(regular.metadata?.isAssessmentCourse).toBeUndefined();
    expect(exam.metadata?.isAssessmentCourse).toBe(true);
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
// Every course fixture with skill tags carries a `framework` too — courses
// are resolved per-course now (getCourseSkillNames), so a tag with no
// framework to key it against would silently resolve to nothing.
const assessmentCourseWithSkills = (id: string, skills: string[]): INode =>
  course(id, { metadata: { isAssessmentCourse: true, framework: 'usf', skill: skills } });
const courseWithSkills = (id: string, skills: string[]): INode =>
  course(id, { metadata: { framework: 'usf', skill: skills } });
const byFrameworkId: SkillCategoryByFramework = { usf: { code: 'skill', terms: [] } };

describe('isAssessmentLevel', () => {
  it('is true only for a Level wrapping exactly one assessment-flagged course', () => {
    expect(isAssessmentLevel(level({ children: [assessmentCourse('a1')] }))).toBe(true);
    expect(isAssessmentLevel(level({ children: [course('c1')] }))).toBe(false);
    expect(isAssessmentLevel(level({ children: [] }))).toBe(false);
    expect(isAssessmentLevel(level({ children: [assessmentCourse('a1'), course('c1')] }))).toBe(false);
    expect(isAssessmentLevel(undefined)).toBe(false);
  });
});

describe('getLevelExamCourse', () => {
  it('finds the flagged course among mixed regular and exam children', () => {
    const lvl = level({ children: [course('c1'), assessmentCourse('a1'), course('c2')] });
    expect(getLevelExamCourse(lvl)?.id).toBe('a1');
  });

  it('returns undefined when there is no assessment-flagged course, or no Level', () => {
    expect(getLevelExamCourse(level({ children: [course('c1'), course('c2')] }))).toBeUndefined();
    expect(getLevelExamCourse(level({ children: [] }))).toBeUndefined();
    expect(getLevelExamCourse(undefined)).toBeUndefined();
  });

  it('does not require it to be the Level\'s only child — unlike isAssessmentLevel', () => {
    const lvl = level({ children: [assessmentCourse('a1'), course('c1'), course('c2')] });
    expect(getLevelExamCourse(lvl)?.id).toBe('a1');
    expect(isAssessmentLevel(lvl)).toBe(false); // shape-wise this is NOT a pre/post slot
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

describe('wouldBecomeAmbiguousSlot', () => {
  it('is true for an empty Level at index 0 or the last index', () => {
    const first = level({ id: 'first', children: [] });
    const mid = level({ id: 'mid', children: [] });
    const last = level({ id: 'last', children: [] });
    const levels = [first, mid, last];
    expect(wouldBecomeAmbiguousSlot(levels, first)).toBe(true);
    expect(wouldBecomeAmbiguousSlot(levels, last)).toBe(true);
  });

  it('is false for an empty Level in a middle position — a Level assessment there is not ambiguous', () => {
    const first = level({ id: 'first', children: [] });
    const mid = level({ id: 'mid', children: [] });
    const last = level({ id: 'last', children: [] });
    expect(wouldBecomeAmbiguousSlot([first, mid, last], mid)).toBe(false);
  });

  it('is false once the Level already has a course — a second course never reduces it to the ambiguous single-course shape', () => {
    const first = level({ id: 'first', children: [course('c1')] });
    expect(wouldBecomeAmbiguousSlot([first], first)).toBe(false);
  });

  it('a single-Level path\'s sole Level counts as both first and last, so it is still flagged while empty', () => {
    const only = level({ id: 'only', children: [] });
    expect(wouldBecomeAmbiguousSlot([only], only)).toBe(true);
  });
});

describe('getCourseFrameworkId / getCourseSkillNames', () => {
  it("resolves a course's own framework, single or multi-value", () => {
    expect(getCourseFrameworkId(course('c1', { metadata: { framework: 'usf' } }))).toBe('usf');
    expect(getCourseFrameworkId(course('c1', { metadata: { framework: ['usf', 'NCF'] } }))).toBe('usf');
    expect(getCourseFrameworkId(course('c1', {}))).toBeUndefined();
  });

  it("reads a course's skill tag under ITS OWN framework's resolved code — never a fixed field", () => {
    const ncfByFrameworkId: SkillCategoryByFramework = { NCF: { code: 'subject', terms: [] } };
    const course1 = course('c1', { metadata: { framework: 'NCF', subject: ['Physics'] } });
    expect(getCourseSkillNames(course1, ncfByFrameworkId)).toEqual(['Physics']);
  });

  it('returns nothing for an unrecognized (or missing) framework', () => {
    expect(getCourseSkillNames(course('c1', { metadata: { framework: 'unknown-fw', skill: ['Java'] } }), byFrameworkId)).toEqual([]);
    expect(getCourseSkillNames(course('c1', {}), byFrameworkId)).toEqual([]);
  });
});

describe('computeSkillsCovered', () => {
  it('unions the prior/outcome assessment skill tags with each content Level\'s selected skills', () => {
    const root = level({
      id: 'root',
      children: [
        level({ id: 'pre', children: [assessmentCourseWithSkills('a1', ['Python programming'])] }),
        level({ id: 'lvl1', metadata: { skills: ['Java'] }, children: [course('c1')] }),
        level({ id: 'lvl2', metadata: { skills: ['Java', 'SQL'] }, children: [course('c2')] }),
        level({ id: 'post', children: [assessmentCourseWithSkills('a2', ['SQL', 'Testing'])] }),
      ],
    });
    expect(computeSkillsCovered(root, byFrameworkId).sort()).toEqual(
      ['Java', 'Python programming', 'SQL', 'Testing'].sort(),
    );
  });

  it('never pulls skills from a content Level\'s linked courses, only its own metadata.skills field', () => {
    const root = level({
      id: 'root',
      children: [
        level({ id: 'lvl1', children: [courseWithSkills('c1', ['Should not leak'])] }),
      ],
    });
    expect(computeSkillsCovered(root, byFrameworkId)).toEqual([]);
  });

  it('returns an empty array without a root node', () => {
    expect(computeSkillsCovered(undefined, byFrameworkId)).toEqual([]);
    expect(computeSkillsCovered(level({ children: [] }), {})).toEqual([]);
  });

  it('reads a middle Level\'s OWN selected skills, not its Level-assessment course\'s tags, even though the shape matches a pre/post slot', () => {
    const root = level({
      id: 'root',
      children: [
        level({ id: 'l1' }),
        level({
          id: 'l2', metadata: { skills: ['Java'] },
          children: [assessmentCourseWithSkills('a1', ['Should not leak'])],
        }),
        level({ id: 'l3' }),
      ],
    });
    expect(computeSkillsCovered(root, byFrameworkId)).toEqual(['Java']);
  });
});

describe('computeUncoveredSkills', () => {
  it('flags a selected skill with zero linked course tagged for it', () => {
    const lvl = level({
      id: 'lvl1', metadata: { skills: ['Python programming', 'Java'] },
      children: [courseWithSkills('c1', ['Python programming'])],
    });
    expect(computeUncoveredSkills(lvl, ['Python programming', 'Java'], byFrameworkId)).toEqual(['Java']);
  });

  it('returns nothing once every selected skill has at least one covering course', () => {
    const lvl = level({
      id: 'lvl1', metadata: { skills: ['Python programming', 'Java'] },
      children: [
        courseWithSkills('c1', ['Python programming']),
        courseWithSkills('c2', ['Java']),
      ],
    });
    expect(computeUncoveredSkills(lvl, ['Python programming', 'Java'], byFrameworkId)).toEqual([]);
  });

  it("doesn't let redundant coverage of one skill mask another selected skill having none — a Level 'looks' populated with 2 courses while Java has zero coverage", () => {
    const lvl = level({
      id: 'lvl1', metadata: { skills: ['Python programming', 'Java'] },
      children: [
        courseWithSkills('c1', ['Python programming']),
        courseWithSkills('c2', ['Python programming']), // redundant with c1
      ],
    });
    expect(computeUncoveredSkills(lvl, ['Python programming', 'Java'], byFrameworkId)).toEqual(['Java']);
  });

  it('unions coverage across multiple courses under the same Level, even when tagged under different frameworks', () => {
    const ncfByFrameworkId: SkillCategoryByFramework = { ...byFrameworkId, NCF: { code: 'subject', terms: [] } };
    const lvl = level({
      id: 'lvl1', metadata: { skills: ['Python programming', 'Java', 'Physics'] },
      children: [
        courseWithSkills('c1', ['Python programming']),
        course('c2', { metadata: { framework: 'NCF', subject: ['Physics'] } }),
        courseWithSkills('c3', ['Java']),
      ],
    });
    expect(computeUncoveredSkills(lvl, ['Python programming', 'Java', 'Physics'], ncfByFrameworkId)).toEqual([]);
  });

  it('flags every selected skill when the Level has no courses at all', () => {
    const lvl = level({ id: 'lvl1', metadata: { skills: ['Python programming'] }, children: [] });
    expect(computeUncoveredSkills(lvl, ['Python programming'], byFrameworkId)).toEqual(['Python programming']);
  });

  it('returns an empty array with no level or no selected skills', () => {
    expect(computeUncoveredSkills(undefined, ['Java'], byFrameworkId)).toEqual([]);
    expect(computeUncoveredSkills(level({ children: [] }), [], byFrameworkId)).toEqual([]);
  });
});

describe('findLevelsWithOutOfScopeSkills', () => {
  it('returns content Levels with at least one selected skill outside the scope', () => {
    const root = level({
      id: 'root',
      children: [
        level({ id: 'lvl1', metadata: { skills: ['Java'] }, children: [course('c1')] }),
        level({ id: 'lvl2', metadata: { skills: ['Python programming'] }, children: [course('c2')] }),
      ],
    });
    const affected = findLevelsWithOutOfScopeSkills(root, ['Java']);
    expect(affected.map(l => l.id)).toEqual(['lvl2']);
  });

  it('excludes the pre/post assessment slots — their course tags are not a Level skill selection', () => {
    const root = level({
      id: 'root',
      children: [
        level({ id: 'pre', children: [assessmentCourseWithSkills('a1', ['Python programming'])] }),
        level({ id: 'lvl1', metadata: { skills: ['Java'] }, children: [course('c1')] }),
      ],
    });
    // 'Python programming' (the pre-slot's own course tag) is irrelevant here —
    // only lvl1's OWN selection ('Java') is checked against the scope.
    expect(findLevelsWithOutOfScopeSkills(root, ['Java']).map(l => l.id)).toEqual([]);
  });

  it('returns nothing without a root, or a non-empty scope', () => {
    const root = level({ id: 'root', children: [level({ id: 'lvl1', metadata: { skills: ['Java'] } })] });
    expect(findLevelsWithOutOfScopeSkills(undefined, ['Java'])).toEqual([]);
    expect(findLevelsWithOutOfScopeSkills(root, [])).toEqual([]); // empty scope = no constraint yet
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
        id: 'lvl1', metadata: { skills: ['Java'] },
        children: [courseWithSkills('c1', ['Java'])],
      }),
      level({ id: 'post', children: [assessmentCourseWithSkills('a2', ['SQL'])] }),
    ],
  });
}

describe('validateLearningPathStructure', () => {
  it('is clean for a fully-valid strict-policy path', () => {
    expect(validateLearningPathStructure(validPath(), byFrameworkId, [])).toEqual([]);
  });

  it('flags a missing policy', () => {
    const root = validPath();
    delete root.metadata!['policy'];
    expect(validateLearningPathStructure(root, byFrameworkId, []).map(i => i.code)).toContain('policyMissing');
  });

  it('requires a Prior Assessment only for adaptive ("Adaptive") — not strict, not priorLearning', () => {
    const noPrior = level({
      id: 'root', metadata: { policy: 'strict' },
      children: [
        level({ id: 'lvl1', metadata: { skills: ['Java'] }, children: [courseWithSkills('c1', ['Java'])] }),
        level({ id: 'post', children: [assessmentCourseWithSkills('a2', ['SQL'])] }),
      ],
    });
    expect(validateLearningPathStructure(noPrior, byFrameworkId, []).map(i => i.code)).not.toContain('priorAssessmentRequired');

    const adaptive = { ...noPrior, metadata: { policy: 'adaptive' } };
    expect(validateLearningPathStructure(adaptive, byFrameworkId, []).map(i => i.code)).toContain('priorAssessmentRequired');

    // priorLearning can skip on external evidence (a verified certificate or
    // prior course) "not the assessment alone" — the Prior Assessment stays
    // optional here, unlike adaptive which skips solely on its score.
    const priorLearning = { ...noPrior, metadata: { policy: 'priorLearning' } };
    expect(validateLearningPathStructure(priorLearning, byFrameworkId, []).map(i => i.code)).not.toContain('priorAssessmentRequired');
  });

  it("sees an unsaved policy change from treeCache, not just root.metadata — updateNode's flat patch lands there before a save mirrors it into metadata", () => {
    const noPrior = level({
      id: 'root', metadata: {}, // no policy committed to metadata yet
      children: [
        level({ id: 'lvl1', metadata: { skills: ['Java'] }, children: [courseWithSkills('c1', ['Java'])] }),
        level({ id: 'post', children: [assessmentCourseWithSkills('a2', ['SQL'])] }),
      ],
    });
    const treeCache = { root: { policy: 'adaptive' } };
    const issues = validateLearningPathStructure(noPrior, byFrameworkId, [], treeCache).map(i => i.code);
    expect(issues).toContain('priorAssessmentRequired');
    expect(issues).not.toContain('policyMissing');
  });

  it('does not require an Outcome Assessment — an empty post slot is not flagged', () => {
    const root = validPath();
    root.children = root.children!.slice(0, -1); // drop the post slot
    expect(validateLearningPathStructure(root, byFrameworkId, []).map(i => i.code)).not.toContain('outcomeAssessmentMissing');
  });

  it('flags a pre/post slot that is not exactly one assessment course', () => {
    const root = validPath();
    root.children![0].children!.push(course('extra')); // second child in the pre slot
    expect(validateLearningPathStructure(root, byFrameworkId, []).map(i => i.code)).toContain('slotNotPure');
  });

  it('does not flag slotNotPure for an ordinary content Level that just happens to sit first/last — no assessment course attached at all', () => {
    // No Prior/Outcome Assessment was ever added — every Level is regular
    // content. Position alone (index 0 / last) must not make this look like
    // a broken assessment slot; only a Level that HAS an assessment-flagged
    // course but isn't purely that one course should ever trigger this.
    const root = level({
      id: 'root', metadata: { policy: 'strict' },
      children: [
        level({ id: 'lvl1', metadata: { skills: ['Java'] }, children: [courseWithSkills('c1', ['Java']), courseWithSkills('c2', ['Java'])] }),
        level({ id: 'lvl2', metadata: { skills: ['SQL'] }, children: [courseWithSkills('c3', ['SQL'])] }),
      ],
    });
    expect(validateLearningPathStructure(root, byFrameworkId, []).map(i => i.code)).not.toContain('slotNotPure');
  });

  it('flags an empty content Level', () => {
    const root = validPath();
    root.children![1].children = [];
    const issues = validateLearningPathStructure(root, byFrameworkId, []);
    expect(issues.map(i => i.code)).toContain('emptyLevel');
    expect(issues.map(i => i.code)).not.toContain('levelMissingSkills'); // redundant with emptyLevel
  });

  it("also names the selected skill(s) an empty Level still needs a course for — not just 'no courses yet'", () => {
    const root = validPath();
    root.children![1].children = []; // lvl1 keeps its metadata.skills: ['Java'] selection
    const issues = validateLearningPathStructure(root, byFrameworkId, []);
    expect(issues.map(i => i.code)).toContain('emptyLevel');
    expect(issues.map(i => i.code)).toContain('levelSkillsUncovered');
    expect(issues.find(i => i.code === 'levelSkillsUncovered')?.message).toContain('Java');
  });

  it('flags a content Level with no selected skills', () => {
    const root = validPath();
    root.children![1].metadata = {};
    expect(validateLearningPathStructure(root, byFrameworkId, []).map(i => i.code)).toContain('levelMissingSkills');
  });

  it('flags a content Level whose selected skills fall outside the current scope', () => {
    const root = validPath();
    expect(validateLearningPathStructure(root, byFrameworkId, ['Python programming']).map(i => i.code))
      .toContain('levelSkillsOutOfScope');
    // Within scope: no issue.
    expect(validateLearningPathStructure(root, byFrameworkId, ['Java']).map(i => i.code))
      .not.toContain('levelSkillsOutOfScope');
  });

  it('is clean for a valid path where every selected skill has a covering course', () => {
    expect(validateLearningPathStructure(validPath(), byFrameworkId, []).map(i => i.code))
      .not.toContain('levelSkillsUncovered');
  });

  it('flags a content Level with a selected skill no linked course is tagged with', () => {
    const root = validPath();
    root.children![1].metadata = { skills: ['Java', 'Python programming'] }; // course c1 is only tagged 'Java'
    const issues = validateLearningPathStructure(root, byFrameworkId, []);
    expect(issues.map(i => i.code)).toContain('levelSkillsUncovered');
    expect(issues.find(i => i.code === 'levelSkillsUncovered')?.message).toContain('Python programming');
  });

  it('flags a linked course with no skill tag', () => {
    const root = validPath();
    root.children![1].children![0].metadata = {};
    expect(validateLearningPathStructure(root, byFrameworkId, []).map(i => i.code)).toContain('courseMissingSkillTag');
  });

  it("pairs courseMissingSkillTag with levelSkillsUncovered when that untagged course was the Level's only coverage — the two facts surface together rather than needing one message to explain the other", () => {
    const root = validPath();
    root.children![1].children![0].metadata = {}; // c1 loses its 'Java' tag — lvl1's only course
    const issues = validateLearningPathStructure(root, byFrameworkId, []).map(i => i.code);
    expect(issues).toContain('courseMissingSkillTag');
    expect(issues).toContain('levelSkillsUncovered');
  });

  it('flags a course that appears more than once in the path', () => {
    const root = validPath();
    root.children![1].children!.push(course('a1')); // same id as the prior-assessment course
    expect(validateLearningPathStructure(root, byFrameworkId, []).map(i => i.code)).toContain('duplicateCourse');
  });

  it('returns no issues for a rootless tree', () => {
    expect(validateLearningPathStructure(undefined, byFrameworkId, [])).toEqual([]);
  });
});

describe('revalidateAssessmentSlots', () => {
  beforeEach(() => {
    vi.mocked(fetchContentDetails).mockReset();
  });

  it('flags a slot whose course is no longer categorized Evaluation Course', async () => {
    vi.mocked(fetchContentDetails).mockResolvedValue({ primaryCategory: 'Course' } as never);
    const root = validPath();
    const issues = await revalidateAssessmentSlots(root);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every(i => i.code === 'slotCourseChanged')).toBe(true);
  });

  it('is clean when both slots still qualify', async () => {
    vi.mocked(fetchContentDetails).mockResolvedValue({ primaryCategory: EVALUATION_COURSE_CATEGORY } as never);
    expect(await revalidateAssessmentSlots(validPath())).toEqual([]);
  });

  it('skips slots that are not assessment Levels', async () => {
    const root = level({ id: 'root', children: [level({ id: 'lvl1', children: [course('c1')] })] });
    expect(await revalidateAssessmentSlots(root)).toEqual([]);
    expect(fetchContentDetails).not.toHaveBeenCalled();
  });
});
