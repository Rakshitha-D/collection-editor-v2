import { useTreeStore } from '../store/tree.store';
import { useUiStore } from '../store/ui.store';
import { useLabels } from './useLabels';
import { getLevelExamCourse } from '../utils/lpStructure';
import type { INode } from '../types/editor';

export interface UseLevelExamResult {
  course: INode | undefined;
  filled: boolean;
  courseName: string | undefined;
  isActiveTarget: boolean;
  armExam: () => void;
  deleteExam: () => void;
}

/**
 * Level Exam course for a single content Level — the optional, at-most-one
 * course (canAddCourseToLevel already caps it) whose leaves are purely a
 * question set, used to determine the learner's outcome for THIS Level
 * specifically (distinct from the Prior/Outcome Assessments, which gate the
 * whole path). Mirrors useAssessmentSlots.ts's shape, scoped to one Level
 * (by id) instead of root's pinned pre/post positions.
 */
export function useLevelExam(levelId: string | null | undefined): UseLevelExamResult {
  const lbl = useLabels();
  const treeData = useTreeStore((s) => s.treeData);
  const deleteNode = useTreeStore((s) => s.deleteNode);
  const activeLevelExamTarget = useUiStore((s) => s.activeLevelExamTarget);
  const setActiveLevelExamTarget = useUiStore((s) => s.setActiveLevelExamTarget);
  const openModal = useUiStore((s) => s.openModal);

  // Levels are root's only direct children (never nested) — a plain find is
  // enough, no need for a general tree search.
  const level = treeData[0]?.children?.find((l) => l.id === levelId);
  const course = getLevelExamCourse(level);
  const isActiveTarget = activeLevelExamTarget === levelId;

  // Toggles: clicking the row again while it's already the armed target
  // unarms it (back to normal browsing), rather than being a one-way
  // "arm only" action with no way back except the header chip.
  const armExam = () => {
    if (!levelId) return;
    setActiveLevelExamTarget(isActiveTarget ? null : levelId);
  };

  const deleteExam = () => {
    if (!course) return;
    openModal('confirmDelete', {
      message: lbl.learningPath.deleteLevelExamConfirm,
      onConfirm: () => deleteNode(course.id),
    });
  };

  return {
    course,
    filled: !!course,
    courseName: course?.name,
    isActiveTarget,
    armExam,
    deleteExam,
  };
}
