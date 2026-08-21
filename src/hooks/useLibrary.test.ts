import { describe, it, expect } from 'vitest';
import {
  groupSkillsByCode,
  buildLpLibraryFilterVariants,
  buildSearchFields,
  computeLibraryEmptyReason,
} from './useLibrary';
import { DEFAULT_SEARCH_FIELDS } from '../api/content';
import type { SkillCatalogEntry } from './useSkillCatalog';

const catalog: SkillCatalogEntry[] = [
  { name: 'Python programming', frameworkId: 'usf', categoryCode: 'skill' },
  { name: 'Java', frameworkId: 'usf', categoryCode: 'skill' },
  { name: 'Physics', frameworkId: 'NCF', categoryCode: 'subject' },
];

describe('groupSkillsByCode', () => {
  it("in 'prior' scope, groups every selected skill under the ONE prior-course-resolved code — no catalog lookup needed", () => {
    expect(groupSkillsByCode(['Python programming', 'Java'], 'prior', 'skill', [])).toEqual({
      skill: ['Python programming', 'Java'],
    });
  });

  it("returns nothing in 'prior' scope when the prior course has no resolvable code", () => {
    expect(groupSkillsByCode(['Java'], 'prior', undefined, catalog)).toEqual({});
  });

  it("in 'manual' scope, groups by looking up each name's owning code(s) in the catalog", () => {
    expect(groupSkillsByCode(['Python programming', 'Physics'], 'manual', undefined, catalog)).toEqual({
      skill: ['Python programming'],
      subject: ['Physics'],
    });
  });

  it('groups multiple names under the same code together', () => {
    expect(groupSkillsByCode(['Python programming', 'Java'], 'manual', undefined, catalog)).toEqual({
      skill: ['Python programming', 'Java'],
    });
  });

  it('returns an empty map with no selected skills', () => {
    expect(groupSkillsByCode([], 'manual', undefined, catalog)).toEqual({});
  });
});

describe('buildLpLibraryFilterVariants', () => {
  it('filling the pre/post slot searches Courses with no competency constraint — exactly one variant', () => {
    expect(buildLpLibraryFilterVariants('pre', {})).toEqual([{ primaryCategory: ['Course'] }]);
    expect(buildLpLibraryFilterVariants('post', { skill: ['Java'] })).toEqual([{ primaryCategory: ['Course'] }]);
  });

  it('shows every Course, unfiltered, when browsing a Level with no skills selected yet', () => {
    expect(buildLpLibraryFilterVariants(null, {})).toEqual([{ primaryCategory: ['Course'] }]);
  });

  it('returns one variant, filtered by that code, when every selected skill belongs to a single code', () => {
    expect(buildLpLibraryFilterVariants(null, { skill: ['Python programming', 'Java'] })).toEqual([
      { primaryCategory: ['Course'], skill: ['Python programming', 'Java'] },
    ]);
  });

  it('returns one variant PER code when the selection spans multiple frameworks', () => {
    const variants = buildLpLibraryFilterVariants(null, { skill: ['Python programming'], subject: ['Physics'] });
    expect(variants).toHaveLength(2);
    expect(variants).toContainEqual({ primaryCategory: ['Course'], skill: ['Python programming'] });
    expect(variants).toContainEqual({ primaryCategory: ['Course'], subject: ['Physics'] });
  });
});

describe('buildSearchFields', () => {
  it('appends every known skill-category code and framework for the LP profile', () => {
    expect(buildSearchFields(true, ['skill', 'subject'])).toEqual([...DEFAULT_SEARCH_FIELDS, 'skill', 'subject', 'framework']);
  });

  it('de-dupes repeated codes', () => {
    expect(buildSearchFields(true, ['skill', 'skill'])).toEqual([...DEFAULT_SEARCH_FIELDS, 'skill', 'framework']);
  });

  it('leaves the default fields untouched for the Collection profile', () => {
    expect(buildSearchFields(false, ['skill'])).toBeUndefined();
  });

  it('leaves the default fields untouched when no skill categories have resolved yet', () => {
    expect(buildSearchFields(true, [])).toBeUndefined();
  });
});

describe('computeLibraryEmptyReason', () => {
  it('is null for the Collection profile, regardless of the other inputs', () => {
    expect(computeLibraryEmptyReason(false, false, null, [])).toBeNull();
    expect(computeLibraryEmptyReason(false, true, null, [])).toBeNull();
  });

  it('is noSkills on a content Level with no skills selected', () => {
    expect(computeLibraryEmptyReason(true, true, null, [])).toBe('noSkills');
  });

  it('is null on a content Level once skills are selected', () => {
    expect(computeLibraryEmptyReason(true, true, null, ['Java'])).toBeNull();
  });

  it('is null outside a content Level (root, or an assessment Level) even with no skills selected', () => {
    expect(computeLibraryEmptyReason(true, false, null, [])).toBeNull();
  });

  it('is null while filling the Prior/Outcome Assessment slot, regardless of skills selected', () => {
    expect(computeLibraryEmptyReason(true, true, 'pre', [])).toBeNull();
    expect(computeLibraryEmptyReason(true, true, 'post', [])).toBeNull();
  });
});
