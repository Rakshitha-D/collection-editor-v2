import { describe, it, expect } from 'vitest';
import { resolveEditorProfile, collectionProfile, learningPathProfile, evaluationCourseProfile } from './profile';

describe('resolveEditorProfile', () => {
  it('resolves the learningPath profile for primaryCategory "Learning Path"', () => {
    expect(resolveEditorProfile({ config: { primaryCategory: 'Learning Path' } })).toBe(learningPathProfile);
  });

  it('resolves the evaluationCourse profile for primaryCategory "Evaluation Course"', () => {
    expect(resolveEditorProfile({ config: { primaryCategory: 'Evaluation Course' } })).toBe(evaluationCourseProfile);
  });

  it('resolves the collection profile for any other primaryCategory', () => {
    expect(resolveEditorProfile({ config: { primaryCategory: 'Course' } })).toBe(collectionProfile);
    expect(resolveEditorProfile({ config: { primaryCategory: 'Digital Textbook' } })).toBe(collectionProfile);
  });

  it('resolves the collection profile when primaryCategory is absent', () => {
    expect(resolveEditorProfile({ config: {} })).toBe(collectionProfile);
  });
});

describe('evaluationCourseProfile', () => {
  it('restricts addable content to exactly Practice Question Set and Course Assessment', () => {
    expect(evaluationCourseProfile.restrictedContentCategories).toEqual(['Practice Question Set', 'Course Assessment']);
  });

  it('is otherwise a normal Course — same unit/depth/feature shape as collectionProfile', () => {
    const { restrictedContentCategories: _omit, key: _key, ...rest } = evaluationCourseProfile;
    const { key: _collectionKey, ...collectionRest } = collectionProfile;
    expect(rest).toEqual(collectionRest);
  });

  it('does not restrict content for the plain collection or learningPath profiles', () => {
    expect(collectionProfile.restrictedContentCategories).toBeUndefined();
    expect(learningPathProfile.restrictedContentCategories).toBeUndefined();
  });
});
