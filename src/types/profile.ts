import type { IConfig } from './editor';

// Editor profile abstraction — resolves per-instance behavior (unit category,
// depth, linked-leaf rules, feature gating) from config.config.primaryCategory
// so components read `editorProfile` instead of branching on primaryCategory.
export interface IEditorProfile {
  key: 'collection' | 'learningPath' | 'evaluationCourse';
  /** primaryCategory + contentType written for new folder nodes */
  unitPrimaryCategory: string;
  unitContentType: string;
  /** i18n key for the unit label ('unit' | 'level') */
  unitLabelKey: string;
  defaultUnitName: string;
  maxDepth: number;
  /** leaves are linked published objects (e.g. Courses), not authored content */
  linkedLeavesOnly: boolean;
  leafPrimaryCategories: string[];
  /** structural roles derived from unit index (e.g. pre/post assessment slots) */
  derivedRoles: boolean;
  /** competency-scoped library search */
  competencyScoped: boolean;
  /** When set, the Library's addable content is restricted to exactly these
   *  primaryCategory values, at every depth in the course (not just root) —
   *  used for Evaluation Courses (prior/post assessment and level exam
   *  courses), whose content must be Question Sets or ECML assessment
   *  content only, never regular course material. */
  restrictedContentCategories?: string[];
  features: {
    csvUpload: boolean;
    dialcodes: boolean;
    pageNumbers: boolean;
    bulkUpload: boolean;
    collaborators: boolean;
  };
}

export const collectionProfile: IEditorProfile = {
  key: 'collection',
  unitPrimaryCategory: 'Course Unit',
  unitContentType: 'CourseUnit',
  unitLabelKey: 'unit',
  defaultUnitName: 'Untitled Unit',
  maxDepth: 4,
  linkedLeavesOnly: false,
  leafPrimaryCategories: [],
  derivedRoles: false,
  competencyScoped: false,
  features: { csvUpload: true, dialcodes: true, pageNumbers: true, bulkUpload: true, collaborators: true },
};

export const learningPathProfile: IEditorProfile = {
  key: 'learningPath',
  unitPrimaryCategory: 'Level',
  unitContentType: 'Level',
  unitLabelKey: 'level',
  defaultUnitName: 'Untitled Level',
  maxDepth: 1,
  linkedLeavesOnly: true,
  leafPrimaryCategories: ['Course'],
  derivedRoles: true,
  competencyScoped: true,
  features: { csvUpload: false, dialcodes: false, pageNumbers: false, bulkUpload: false, collaborators: false },
};

// Otherwise a normal Course — units, drag/drop, standard depth — just with
// its addable content restricted to assessment-only material. Not a distinct
// structural profile like learningPath; everything but the Library filter
// behaves exactly like collectionProfile.
export const evaluationCourseProfile: IEditorProfile = {
  ...collectionProfile,
  key: 'evaluationCourse',
  restrictedContentCategories: ['Practice Question Set', 'Course Assessment'],
};

export function resolveEditorProfile(config: { config: Pick<IConfig, 'primaryCategory'> }): IEditorProfile {
  switch (config.config.primaryCategory) {
    case 'Learning Path': return learningPathProfile;
    case 'Evaluation Course': return evaluationCourseProfile;
    default: return collectionProfile;
  }
}
