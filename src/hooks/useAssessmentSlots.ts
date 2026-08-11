import { useTreeStore } from '../store/tree.store';
import { useUiStore } from '../store/ui.store';
import { useLabels } from './useLabels';
import { isAssessmentLevel, REQUIRES_PRIOR_POLICIES } from '../utils/lpStructure';
import type { INode } from '../types/editor';

export interface AssessmentSlotInfo {
  level: INode | undefined;
  filled: boolean;
  courseName: string | undefined;
  /** Whether publish/send-for-review blocks without this slot
   *  (validateLearningPathStructure): Prior Assessment only under a policy
   *  in REQUIRES_PRIOR_POLICIES (Diagnostic/"Adaptive" — it skips solely on
   *  this score; PriorLearning can skip on external evidence instead).
   *  Outcome Assessment is optional — always false. */
  required: boolean;
}

export interface UseAssessmentSlotsResult {
  pre: AssessmentSlotInfo;
  post: AssessmentSlotInfo;
  activeAssessmentSlot: 'pre' | 'post' | null;
  setActiveAssessmentSlot: (slot: 'pre' | 'post' | null) => void;
  /** Deletes the pre/post slot's Level, confirming first if it's the Prior
   *  Assessment under the Diagnostic policy (it drives the Adaptive skip). */
  deleteSlot: (slot: 'pre' | 'post') => void;
}

// Shared derivation for the Prior/Outcome assessment slots — consumed by
// the root panel's "Prior & outcome assessments" card (AssessmentSlotItem)
// and OutlineTree's own delete-confirmation guard for the pre-assessment
// Level, so both surfaces agree on what's filled and what policy requires
// confirming a delete.
export function useAssessmentSlots(): UseAssessmentSlotsResult {
  const lbl = useLabels();
  const treeData = useTreeStore((s) => s.treeData);
  const treeCache = useTreeStore((s) => s.treeCache);
  const deleteNode = useTreeStore((s) => s.deleteNode);
  const activeAssessmentSlot = useUiStore((s) => s.activeAssessmentSlot);
  const setActiveAssessmentSlot = useUiStore((s) => s.setActiveAssessmentSlot);
  const openModal = useUiStore((s) => s.openModal);

  const rootLevels = treeData[0]?.children ?? [];
  const preLevel = rootLevels[0];
  const postLevel = rootLevels.length > 1 ? rootLevels[rootLevels.length - 1] : undefined;
  const preFilled = isAssessmentLevel(preLevel);
  const postFilled = isAssessmentLevel(postLevel);
  const root = treeData[0];
  const policy = root ? (treeCache[root.id]?.['policy'] ?? root.metadata?.['policy']) as string | undefined : undefined;
  const preRequired = !!policy && REQUIRES_PRIOR_POLICIES.has(policy);

  const deleteSlot = (slot: 'pre' | 'post') => {
    const level = slot === 'pre' ? preLevel : postLevel;
    if (!level) return;
    // Every slot deletion confirms first, via the same in-app ConfirmDialog
    // used for all other content removal in the LP tree — the pre-slot under
    // the Adaptive (Diagnostic) policy gets the stronger, consequence-specific
    // wording since it's the sole basis for that path's skips.
    const message = slot === 'pre' && preRequired
      ? lbl.learningPath.deletePriorAssessmentConfirm
      : lbl.learningPath.deleteAssessmentSlotConfirm;
    openModal('confirmDelete', { message, onConfirm: () => deleteNode(level.id) });
  };

  return {
    pre: { level: preLevel, filled: preFilled, courseName: preFilled ? preLevel?.children?.[0]?.name : undefined, required: preRequired },
    // Outcome Assessment is optional — never blocks publish/send-for-review.
    post: { level: postLevel, filled: postFilled, courseName: postFilled ? postLevel?.children?.[0]?.name : undefined, required: false },
    activeAssessmentSlot,
    setActiveAssessmentSlot,
    deleteSlot,
  };
}
