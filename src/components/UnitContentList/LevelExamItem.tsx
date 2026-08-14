import React from 'react';
import { Plus, Trash2, BookOpen } from 'lucide-react';
import { useLevelExam } from '../../hooks/useLevelExam';
import { useLabels } from '../../hooks/useLabels';
import styles from './UnitContentList.module.scss';

interface LevelExamItemProps {
  levelId: string | null | undefined;
  isEditable: boolean;
}

// The optional Level Exam course row for a content Level — structurally
// close to AssessmentSlotItem (Prior/Outcome) but simpler: one action, not
// two. A Level Exam course is a plain leaf, not a wrapper Level with its
// own detail page, so there's no "View" navigation — just add or remove.
export const LevelExamItem: React.FC<LevelExamItemProps> = ({ levelId, isEditable }) => {
  const lbl = useLabels();
  const { filled, courseName, isActiveTarget, armExam, deleteExam } = useLevelExam(levelId);

  if (!filled) {
    return (
      <button
        type="button"
        className={[styles.addRow, styles.addRowAssessment, isActiveTarget ? styles.addRowActive : ''].filter(Boolean).join(' ')}
        disabled={!isEditable}
        onClick={armExam}
        aria-pressed={isActiveTarget}
      >
        <span className={styles.addRowIcon}><Plus size={16} /></span>
        <span className={styles.addRowText}>{lbl.learningPath.addLevelExamButton}</span>
      </button>
    );
  }

  return (
    <div className={styles.assessmentItemRow}>
      <span className={styles.assessmentItemIcon}><BookOpen size={16} /></span>
      <div className={styles.assessmentItemInfo}>
        <span className={styles.assessmentItemTitle}>{courseName || lbl.learningPath.courseNameUnavailable}</span>
        <span className={styles.assessmentItemMeta}>{lbl.learningPath.levelExamMeta}</span>
      </div>
      {isEditable && (
        <button
          type="button"
          className={styles.menuBtn}
          onClick={deleteExam}
          aria-label={lbl.treeNode.deleteMenuItem}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
};
