import { describe, it, expect } from 'vitest';
import { useFieldPrepare, POLICY_OPTIONS } from './useFieldPrepare';
import { learningPathProfile } from '../../../types/profile';
import type { IFrameworkDetails } from '../../../types/framework';

const fw: IFrameworkDetails = {};
const find = (fields: ReturnType<typeof useFieldPrepare>, code: string) => fields.find(f => f.code === code)!;

describe('LP root fallback fields (no category-definition form config yet)', () => {
  it('renders framework (Curriculum) + policy for an LP root instead of the Course BMGS skeleton', () => {
    const fields = useFieldPrepare([], {}, fw, true, { profile: learningPathProfile });
    expect(fields.map(f => f.code)).toEqual(['name', 'description', 'keywords', 'framework', 'policy']);
  });

  it('defaults policy to Fixed (Strict) when unset, with friendly design labels as options', () => {
    const f = find(useFieldPrepare([], {}, fw, true, { profile: learningPathProfile }), 'policy');
    expect(f.currentValue).toBe('Fixed');
    expect(f.options).toEqual(POLICY_OPTIONS);
    expect(f.required).toBe(true);
  });

  it('does not override an authored policy value', () => {
    const f = find(useFieldPrepare([], { policy: 'Diagnostic' }, fw, true, { profile: learningPathProfile }), 'policy');
    expect(f.currentValue).toBe('Diagnostic');
  });

  it('is a no-op for the collection profile (no policy field, unaffected field set)', () => {
    const fields = useFieldPrepare([], {}, fw, true, {});
    expect(fields.some(f => f.code === 'policy')).toBe(false);
  });
});

describe('policy field from an API category-definition form', () => {
  it('maps the schema\'s raw enum range through the design\'s friendly labels', () => {
    const cfg = [{
      code: 'policy', label: 'Consumption policy', inputType: 'select',
      range: ['Fixed', 'Diagnostic', 'PriorLearning'],
    }];
    const f = find(useFieldPrepare(cfg, {}, fw, true, { profile: learningPathProfile }), 'policy');
    expect(f.options).toEqual(POLICY_OPTIONS);
  });

  it('leaves a policy-coded field\'s options untouched outside the LP profile — a future/unrelated category could reuse the code', () => {
    const cfg = [{
      code: 'policy', label: 'Consumption policy', inputType: 'select',
      range: ['Fixed', 'Diagnostic', 'PriorLearning'],
    }];
    const f = find(useFieldPrepare(cfg, {}, fw, true, {}), 'policy');
    expect(f.options).not.toEqual(POLICY_OPTIONS);
    expect(f.options).toEqual([
      { label: 'Fixed', value: 'Fixed' },
      { label: 'Diagnostic', value: 'Diagnostic' },
      { label: 'PriorLearning', value: 'PriorLearning' },
    ]);
  });

  it('drops any target* framework field for the LP profile, defensively (targetFWType: [])', () => {
    const cfg = [
      { code: 'policy', label: 'Consumption policy', inputType: 'select', range: ['Fixed', 'Diagnostic', 'PriorLearning'] },
      { code: 'targetBoardIds', label: 'Board/Syllabus of the audience', inputType: 'select' },
      { code: 'targetMediumIds', label: 'Medium(s) of the audience', inputType: 'multiselect' },
    ];
    const fields = useFieldPrepare(cfg, {}, fw, true, { profile: learningPathProfile });
    expect(fields.map(f => f.code)).toEqual(['policy']);
  });
});

describe('LP dynamic Curriculum section (adaptLpCurriculumFields via useFieldPrepare)', () => {
  const usf: IFrameworkDetails = {
    organisationFramework: {
      identifier: 'usf', name: 'USF', code: 'usf',
      categories: [
        { identifier: 'usf_skill', name: 'Skill', code: 'skill', index: 2, terms: [{ identifier: 't1', name: 'Python programming', code: 'python' }] },
        { identifier: 'usf_industry', name: 'Industry', code: 'industry', index: 0, terms: [{ identifier: 't2', name: 'IT', code: 'it' }] },
        { identifier: 'usf_domain', name: 'Domain', code: 'domain', index: 1, terms: [{ identifier: 't3', name: 'Data', code: 'data' }] },
      ],
    },
  };
  const ncf: IFrameworkDetails = {
    organisationFramework: {
      identifier: 'NCF', name: 'NCF', code: 'NCF',
      categories: [
        { identifier: 'ncf_board', name: 'Board', code: 'board', index: 1, terms: [] },
        { identifier: 'ncf_medium', name: 'Medium', code: 'medium', index: 2, terms: [] },
        { identifier: 'ncf_grade', name: 'Grade Level', code: 'gradeLevel', index: 3, terms: [] },
        { identifier: 'ncf_subject', name: 'Subject', code: 'subject', index: 4, terms: [] },
      ],
    },
  };

  it('renders USF categories in index order after the Curriculum selector, excluding the skill category', () => {
    const fields = useFieldPrepare([], {}, usf, true, { profile: learningPathProfile });
    expect(fields.map(f => f.code)).toEqual(['name', 'description', 'keywords', 'framework', 'industry', 'domain', 'policy']);
    expect(fields.find(f => f.code === 'industry')!.options).toEqual([{ label: 'IT', value: 'IT' }]);
  });

  it('adapts to a K-12 framework too — NCF shows board/medium/gradeLevel and excludes subject (its skill-equivalent)', () => {
    const fields = useFieldPrepare([], {}, ncf, true, { profile: learningPathProfile });
    expect(fields.map(f => f.code)).toEqual(['name', 'description', 'keywords', 'framework', 'board', 'medium', 'gradeLevel', 'policy']);
  });

  it('drops static OCD category fields whose codes are missing from the selected framework', () => {
    const cfg = [
      { code: 'framework', label: 'Curriculum', inputType: 'framework' },
      { code: 'industry', label: 'Industry', inputType: 'multiSelect', sourceCategory: 'industry' },
      { code: 'domain', label: 'Domain', inputType: 'multiSelect', sourceCategory: 'domain' },
    ];
    const fields = useFieldPrepare(cfg, {}, ncf, true, { profile: learningPathProfile });
    // usf codes vanish under NCF; NCF's own non-skill categories render instead
    expect(fields.map(f => f.code)).toEqual(['framework', 'board', 'medium', 'gradeLevel']);
  });

  it('leaves the field list untouched while the framework read is still in flight', () => {
    const fields = useFieldPrepare([], {}, {}, true, { profile: learningPathProfile });
    expect(fields.map(f => f.code)).toEqual(['name', 'description', 'keywords', 'framework', 'policy']);
  });

  it('synthesizes the Curriculum selector when a backend form config lacks a framework field', () => {
    // A Course-shaped category-definition form: BMGS fields, no framework.
    const cfg = [
      { code: 'name', label: 'Name', inputType: 'text' },
      { code: 'board', label: 'Board', inputType: 'select' },
      { code: 'medium', label: 'Medium', inputType: 'multiSelect' },
      { code: 'gradeLevel', label: 'Grade Level', inputType: 'multiSelect' },
      { code: 'subject', label: 'Subject', inputType: 'multiSelect' },
    ];
    const fields = useFieldPrepare(cfg, {}, ncf, true, { profile: learningPathProfile });
    // framework lands ahead of the category fields; subject (NCF's
    // skill-equivalent) is dropped; every curriculum field shares one section.
    expect(fields.map(f => f.code)).toEqual(['name', 'framework', 'board', 'medium', 'gradeLevel']);
    const sections = fields.filter(f => f.code !== 'name').map(f => f.section);
    expect(new Set(sections).size).toBe(1);
  });
});
