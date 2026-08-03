import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isAssessmentCourse, checkAssessmentCourse, clearAssessmentCourseCache } from './lpStructure';
import { readCourseHierarchy } from '../api/hierarchy';

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
