import { readCourseHierarchy } from '../api/hierarchy';

export interface HierarchyLeafLike {
  objectType?: string;
  mimeType?: string;
  children?: HierarchyLeafLike[];
}

const QUML_QUESTIONSET_MIMETYPE = 'application/vnd.sunbird.questionset';

/**
 * True iff the course has at least one leaf and every leaf is a QuML
 * QuestionSet — legacy ECML assessment resources
 * (application/vnd.ekstep.ecml-archive) do NOT qualify even though they're
 * historically labelled "assessment" content. An empty course (no leaves at
 * all) is not an assessment course.
 */
export function isAssessmentCourse(course: HierarchyLeafLike): boolean {
  let hasLeaf = false;
  let allQuestionSets = true;

  function walk(nodes: HierarchyLeafLike[]) {
    for (const node of nodes) {
      const children = node.children ?? [];
      if (children.length > 0) {
        walk(children);
        continue;
      }
      hasLeaf = true;
      const isQuml = node.objectType === 'QuestionSet' && node.mimeType === QUML_QUESTIONSET_MIMETYPE;
      if (!isQuml) allQuestionSets = false;
    }
  }

  walk(course.children ?? []);
  return hasLeaf && allQuestionSets;
}

// Per-session cache — the check requires a full course-hierarchy read, so
// avoid re-fetching for a course already validated (e.g. re-opening the same
// pre/post slot picker, or the Phase 5 publish-time re-check).
const assessmentCourseCache = new Map<string, boolean>();

export async function checkAssessmentCourse(courseId: string): Promise<boolean> {
  if (assessmentCourseCache.has(courseId)) return assessmentCourseCache.get(courseId)!;
  const course = await readCourseHierarchy(courseId);
  const result = isAssessmentCourse(course as HierarchyLeafLike);
  assessmentCourseCache.set(courseId, result);
  return result;
}

export function clearAssessmentCourseCache(): void {
  assessmentCourseCache.clear();
}
