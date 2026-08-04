import { describe, it, expect } from 'vitest';
import { useFieldPrepare, POLICY_OPTIONS } from './useFieldPrepare';
import { learningPathProfile } from '../../../types/profile';
import type { IFrameworkDetails } from '../../../types/framework';

const fw: IFrameworkDetails = {};
const find = (fields: ReturnType<typeof useFieldPrepare>, code: string) => fields.find(f => f.code === code)!;

describe('LP root fallback fields (no category-definition form config yet)', () => {
  it('renders just the policy field for an LP root instead of the Course BMGS skeleton', () => {
    const fields = useFieldPrepare([], {}, fw, true, { profile: learningPathProfile });
    expect(fields.map(f => f.code)).toEqual(['name', 'description', 'keywords', 'policy']);
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
    const f = find(useFieldPrepare(cfg, {}, fw, true, {}), 'policy');
    expect(f.options).toEqual(POLICY_OPTIONS);
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
