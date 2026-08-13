# Level Exam Course — implementation plan

Status: **implemented** per this plan (sections 1–9 below), plus one addition
not in the original plan: `handleFillLevelExam` (LibraryDock.tsx) also runs
the same `wouldBecomeAmbiguousSlot` check the generic add-flow gate uses
(see `learning_path_assessment_slot_identity_plan.md`) — a Level Exam course
landing as the *sole* content of an empty first/last Level is blocked the
same way a coincidental one would be, since a Level Exam paired with other
content in the same Level never hits this regardless. The three open
questions below were not explicitly revisited during implementation — the
plan's own "leave `computeSkillsCovered` untouched" default was kept as-is.

## Concept

Each content Level (not the pinned Prior/Outcome slots) can optionally have
one **Level Exam Course** — a linked course whose only content is a
question set, used to determine the learner's outcome for that specific
Level (distinct from the Prior/Outcome Assessments, which gate the whole
path). Confirmed decisions:
- **Optional** — no "Required" badge, no publish/send-for-review gate.
- **Delete confirms first** — `window.confirm`, same pattern as Prior/Outcome
  Assessment remova]l.

## What already exists (no change needed)

The data model already supports this shape — it was designed for it from
the start, just never wired up in the UI:

- `getLevelRole(levelIndex, levelCount, hasAssessmentCourse)` in
  `src/utils/lpStructure.ts` already has a third role beyond `'pre'`/`'post'`:
  **`'levelAssessment'`** — an assessment course on a *middle* Level.
- `canAddCourseToLevel` already caps this at **exactly one per content
  Level**, independent of however many regular courses that Level also has:
  ```ts
  if (!incomingIsAssessmentCourse) return true; // regular courses unrestricted
  const children = level?.children ?? [];
  return !children.some((c) => !!c.metadata?.['isAssessmentCourse']);
  ```
- `computeUncoveredSkills`/`computeSkillsCovered` already union skill tags
  across *all* of a Level's children — a Level Exam course's own skill tags
  already count toward that Level's coverage with no special-casing.
- `tree.store.ts`'s `addResource(item, levelId, { isAssessmentCourse: true })`
  targeted at a **non-root** Level already goes through the plain
  `canAddCourseToLevel` guard + leaf insertion path (the root-targeted
  auto-wrap-into-a-new-Level behavior only triggers when `nodeId === rootId`)
  — linking a Level Exam course needs no new store logic, just a caller that
  passes `isAssessmentCourse: true` for the right course.

## What's missing — the actual work

No UI path exists today to flag a course as a Level Exam when linking it to
a content Level. The question-set-only check (`getAssessmentCourseInfo`)
and the "mark as assessment" flow currently only run from
`LibraryDock.tsx`'s `handleFillAssessmentSlot`, gated by the root-scoped
`activeAssessmentSlot` UI state (`'pre' | 'post' | null`) — nothing scopes to
an arbitrary Level id.

### 1. `src/store/ui.store.ts`
Add a second, Level-scoped "armed target" alongside `activeAssessmentSlot`:
```ts
activeLevelExamTarget: string | null;       // the target Level's id, or null
setActiveLevelExamTarget: (levelId: string | null) => void;
```
Make the two setters mutually clearing (`setActiveAssessmentSlot` also
nulls `activeLevelExamTarget` and vice versa) so only one "add target mode"
is ever armed at a time — otherwise `LibraryDock`'s `handleAdd` would have
to disambiguate two simultaneously-armed targets. `tree.store.ts`'s
`selectNode` already calls `setActiveAssessmentSlot(null)` on every
explicit navigation to cancel a pending slot-fill view; once the setters are
mutually clearing, that single call also cancels a pending Level Exam arm
with no extra wiring.

### 2. `src/utils/lpStructure.ts`
Small pure helper, read-only:
```ts
/** The at-most-one Level Exam course linked directly to a content Level,
 *  if any — canAddCourseToLevel already caps this at one. Unlike
 *  isAssessmentLevel, doesn't require it to be the Level's ONLY child. */
export function getLevelExamCourse(level: INode | undefined): INode | undefined {
  return (level?.children ?? []).find((c) => !!c.metadata?.['isAssessmentCourse']);
}
```

### 3. `src/hooks/useLevelExam.ts` (new)
Mirrors `useAssessmentSlots.ts`'s shape but scoped to a given `levelId`
instead of root's pinned pre/post positions:
```ts
export function useLevelExam(levelId: string | undefined) {
  // course = getLevelExamCourse(getNodeById(levelId))
  // filled = !!course
  // isActiveTarget = activeLevelExamTarget === levelId
  // armExam() → setActiveLevelExamTarget(levelId)
  // deleteExam() → window.confirm(...) then deleteNode(course.id)
  return { course, filled, courseName: course?.name, isActiveTarget, armExam, deleteExam };
}
```

### 4. `src/components/UnitContentList/LevelExamItem.tsx` (new)
A small card, structurally similar to `AssessmentSlotItem.tsx` but simpler
(one action, not two — no "View" menu item, since a Level Exam course is a
plain leaf, not a wrapper Level with its own detail page):
- Unfilled: dashed "Add Level Exam — a course with only a question set" row
  (reuse `.addRow`/`.addRowAssessment`/`.addRowText` classes from
  `UnitContentList.module.scss`), `onClick` calls `armExam()`.
- Filled: icon + course name + "Level Exam · Question set only" meta text +
  a direct remove (X/trash) button — reuse `ContentRow.tsx`'s direct-button
  pattern rather than `AssessmentSlotItem`'s dropdown menu, since there's
  only one action here.

### 5. `src/components/UnitContentList/UnitContentList.tsx`
Render a new card in the `isLpLevel` branch (currently only renders
`<SkillPicker>` for a content Level), e.g. right after the SkillPicker:
```tsx
{isLpLevel && <LevelExamItem levelId={selectedNodeId} isEditable={isEditable} />}
```

### 6. `src/components/LibraryDock/LibraryDock.tsx`
- Read `activeLevelExamTarget` from `useUiStore`.
- Add a `handleFillLevelExam(item, levelId)` handler mirroring
  `handleFillAssessmentSlot`: check `getLevelExamCourse(targetLevel)` isn't
  already filled (say so up front, matching the existing "slot already
  filled" pattern) → `getAssessmentCourseInfo(item.identifier)` → reject with
  a toast if not question-set-only → `addResource(enriched, levelId, {
  isAssessmentCourse: true })` → success toast → `setActiveLevelExamTarget(null)`.
- In `handleAdd`, add a branch for `activeLevelExamTarget` alongside the
  existing `activeAssessmentSlot` branch (same tier, after the Curriculum
  check).

### 7. `src/hooks/useLibraryTargetLabel.ts`
Add a branch so the Library dock's header hint says something like "Add
Level Exam course for {level}" while `activeLevelExamTarget` is set,
matching the existing `libraryAddPriorAssessmentCourse`/
`libraryAddOutcomeAssessmentCourse` pattern.

### 8. i18n (all 4 locales: en/ar/fr/pt)
New keys needed, following existing naming conventions:
- `addLevelExamButton` — "Add Level Exam — a course with only a question set"
- `levelExamLabel` — "Level Exam"
- `levelExamMeta` — "Level Exam · Question set only" (or reuse
  `assessmentCourseMeta` pattern)
- `levelExamAlreadyFilledToast`
- `deleteLevelExamConfirm`
- `libraryAddLevelExamCourse` (for `useLibraryTargetLabel`)

### 9. Tests
- `lpStructure.test.ts`: `getLevelExamCourse` — finds the flagged course
  among mixed regular+exam children; returns `undefined` when none/no level.
- `tree.store.learningPath.test.ts`: no new tests strictly needed —
  `canAddCourseToLevel`'s one-per-Level cap for a non-pre/post Level is
  already covered by existing tests ("allows exactly one Level-assessment
  course on a content Level, rejecting a second").
- No dedicated hook test for `useLevelExam` (matches the existing precedent
  — `useAssessmentSlots` has no dedicated test file either; store-level
  logic is tested directly instead).

## Open questions to confirm before/while implementing

1. Should `computeSkillsCovered` (root "Skills covered" summary) also pull
   in a Level Exam course's own skill tags directly, or does the existing
   "Level's own selected skills" reporting stay as the sole source (with the
   exam course's tags only feeding `computeUncoveredSkills`'s coverage
   check, not the covered-skills list itself)? Current plan: leave
   `computeSkillsCovered` untouched — it already only reads a content
   Level's own `metadata[skillCategoryCode]` selection, not its courses'
   tags, and that's a deliberate, already-documented design choice
   (`computeSkillsCovered`'s own doc comment: "never skills scraped from
   linked courses' content").
2. Any reporting/analytics wiring for "how the learner did on this exam"?
   Out of scope for this editor — authoring only decides which course fills
   the slot; runtime outcome computation is a player/analytics concern.
3. Does the Level Exam course need its own explainer copy (like
   `AssessmentDetailPanel.tsx`'s "Why this can't be skipped" panel for
   Prior/Outcome)? Given it's optional and lives inline in
   `UnitContentList.tsx` rather than a dedicated detail page, probably not
   — but worth confirming against the actual design once one exists.
