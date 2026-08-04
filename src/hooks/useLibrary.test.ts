import { describe, it, expect } from 'vitest';
import { buildLpLibraryFilters } from './useLibrary';

describe('buildLpLibraryFilters', () => {
  it('filling the pre/post slot searches Courses with no competency constraint', () => {
    expect(buildLpLibraryFilters('pre', [], 'skill')).toEqual({ primaryCategory: ['Course'] });
    expect(buildLpLibraryFilters('post', ['Java'], 'skill')).toEqual({ primaryCategory: ['Course'] });
  });

  it('shows every Course, unfiltered, when browsing a Level with no skills selected yet', () => {
    expect(buildLpLibraryFilters(null, [], 'skill')).toEqual({ primaryCategory: ['Course'] });
  });

  it('filters Courses by the selected skills under the resolved skill-category code', () => {
    expect(buildLpLibraryFilters(null, ['Python programming', 'Java'], 'skill')).toEqual({
      primaryCategory: ['Course'],
      skill: ['Python programming', 'Java'],
    });
  });

  it('omits the skill filter key when the skill category has not resolved yet', () => {
    expect(buildLpLibraryFilters(null, ['Java'], undefined)).toEqual({ primaryCategory: ['Course'] });
  });
});
