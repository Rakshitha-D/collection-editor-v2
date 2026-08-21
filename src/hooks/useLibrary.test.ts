import { describe, it, expect } from 'vitest';
import { buildLpLibraryFilters, buildSearchFields, computeLibraryEmptyReason } from './useLibrary';
import { DEFAULT_SEARCH_FIELDS } from '../api/content';

describe('buildLpLibraryFilters', () => {
  it('filling the pre/post slot searches Evaluation Course with no competency constraint', () => {
    expect(buildLpLibraryFilters('pre', true, [], 'skill')).toEqual({ primaryCategory: ['Evaluation Course'] });
    expect(buildLpLibraryFilters('post', true, ['Java'], 'skill')).toEqual({ primaryCategory: ['Evaluation Course'] });
  });

  it('picking a Level Exam course (isPickingEvaluationCourse, no slot) still applies the skill-code filter', () => {
    expect(buildLpLibraryFilters(null, true, [], 'skill')).toEqual({ primaryCategory: ['Evaluation Course'] });
    expect(buildLpLibraryFilters(null, true, ['Java'], 'skill')).toEqual({
      primaryCategory: ['Evaluation Course'],
      skill: ['Java'],
    });
  });

  it('shows every Course, unfiltered, when browsing a Level with no skills selected yet', () => {
    expect(buildLpLibraryFilters(null, false, [], 'skill')).toEqual({ primaryCategory: ['Course'] });
  });

  it('filters Courses by the selected skills under the resolved skill-category code', () => {
    expect(buildLpLibraryFilters(null, false, ['Python programming', 'Java'], 'skill')).toEqual({
      primaryCategory: ['Course'],
      skill: ['Python programming', 'Java'],
    });
  });

  it('omits the skill filter key when the skill category has not resolved yet', () => {
    expect(buildLpLibraryFilters(null, false, ['Java'], undefined)).toEqual({ primaryCategory: ['Course'] });
  });

  it("constrains every LP search — slot picker included — to the root's selected framework", () => {
    expect(buildLpLibraryFilters('pre', true, [], 'skill', 'usf')).toEqual({
      primaryCategory: ['Evaluation Course'],
      framework: ['usf'],
    });
    expect(buildLpLibraryFilters(null, false, ['Java'], 'skill', 'usf')).toEqual({
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

  it('is null with no Curriculum while picking an Evaluation Course for a slot/Level Exam — that course defines the scope, not the other way around', () => {
    expect(computeLibraryEmptyReason(true, undefined, false, 'pre', [], true)).toBeNull();
    expect(computeLibraryEmptyReason(true, undefined, true, null, [], true)).toBeNull();
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
