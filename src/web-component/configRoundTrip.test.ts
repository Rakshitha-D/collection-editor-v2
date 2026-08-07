import { describe, it, expect } from 'vitest';
import { resolveEditorProfile, learningPathProfile } from '../types/profile';
import type { IEditorConfig } from '../types/editor';

// Covers only the JSON round-trip itself — NOT register.ts's actual
// `config: 'json'` web-component prop wiring (`react-to-webcomponent`
// parsing an attribute string and passing the result to CollectionEditor).
// This repo has no jsdom/DOM-render test setup yet (see testing-requirements
// conventions), so a real custom-element round-trip isn't covered anywhere.
describe('resolveEditorProfile survives a JSON stringify/parse round-trip (as config="json" would produce)', () => {
  it('still resolves the learningPath profile after a JSON stringify/parse round-trip', () => {
    const lpConfig: IEditorConfig = {
      context: {
        authToken: '', userId: 'u1', sid: 's1', did: 'd1', channel: 'ch1',
        pdata: { id: 'test', ver: '1.0' }, env: 'collection_editor',
        contentId: 'do_lp_1',
      },
      config: {
        mode: 'edit',
        objectType: 'Collection',
        primaryCategory: 'Learning Path',
      },
    };

    const roundTripped = JSON.parse(JSON.stringify(lpConfig)) as IEditorConfig;
    expect(resolveEditorProfile(roundTripped)).toBe(learningPathProfile);
  });
});
