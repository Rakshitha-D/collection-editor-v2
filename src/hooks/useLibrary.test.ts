import { describe, it, expect } from 'vitest';
import { buildLpLibraryFilters, buildSearchFields, computeLibraryEmptyReason } from './useLibrary';
import { DEFAULT_SEARCH_FIELDS } from '../api/content';

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

  it("constrains every LP search — slot picker included — to the root's selected framework", () => {
    expect(buildLpLibraryFilters('pre', [], 'skill', 'usf')).toEqual({
      primaryCategory: ['Course'],
      framework: ['usf'],
    });
    expect(buildLpLibraryFilters(null, ['Java'], 'skill', 'usf')).toEqual({
      primaryCategory: ['Course'],
      framework: ['usf'],
      skill: ['Java'],
    });
  });
});

describe('buildSearchFields', () => {
  it('appends the resolved skill-category code and framework for the LP profile', () => {
    expect(buildSearchFields(true, 'skill')).toEqual([...DEFAULT_SEARCH_FIELDS, 'skill', 'framework']);
  });

  it('leaves the default fields untouched for the Collection profile', () => {
    expect(buildSearchFields(false, 'skill')).toBeUndefined();
  });

  it('leaves the default fields untouched when the skill category has not resolved yet', () => {
    expect(buildSearchFields(true, undefined)).toBeUndefined();
  });
});

describe('computeLibraryEmptyReason', () => {
  it('is null for the Collection profile, regardless of the other inputs', () => {
    expect(computeLibraryEmptyReason(false, undefined, false, null, [])).toBeNull();
    expect(computeLibraryEmptyReason(false, 'NCF', true, null, [])).toBeNull();
  });

  it('is noCurriculum when the LP root has no explicit Curriculum yet', () => {
    expect(computeLibraryEmptyReason(true, undefined, false, null, [])).toBe('noCurriculum');
    expect(computeLibraryEmptyReason(true, undefined, true, null, [])).toBe('noCurriculum');
  });

  it('is noSkills only on a content Level with a Curriculum set but no skills selected', () => {
    expect(computeLibraryEmptyReason(true, 'NCF', true, null, [])).toBe('noSkills');
  });

  it('is null on a content Level once skills are selected', () => {
    expect(computeLibraryEmptyReason(true, 'NCF', true, null, ['Java'])).toBeNull();
  });

  it('is null outside a content Level (root, or an assessment Level) even with no skills selected', () => {
    expect(computeLibraryEmptyReason(true, 'NCF', false, null, [])).toBeNull();
  });

  it('is null while filling the Prior/Outcome Assessment slot, regardless of skills selected', () => {
    expect(computeLibraryEmptyReason(true, 'NCF', true, 'pre', [])).toBeNull();
    expect(computeLibraryEmptyReason(true, 'NCF', true, 'post', [])).toBeNull();
  });
});
