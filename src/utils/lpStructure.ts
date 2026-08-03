import { readCourseHierarchy } from '../api/hierarchy';
import type { INode } from '../types/editor';

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

// ---------------------------------------------------------------------------
// Structural rules — Levels are the LP's only direct children of root.
// Roles are derived from position + content, never stored on the node.
// ---------------------------------------------------------------------------

export type LevelRole = 'pre' | 'post' | 'levelAssessment' | 'content';

// A Level "is" an assessment Level once it wraps exactly one course flagged
// isAssessmentCourse (set by the linking flow after the Phase 1 hierarchy
// check) — it never holds anything else (doc: "assessment Levels contain
// exactly the one assessment course").
export function isAssessmentLevel(level: INode | undefined): boolean {
  const children = level?.children ?? [];
  return children.length === 1 && !!children[0]?.metadata?.['isAssessmentCourse'];
}

/**
 * getLevelRole(levelIndex, levelCount, hasAssessmentCourse) → role.
 * Level[0] wrapping an assessment course is Prior/diagnostic ("pre");
 * Level[levelCount-1] wrapping one is Outcome/summative ("post"); an
 * assessment course inside any other Level is a Level assessment; anything
 * else is a regular content Level. When levelCount === 1 the sole Level is
 * treated as "pre" (index-0 check wins the tie) rather than "post".
 */
export function getLevelRole(
  levelIndex: number,
  levelCount: number,
  hasAssessmentCourse: boolean,
): LevelRole {
  if (!hasAssessmentCourse) return 'content';
  if (levelIndex === 0) return 'pre';
  if (levelIndex === levelCount - 1) return 'post';
  return 'levelAssessment';
}

/**
 * Which pre/post assessment slot (if any) is open to receive a newly-linked
 * assessment course, given root's current Level children. Pre is checked
 * first, so a lone empty path always fills "pre" before "post" — matching
 * getLevelRole's tie-break for levelCount === 1. Returns null once both
 * slots are already wrapping an assessment course.
 */
export function resolveOpenAssessmentSlot(levels: INode[]): 'pre' | 'post' | null {
  const preFilled = levels.length > 0 && isAssessmentLevel(levels[0]);
  if (!preFilled) return 'pre';
  const postFilled = levels.length > 1 && isAssessmentLevel(levels[levels.length - 1]);
  if (!postFilled) return 'post';
  return null;
}

/**
 * Guards reorder of root's direct Level children: the pre-assessment Level
 * (if any) must stay pinned at index 0 and the post-assessment Level (if any)
 * must stay pinned at the last index; reordering is only free for the
 * content Levels between them. Simulates the same splice-based move
 * `reorderInParent` performs and checks the pinned Levels didn't shift,
 * rather than hand-deriving index-shift arithmetic.
 */
export function canReorderLevel(levels: INode[], fromIndex: number, toIndex: number): boolean {
  if (fromIndex < 0 || fromIndex >= levels.length) return true;
  const preLevel = isAssessmentLevel(levels[0]) ? levels[0] : null;
  const postLevel = levels.length > 1 && isAssessmentLevel(levels[levels.length - 1])
    ? levels[levels.length - 1]
    : null;
  if (!preLevel && !postLevel) return true;

  const simulated = [...levels];
  const [moved] = simulated.splice(fromIndex, 1);
  simulated.splice(toIndex, 0, moved);

  if (preLevel && simulated[0] !== preLevel) return false;
  if (postLevel && simulated[simulated.length - 1] !== postLevel) return false;
  return true;
}

/**
 * Guards adding a course into a Level (doc rules, Phase 2 item 4):
 * an assessment Level (pre/post) holds exactly one course, ever; a content
 * Level allows any number of regular courses plus at most one Level
 * assessment (a course flagged isAssessmentCourse).
 */
export function canAddCourseToLevel(level: INode | undefined, incomingIsAssessmentCourse: boolean): boolean {
  if (isAssessmentLevel(level)) return false; // already full — assessment Levels hold exactly one course
  if (!incomingIsAssessmentCourse) return true; // regular courses are unrestricted on content Levels
  const children = level?.children ?? [];
  return !children.some((c) => !!c.metadata?.['isAssessmentCourse']);
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value ? [String(value)] : [];
}

/**
 * "Skills covered" (root summary, Phase 4): the union of skills tagged
 * across the Prior Assessment, each Level's *selected* skills, and the
 * Outcome Assessment — never skills scraped from linked courses' content.
 * Assessment Levels contribute their course's skillCategoryCode tags;
 * content Levels contribute their own `competencies` metadata.
 */
/**
 * "Path shape" (root summary, Phase 4): level count excludes the pre/post
 * assessment slots (design: "Neither counts as a level"); course count
 * includes every linked course, assessment courses included.
 */
export function computePathShape(root: INode | undefined): { levelCount: number; courseCount: number } {
  const levels = root?.children ?? [];
  let levelCount = 0;
  let courseCount = 0;
  for (const lvl of levels) {
    if (!isAssessmentLevel(lvl)) levelCount++;
    courseCount += (lvl.children ?? []).length;
  }
  return { levelCount, courseCount };
}

export function computeSkillsCovered(root: INode | undefined, skillCategoryCode: string | undefined): string[] {
  if (!root || !skillCategoryCode) return [];
  const covered = new Set<string>();
  for (const lvl of root.children ?? []) {
    if (isAssessmentLevel(lvl)) {
      toStringArray(lvl.children![0].metadata?.[skillCategoryCode]).forEach((s) => covered.add(s));
    } else {
      toStringArray(lvl.metadata?.['competencies']).forEach((s) => covered.add(s));
    }
  }
  return Array.from(covered);
}
