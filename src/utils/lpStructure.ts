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

export interface AssessmentCourseInfo {
  qualifies: boolean;
  /** The course's full metadata from its own hierarchy read (children stripped).
   *  Needed because composite-search results only carry the LP framework's
   *  skill field — a course tagged under a different framework (e.g. USF)
   *  would otherwise land in the tree without its framework or skill tags. */
  meta: Record<string, unknown>;
}

// Per-session cache — the check requires a full course-hierarchy read, so
// avoid re-fetching for a course already validated (e.g. re-opening the same
// pre/post slot picker, or the Phase 5 publish-time re-check).
const assessmentCourseCache = new Map<string, AssessmentCourseInfo>();

export async function getAssessmentCourseInfo(courseId: string): Promise<AssessmentCourseInfo> {
  const cached = assessmentCourseCache.get(courseId);
  if (cached) return cached;
  const course = await readCourseHierarchy(courseId);
  const { children: _children, ...meta } = (course ?? {}) as Record<string, unknown>;
  const info: AssessmentCourseInfo = {
    qualifies: isAssessmentCourse(course as HierarchyLeafLike),
    meta,
  };
  assessmentCourseCache.set(courseId, info);
  return info;
}

export async function checkAssessmentCourse(courseId: string): Promise<boolean> {
  return (await getAssessmentCourseInfo(courseId)).qualifies;
}

export function clearAssessmentCourseCache(): void {
  assessmentCourseCache.clear();
}

/**
 * Repairs a freshly-loaded LP tree (useEditorInit, after readHierarchy).
 * The hierarchy read undoes two editor-local invariants:
 *  - mapToINode marks linked courses (collection mimeType) as folders and
 *    expands their internal children — in the LP tree courses are terminal
 *    leaves, so re-flatten them;
 *  - the isAssessmentCourse flag is local-only (stripped from saves), so
 *    without it no Level is recognized as a pre/post slot and "Skills
 *    covered"/slot rules read the path as having no assessments. Recompute
 *    it from the course's expanded subtree when the read included one, else
 *    (single-course first/last Levels only) via a checkAssessmentCourse read.
 */
export async function normalizeLearningPathTree(root: INode): Promise<INode> {
  const levels = root.children ?? [];
  const normalized: INode[] = [];
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const children = level.children ?? [];
    const courses: INode[] = [];
    for (const child of children) {
      let flagged = !!child.metadata?.['isAssessmentCourse'];
      if (!flagged) {
        if ((child.children ?? []).length > 0) {
          flagged = isAssessmentCourse(child as HierarchyLeafLike);
        } else if (children.length === 1 && (i === 0 || i === levels.length - 1)) {
          try {
            flagged = await checkAssessmentCourse(child.identifier);
          } catch (e) {
            console.error('[lpStructure] assessment-course check failed on load:', e);
          }
        }
      }
      courses.push({
        ...child,
        isFolder: false,
        children: [],
        metadata: { ...(child.metadata ?? {}), ...(flagged ? { isAssessmentCourse: true } : {}) },
      });
    }
    normalized.push({ ...level, children: courses });
  }
  return { ...root, children: normalized };
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
 * Display info for one of root's Level children, keyed by id — same
 * numbering rule TreeNode uses for its "Level N • {name}" row (assessment
 * slots excluded from the count), reused by the Course-detail page's
 * "Back to {label}" button so the two stay consistent.
 */
export function getLevelDisplayInfo(
  levels: INode[],
  levelId: string,
): { role: 'pre' | 'post' | 'level'; levelNumber: number | null } | null {
  const idx = levels.findIndex((l) => l.id === levelId);
  if (idx === -1) return null;
  if (isPrePostSlotAtIndex(levels, idx)) {
    return { role: idx === 0 ? 'pre' : 'post', levelNumber: null };
  }
  const levelNumber = levels.slice(0, idx + 1)
    .filter((_, i) => !isPrePostSlotAtIndex(levels, i)).length;
  return { role: 'level', levelNumber };
}

/** Whether the pre (index 0) / post (last index) assessment slot already
 *  wraps an assessment course, given root's current Level children. */
export function isAssessmentSlotFilled(levels: INode[], slot: 'pre' | 'post'): boolean {
  if (slot === 'pre') return levels.length > 0 && isAssessmentLevel(levels[0]);
  return levels.length > 1 && isAssessmentLevel(levels[levels.length - 1]);
}

/**
 * Whether the Level AT this index is actually the pre/post assessment slot
 * — position AND shape, unlike bare `isAssessmentLevel`. A content Level
 * whose only current course happens to be its (at-most-one-allowed) Level
 * assessment is shape-identical to a pre/post slot (isAssessmentLevel is
 * position-agnostic by design — see its own doc), but per getLevelRole it
 * is NOT a slot unless it's also at index 0 or the last index. levelCount===1
 * ties to index 0 (pre), matching getLevelRole's own tie-break.
 */
function isPrePostSlotAtIndex(levels: INode[], idx: number): boolean {
  const role = getLevelRole(idx, levels.length, isAssessmentLevel(levels[idx]));
  return role === 'pre' || role === 'post';
}

/** Whether `level` (a direct child of root) is genuinely the pre/post
 *  assessment slot — position AND shape, unlike bare `isAssessmentLevel`.
 *  For callers (outside this module) that hold the level object rather
 *  than its index. */
export function isPrePostSlot(levels: INode[], level: INode | undefined): boolean {
  const idx = level ? levels.findIndex((l) => l.id === level.id) : -1;
  return idx !== -1 && isPrePostSlotAtIndex(levels, idx);
}

/**
 * Which pre/post assessment slot (if any) is open to receive a newly-linked
 * assessment course, given root's current Level children. Pre is checked
 * first, so a lone empty path always fills "pre" before "post" — matching
 * getLevelRole's tie-break for levelCount === 1. Returns null once both
 * slots are already wrapping an assessment course.
 */
export function resolveOpenAssessmentSlot(levels: INode[]): 'pre' | 'post' | null {
  if (!isAssessmentSlotFilled(levels, 'pre')) return 'pre';
  if (!isAssessmentSlotFilled(levels, 'post')) return 'post';
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
  if (fromIndex < 0 || fromIndex >= levels.length) return false; // fail closed — nothing to move
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
 * Guards adding a course into a Level (doc rules, Phase 2 item 4): a
 * pre/post assessment slot holds exactly one course, ever; a content Level
 * allows any number of regular courses plus at most one Level assessment (a
 * course flagged isAssessmentCourse). `isTargetPrePostSlot` must be computed
 * via `isPrePostSlot` (position-aware) — bare shape (`isAssessmentLevel`)
 * alone would also match a content Level whose only current course happens
 * to be its Level assessment, wrongly blocking further regular courses on
 * an otherwise-open Level.
 */
export function canAddCourseToLevel(
  level: INode | undefined,
  incomingIsAssessmentCourse: boolean,
  isTargetPrePostSlot: boolean,
): boolean {
  if (isTargetPrePostSlot) return false; // already full — pre/post slots hold exactly one course, ever
  if (!incomingIsAssessmentCourse) return true; // regular courses are unrestricted on content Levels
  const children = level?.children ?? [];
  return !children.some((c) => !!c.metadata?.['isAssessmentCourse']);
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value ? [String(value)] : [];
}

/**
 * The LP root's explicitly-chosen Curriculum (framework) — from a prior save
 * or the current session's Curriculum field, checked via treeCache first
 * since a live edit lands there before a save round-trips it into
 * root.metadata. Deliberately NOT the same as the channel/context default
 * framework (useEditorStore's contentFramework, resolved so *something*
 * exists to browse/filter by before the author has chosen anything) — that
 * fallback must never be mistaken for a real choice, or courses linked
 * under it get pruned the moment a real Curriculum is set, and the Library
 * would silently scope itself to a framework the author never picked.
 */
export function getExplicitCurriculum(
  root: INode | undefined,
  treeCache: Record<string, Record<string, unknown>>,
): string | undefined {
  if (!root) return undefined;
  const cached = treeCache[root.id]?.['framework'] as string | undefined;
  return cached ?? (root.metadata?.['framework'] as string | undefined);
}

export function hasExplicitCurriculum(
  root: INode | undefined,
  treeCache: Record<string, Record<string, unknown>>,
): boolean {
  return !!getExplicitCurriculum(root, treeCache);
}

/**
 * "Skills covered" (root summary, Phase 4): the union of skills tagged
 * across the Prior Assessment, each Level's *selected* skills, and the
 * Outcome Assessment — never skills scraped from linked courses' content.
 * Both assessment Levels (their course's tags) and content Levels (their
 * own selection) read the SAME resolved skillCategoryCode metadata field —
 * never the reserved Sunbird `competencies` field, whose platform schema
 * expects competency-ontology objects, not plain framework-term strings.
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
  levels.forEach((lvl, idx) => {
    if (!isPrePostSlotAtIndex(levels, idx)) levelCount++;
    courseCount += (lvl.children ?? []).length;
  });
  return { levelCount, courseCount };
}

export function computeSkillsCovered(root: INode | undefined, skillCategoryCode: string | undefined): string[] {
  if (!root || !skillCategoryCode) return [];
  const covered = new Set<string>();
  const levels = root.children ?? [];
  levels.forEach((lvl, idx) => {
    if (isPrePostSlotAtIndex(levels, idx)) {
      toStringArray(lvl.children![0].metadata?.[skillCategoryCode]).forEach((s) => covered.add(s));
    } else {
      toStringArray(lvl.metadata?.[skillCategoryCode]).forEach((s) => covered.add(s));
    }
  });
  return Array.from(covered);
}

/**
 * The skills-covered union that should be persisted onto the LP root's OWN
 * skill-category metadata field, or null if it already matches what's
 * currently stored there (treeCache first, same precedence as every other
 * field read this way — e.g. getExplicitCurriculum). Per
 * learning_path_ocd.md's recommendation: writing the derived union onto the
 * root makes a saved Learning Path searchable/discoverable by skill without
 * a separately-editable root field that could drift from what the path
 * actually covers — a Level's own selection (or the Prior/Outcome
 * Assessment's course tags) stays the single source of truth; this is a
 * read-through mirror onto root, never the other way around. Compares
 * order-insensitively so re-syncing an unchanged set doesn't loop.
 */
export function resolveSkillsCoveredForSync(
  root: INode | undefined,
  skillCategoryCode: string | undefined,
  treeCache: Record<string, Record<string, unknown>>,
): string[] | null {
  if (!root || !skillCategoryCode) return null;
  const covered = computeSkillsCovered(root, skillCategoryCode);
  const stored = (treeCache[root.id]?.[skillCategoryCode] ?? root.metadata?.[skillCategoryCode]) as
    string[] | string | undefined;
  const storedArray = toStringArray(stored);
  const sortedCovered = [...covered].sort();
  const sortedStored = [...storedArray].sort();
  const isSame = sortedCovered.length === sortedStored.length
    && sortedCovered.every((s, i) => s === sortedStored[i]);
  return isSame ? null : covered;
}

/**
 * Content Levels whose selected skills include at least one outside the
 * given scope — same rule as validateLearningPathStructure's
 * levelSkillsOutOfScope issue, exposed standalone so a scope-narrowing event
 * (linking or changing the Prior Assessment) can proactively notify the
 * author instead of waiting for send-for-review/publish to surface it.
 */
export function findLevelsWithOutOfScopeSkills(
  root: INode | undefined,
  skillCategoryCode: string | undefined,
  scope: string[],
): INode[] {
  if (!root || !skillCategoryCode || scope.length === 0) return [];
  const levels = root.children ?? [];
  return levels.filter((lvl, idx) => {
    if (isPrePostSlotAtIndex(levels, idx)) return false;
    const skills = toStringArray(lvl.metadata?.[skillCategoryCode]);
    return skills.some((s) => !scope.includes(s));
  });
}

/**
 * Which of a content Level's SELECTED skills currently have zero linked
 * course tagged with them. computeSkillsCovered (and the root "Skills
 * covered" summary) reads only the Level's own selection — it has no idea
 * whether any course under that Level actually carries a given skill tag,
 * so a Level can claim to cover a skill that nothing linked to it teaches.
 * Courses missing a skill tag entirely are already caught separately by
 * validateLearningPathStructure's courseMissingSkillTag rule; this is about
 * the Level's selection vs. what its courses are ACTUALLY tagged with.
 */
export function computeUncoveredSkills(
  level: INode | undefined,
  selectedSkills: string[],
  skillCategoryCode: string | undefined,
): string[] {
  if (!level || !skillCategoryCode || selectedSkills.length === 0) return [];
  const covered = new Set<string>();
  for (const course of level.children ?? []) {
    toStringArray(course.metadata?.[skillCategoryCode]).forEach((s) => covered.add(s));
  }
  return selectedSkills.filter((s) => !covered.has(s));
}

// ---------------------------------------------------------------------------
// Publish validation (Phase 5) — every rule from learning_path_plan.md §5.
// ---------------------------------------------------------------------------

export interface LpValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
}

// Exported so every "does this policy require a Prior Assessment" check —
// the publish gate here AND the delete-confirmation guard in
// useAssessmentSlots.ts — shares one definition rather than two policy
// lists that can drift out of sync. adaptive skips solely on the Prior
// Assessment score, so it must have one. priorLearning skips can instead
// draw on external evidence (a verified certificate or prior course) "not
// the assessment alone" (policyPriorLearningDescription) — the Prior
// Assessment is optional there, not required. strict never skips. Values
// match the Viewer Service's tracking_policies enum (strict | adaptive |
// priorLearning), not this editor's own casing convention.
export const REQUIRES_PRIOR_POLICIES = new Set(['adaptive']);

/**
 * Every synchronous (no network) LP publish rule: consumption policy set;
 * prior assessment required only for the adaptive ("Adaptive") policy
 * (not strict, not priorLearning — see REQUIRES_PRIOR_POLICIES); pre/post
 * slot purity when a slot IS filled (Outcome Assessment itself is optional
 * — an empty post slot no longer blocks publish/send-for-review); every
 * content Level has ≥1 course and ≥1 in-scope skill; no empty Levels; every
 * linked course carries a skill tag; no duplicate course across the path.
 * `skillScope` empty means "no scope constraint yet" (matches
 * useSkillScope's manual-fallback catalog, not an empty scope).
 */
export function validateLearningPathStructure(
  root: INode | undefined,
  skillCategoryCode: string | undefined,
  skillScope: string[],
  treeCache: Record<string, Record<string, unknown>> = {},
): LpValidationIssue[] {
  const issues: LpValidationIssue[] = [];
  if (!root) return issues;

  // treeCache first — a policy change lands there immediately (updateNode's
  // unconditional cache write) but only mirrors into root.metadata once a
  // save round-trips it back, same precedence as getExplicitCurriculum and
  // useAssessmentSlots' own policy lookup.
  const policy = (treeCache[root.id]?.['policy'] ?? root.metadata?.['policy']) as string | undefined;
  if (!policy) {
    issues.push({ code: 'policyMissing', message: 'Set a consumption policy for this path.' });
  }

  const levels = root.children ?? [];
  const preLevel = levels[0];
  const postLevel = levels.length > 1 ? levels[levels.length - 1] : undefined;
  const preFilled = isAssessmentLevel(preLevel);
  const postFilled = isAssessmentLevel(postLevel);

  if (!preFilled && policy && REQUIRES_PRIOR_POLICIES.has(policy)) {
    issues.push({ code: 'priorAssessmentRequired', message: 'A Prior Assessment is required for the Adaptive policy.' });
  }
  // Outcome Assessment is no longer mandatory (as of this change) — an empty
  // post slot doesn't block publish/send-for-review. slotNotPure below still
  // applies if one WAS added but isn't a pure question-set-only course.

  ([[preLevel, 'Prior Assessment'], [postLevel, 'Outcome Assessment']] as const).forEach(([lvl, label]) => {
    if (!lvl) return;
    const children = lvl.children ?? [];
    const hasAssessmentCourse = children.some((c) => !!c.metadata?.['isAssessmentCourse']);
    if (!hasAssessmentCourse) return;
    if (children.length !== 1 || !children[0]?.metadata?.['isAssessmentCourse']) {
      issues.push({ code: 'slotNotPure', nodeId: lvl.id, message: `${label} must contain exactly one question-set-only course.` });
    }
  });

  const seenCourseIds = new Set<string>();
  const registerCourse = (courseId: string, nodeId: string) => {
    if (seenCourseIds.has(courseId)) {
      issues.push({ code: 'duplicateCourse', nodeId, message: 'A course appears more than once in this path.' });
    }
    seenCourseIds.add(courseId);
  };

  const contentLevels = levels.slice(preFilled ? 1 : 0, levels.length - (postFilled ? 1 : 0));
  if (preFilled) registerCourse(preLevel.children![0].id, preLevel.id);
  if (postFilled) registerCourse(postLevel!.children![0].id, postLevel!.id);

  for (const lvl of contentLevels) {
    const children = lvl.children ?? [];
    const isEmpty = children.length === 0;
    if (isEmpty) {
      issues.push({ code: 'emptyLevel', nodeId: lvl.id, message: `"${lvl.name}" has no courses yet.` });
    }
    const skills = skillCategoryCode ? toStringArray(lvl.metadata?.[skillCategoryCode]) : [];
    if (skills.length === 0) {
      // An empty Level's "no courses yet" above already covers this — the
      // less specific "needs a skill selected" would be redundant noise.
      if (!isEmpty) {
        issues.push({ code: 'levelMissingSkills', nodeId: lvl.id, message: `"${lvl.name}" needs at least one skill selected.` });
      }
    } else {
      if (skillScope.length > 0) {
        const outOfScope = skills.filter((s) => !skillScope.includes(s));
        if (outOfScope.length > 0) {
          issues.push({
            code: 'levelSkillsOutOfScope', nodeId: lvl.id,
            message: `"${lvl.name}" has skills outside the current scope: ${outOfScope.join(', ')}.`,
          });
        }
      }
      // Independent of scope, and runs even when isEmpty (every selected
      // skill is trivially uncovered with zero courses) — naming exactly
      // which skills still need a covering course, not just "no courses yet."
      const uncovered = computeUncoveredSkills(lvl, skills, skillCategoryCode);
      if (uncovered.length > 0) {
        issues.push({
          code: 'levelSkillsUncovered', nodeId: lvl.id,
          message: `"${lvl.name}" has no course covering: ${uncovered.join(', ')}.`,
        });
      }
    }
    for (const course of children) {
      registerCourse(course.id, lvl.id);
      const tags = skillCategoryCode ? toStringArray(course.metadata?.[skillCategoryCode]) : [];
      if (tags.length === 0) {
        issues.push({ code: 'courseMissingSkillTag', nodeId: course.id, message: `"${course.name}" has no skill tag.` });
      }
    }
  }

  return issues;
}

/**
 * Re-verifies the pre/post assessment courses are STILL question-set-only at
 * publish time (Phase 1 item 6 / Phase 5: "the course may have changed since
 * it was linked"). Separate from validateLearningPathStructure because it
 * requires a network read; callers should run it alongside the sync checks,
 * not instead of them.
 */
export async function revalidateAssessmentSlots(root: INode | undefined): Promise<LpValidationIssue[]> {
  const issues: LpValidationIssue[] = [];
  const levels = root?.children ?? [];
  const preLevel = levels[0];
  const postLevel = levels.length > 1 ? levels[levels.length - 1] : undefined;

  for (const [lvl, label] of ([[preLevel, 'Prior Assessment'], [postLevel, 'Outcome Assessment']] as const)) {
    if (!lvl || !isAssessmentLevel(lvl)) continue;
    const courseId = lvl.children![0].id;
    const stillQualifies = await checkAssessmentCourse(courseId);
    if (!stillQualifies) {
      issues.push({
        code: 'slotCourseChanged', nodeId: lvl.id,
        message: `${label}'s course is no longer question-set-only — pick a different course.`,
      });
    }
  }
  return issues;
}
