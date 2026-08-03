import { describe, it, expect } from 'vitest';
import { resolveEditorProfile, learningPathProfile } from '../types/profile';
import type { IEditorConfig } from '../types/editor';

describe('Learning Path config round-trips through the web component\'s config="json" prop', () => {
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
