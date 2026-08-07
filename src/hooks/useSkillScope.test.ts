import { describe, it, expect } from 'vitest';
import { resolveSkillScope } from './useSkillScope';
import type { INode } from '../types/editor';

const skillCategory = {
  code: 'skill',
  terms: [
    { identifier: 't1', name: 'Python programming', code: 'python' },
    { identifier: 't2', name: 'Java', code: 'java' },
    { identifier: 't3', name: 'SQL', code: 'sql' },
  ],
};

const priorCourse = (skills: string[]): INode => ({
  id: 'course-1', identifier: 'course-1', name: 'Prior course', isFolder: false, children: [],
  metadata: { isAssessmentCourse: true, skill: skills },
});

const rootWithPrior = (skills: string[]): INode => ({
  id: 'root', identifier: 'root', name: 'LP', isFolder: true,
  children: [
    { id: 'pre', identifier: 'pre', name: 'Prior Assessment', isFolder: true, children: [priorCourse(skills)] },
  ],
});

const rootWithoutPrior = (): INode => ({
  id: 'root', identifier: 'root', name: 'LP', isFolder: true,
  children: [
    { id: 'lvl1', identifier: 'lvl1', name: 'Level 1', isFolder: true, children: [] },
  ],
});

describe('resolveSkillScope', () => {
  it("uses the prior assessment's skill tags as the sole scope when one is linked", () => {
    expect(resolveSkillScope(rootWithPrior(['Python programming', 'Java']), skillCategory, {}))
      .toEqual({ scope: ['Python programming', 'Java'], source: 'prior' });
  });

  it('falls back to the full skill catalog when no prior assessment is linked', () => {
    expect(resolveSkillScope(rootWithoutPrior(), skillCategory, {}))
      .toEqual({ scope: ['Python programming', 'Java', 'SQL'], source: 'manual' });
  });

  it('falls back to manual when there is no root node yet', () => {
    expect(resolveSkillScope(undefined, skillCategory, {}).source).toBe('manual');
  });

  it('returns an empty manual scope when the skill category cannot be resolved', () => {
    expect(resolveSkillScope(rootWithPrior(['Python programming']), null, {}))
      .toEqual({ scope: [], source: 'manual' });
  });

  it("prefers the treeCache's uncommitted edit over the course's loaded metadata", () => {
    const root = rootWithPrior(['Python programming']);
    const priorCourseId = root.children![0].children![0].id;
    const cache = { [priorCourseId]: { skill: ['Java', 'SQL'] } };
    expect(resolveSkillScope(root, skillCategory, cache)).toEqual({ scope: ['Java', 'SQL'], source: 'prior' });
  });

  it('never derives scope from a regular (non-assessment) Level at index 0', () => {
    const root: INode = {
      id: 'root', identifier: 'root', name: 'LP', isFolder: true,
      children: [
        {
          id: 'lvl1', identifier: 'lvl1', name: 'Level 1', isFolder: true,
          children: [{ id: 'c1', identifier: 'c1', name: 'Course', isFolder: false, children: [], metadata: { skill: ['Should not leak'] } }],
        },
      ],
    };
    expect(resolveSkillScope(root, skillCategory, {}).source).toBe('manual');
  });
});
