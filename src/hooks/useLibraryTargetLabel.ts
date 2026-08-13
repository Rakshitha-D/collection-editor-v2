import { useTreeStore } from '../store/tree.store';
import { useUiStore } from '../store/ui.store';
import { useEditorStore } from '../store/editor.store';
import { useLabels } from './useLabels';

// LP profile: where an "Add" click will land — "Open a level to add"
// (root/nothing selected), "Add to {Level}" (a Level is selected), or the
// slot-specific label while an assessment slot is armed. null outside LP.
// Shared by LibraryDock's header hint and LibraryPreviewPanel's Course CTA.
export function useLibraryTargetLabel(): string | null {
  const lbl = useLabels();
  const isLearningPath = useEditorStore((s) => s.editorProfile.competencyScoped);
  const activeAssessmentSlot = useUiStore((s) => s.activeAssessmentSlot);
  const activeLevelExamTarget = useUiStore((s) => s.activeLevelExamTarget);
  const selectedNodeId = useTreeStore((s) => s.selectedNodeId);
  const treeData = useTreeStore((s) => s.treeData);
  const getNodeById = useTreeStore((s) => s.getNodeById);
  const rootId = treeData[0]?.id;

  if (!isLearningPath) return null;
  if (activeAssessmentSlot === 'pre') return lbl.learningPath.libraryAddPriorAssessmentCourse;
  if (activeAssessmentSlot === 'post') return lbl.learningPath.libraryAddOutcomeAssessmentCourse;
  if (activeLevelExamTarget) {
    const level = getNodeById(activeLevelExamTarget);
    return lbl.learningPath.libraryAddLevelExamCourse.replace('{level}', level?.name ?? '');
  }
  if (selectedNodeId && selectedNodeId !== rootId) {
    const level = getNodeById(selectedNodeId);
    // A selected course (leaf) is not an add target — courses never receive
    // children — so fall through to the "open a level" hint instead.
    if (level?.isFolder) {
      return lbl.learningPath.libraryAddToLevel.replace('{level}', level.name ?? '');
    }
  }
  return lbl.learningPath.libraryOpenLevelToAdd;
}
