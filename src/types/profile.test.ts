import { describe, it, expect } from 'vitest';
import { resolveEditorProfile, collectionProfile, learningPathProfile } from './profile';

describe('resolveEditorProfile', () => {
  it('resolves the learningPath profile for primaryCategory "Learning Path"', () => {
    expect(resolveEditorProfile({ config: { primaryCategory: 'Learning Path' } })).toBe(learningPathProfile);
  });

  it('resolves the collection profile for any other primaryCategory', () => {
    expect(resolveEditorProfile({ config: { primaryCategory: 'Course' } })).toBe(collectionProfile);
    expect(resolveEditorProfile({ config: { primaryCategory: 'Digital Textbook' } })).toBe(collectionProfile);
  });

  it('resolves the collection profile when primaryCategory is absent', () => {
    expect(resolveEditorProfile({ config: {} })).toBe(collectionProfile);
  });
});
