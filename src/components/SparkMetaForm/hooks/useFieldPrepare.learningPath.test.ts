import { describe, it, expect } from 'vitest';
import { useFieldPrepare, STRATEGY_OPTIONS } from './useFieldPrepare';
import { learningPathProfile } from '../../../types/profile';
import type { IFrameworkDetails } from '../../../types/framework';

const fw: IFrameworkDetails = {};
const find = (fields: ReturnType<typeof useFieldPrepare>, code: string) => fields.find(f => f.code === code)!;

describe('LP root fallback fields (no category-definition form config yet)', () => {
  it('renders just the strategy field for an LP root instead of the Course BMGS skeleton', () => {
    const fields = useFieldPrepare([], {}, fw, true, { profile: learningPathProfile });
    expect(fields.map(f => f.code)).toEqual(['name', 'description', 'keywords', 'strategy']);
  });

  it('defaults strategy to Fixed (Strict) when unset, with friendly design labels as options', () => {
    const f = find(useFieldPrepare([], {}, fw, true, { profile: learningPathProfile }), 'strategy');
    expect(f.currentValue).toBe('Fixed');
    expect(f.options).toEqual(STRATEGY_OPTIONS);
    expect(f.required).toBe(true);
  });

  it('does not override an authored strategy value', () => {
    const f = find(useFieldPrepare([], { strategy: 'Diagnostic' }, fw, true, { profile: learningPathProfile }), 'strategy');
    expect(f.currentValue).toBe('Diagnostic');
  });

  it('is a no-op for the collection profile (no strategy field, unaffected field set)', () => {
    const fields = useFieldPrepare([], {}, fw, true, {});
    expect(fields.some(f => f.code === 'strategy')).toBe(false);
  });
});

describe('strategy field from an API category-definition form', () => {
  it('maps the schema\'s raw enum range through the design\'s friendly labels', () => {
    const cfg = [{
      code: 'strategy', label: 'Consumption policy', inputType: 'select',
      range: ['Fixed', 'Diagnostic', 'PriorLearning'],
    }];
    const f = find(useFieldPrepare(cfg, {}, fw, true, {}), 'strategy');
    expect(f.options).toEqual(STRATEGY_OPTIONS);
  });
});
