import { describe, it, expect } from 'vitest';
import { resolveSkillCategory, resolvePriorCourseFramework } from './useSkillCategory';
import type { INode } from '../types/editor';

describe('resolveSkillCategory', () => {
  it('resolves USF\'s "skill" category (it has the highest index)', () => {
    const categories = [
      { identifier: 'usf_industry', name: 'Industry', code: 'industry', index: 0, terms: [] },
      { identifier: 'usf_domain', name: 'Domain', code: 'domain', index: 1, terms: [] },
      { identifier: 'usf_skill', name: 'Skill', code: 'skill', index: 2, terms: [{ identifier: 't1', name: 'Python programming', code: 'python' }] },
    ];
    expect(resolveSkillCategory(categories)).toEqual({
      code: 'skill',
      terms: [{ identifier: 't1', name: 'Python programming', code: 'python' }],
    });
  });

  it('falls back to the highest-index category for a non-USF framework', () => {
    const categories = [
      { identifier: 'c_board', name: 'Board', code: 'board', index: 0 },
      { identifier: 'c_medium', name: 'Medium', code: 'medium', index: 1 },
      { identifier: 'c_topcat', name: 'Top', code: 'topcat', index: 5 },
    ];
    expect(resolveSkillCategory(categories)?.code).toBe('topcat');
  });

  it('defaults a missing terms array to empty', () => {
    expect(resolveSkillCategory([{ identifier: 'c1', name: 'Only', code: 'only', index: 0 }]))
      .toEqual({ code: 'only', terms: [] });
  });

  it('treats categories missing `index` as lower priority than any category with one', () => {
    const categories = [
      { identifier: 'c1', name: 'No index', code: 'noindex' },
      { identifier: 'c2', name: 'Has index', code: 'hasindex', index: 0 },
    ];
    expect(resolveSkillCategory(categories)?.code).toBe('hasindex');
  });

  it('returns null when there are no categories', () => {
    expect(resolveSkillCategory(undefined)).toBeNull();
    expect(resolveSkillCategory([])).toBeNull();
  });
});

describe('resolvePriorCourseFramework', () => {
  const lpRoot = (priorCourseMeta: Record<string, unknown>): INode => ({
    id: 'root', identifier: 'root', name: 'LP', isFolder: true,
    children: [{
      id: 'lvl-pre', identifier: 'lvl-pre', name: 'Pre', isFolder: true,
      children: [{
        id: 'prior', identifier: 'prior', name: 'Prior', isFolder: false, children: [],
        metadata: { isAssessmentCourse: true, ...priorCourseMeta },
      }],
    }],
  });

  it("returns the linked prior course's own framework — its skill tags live under that taxonomy", () => {
    expect(resolvePriorCourseFramework(lpRoot({ framework: 'usf' }))).toBe('usf');
    expect(resolvePriorCourseFramework(lpRoot({ framework: ['usf', 'NCF'] }))).toBe('usf');
  });

  it('returns undefined when no prior assessment is linked or it has no framework', () => {
    expect(resolvePriorCourseFramework(undefined)).toBeUndefined();
    expect(resolvePriorCourseFramework(lpRoot({}))).toBeUndefined();
    const noAssessment = lpRoot({ framework: 'usf' });
    delete noAssessment.children![0].children![0].metadata!['isAssessmentCourse'];
    expect(resolvePriorCourseFramework(noAssessment)).toBeUndefined();
  });
});
