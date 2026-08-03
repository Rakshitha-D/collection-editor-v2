import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isAssessmentCourse,
  checkAssessmentCourse,
  clearAssessmentCourseCache,
  isAssessmentLevel,
  getLevelRole,
  resolveOpenAssessmentSlot,
  canReorderLevel,
  canAddCourseToLevel,
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
