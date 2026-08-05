import React from 'react';
import { ArrowLeft, Info, Award, Flag, Activity, Lock } from 'lucide-react';
import { useTreeStore } from '../../store/tree.store';
import { useLabels } from '../../hooks/useLabels';
import { useAssessmentSlots } from '../../hooks/useAssessmentSlots';
import { AssessmentSlotItem } from '../UnitContentList/AssessmentSlotItem';
import styles from './ContextualEditor.module.scss';

interface AssessmentDetailPanelProps {
  slot: 'pre' | 'post';
  isEditable: boolean;
}

// Dedicated view for the Prior/Outcome assessment slot — replaces the
// generic Level panel when that slot's Level is selected (or, while unfilled,
// when "Add Prior/Outcome Assessment" was clicked — see ContextualEditor's
// activeAssessmentSlot fallback). Shows the linked course (or the "not added
// yet" placeholder) inside a "Course" card, plus a slot-specific explainer of
// why it exists (design: "Why this can't be skipped" / "Closes the path").
//
// The two pills are asymmetric by design, not a generic hint+purpose pair:
// Prior shows [required, sets-the-baseline]; Outcome shows
// [unlocks-after-last-level, confirms-outcome].
export const AssessmentDetailPanel: React.FC<AssessmentDetailPanelProps> = ({ slot, isEditable }) => {
  const lbl = useLabels();
  const treeData = useTreeStore((s) => s.treeData);
  const selectNode = useTreeStore((s) => s.selectNode);
  const rootId = treeData[0]?.id;
  const { pre, post } = useAssessmentSlots();
  const isFilled = (slot === 'pre' ? pre : post).filled;

  const title = slot === 'pre' ? lbl.learningPath.priorAssessmentLabel : lbl.learningPath.outcomeAssessmentLabel;
  const ExplainerIcon = slot === 'pre' ? Info : Award;
  const explainerTitle = slot === 'pre' ? lbl.learningPath.priorAssessmentExplainerTitle : lbl.learningPath.outcomeAssessmentExplainerTitle;
  const explainerBody = slot === 'pre' ? lbl.learningPath.priorAssessmentExplainerBody : lbl.learningPath.outcomeAssessmentExplainerBody;

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.backToPathButton}
        onClick={() => rootId && selectNode(rootId)}
      >
        <ArrowLeft size={14} /> {lbl.learningPath.backToPathButton}
      </button>

      <div className={styles.assessmentTitle}>{title}</div>

      <div className={styles.slotPills}>
        {slot === 'pre' ? (
          <>
            <span className={`${styles.slotPill} ${styles.slotPillHint}`}>
              <Flag size={12} /> {lbl.learningPath.priorAssessmentHint}
            </span>
            <span className={`${styles.slotPill} ${styles.slotPillPurpose}`}>
              <Activity size={12} /> {lbl.learningPath.priorAssessmentPurposeLabel}
            </span>
          </>
        ) : (
          <>
            <span className={`${styles.slotPill} ${styles.slotPillWarning}`}>
              <Lock size={12} /> {lbl.learningPath.outcomeUnlocksHint}
            </span>
            <span className={`${styles.slotPill} ${styles.slotPillPrimary}`}>
              <Flag size={12} /> {lbl.learningPath.outcomeAssessmentHint}
            </span>
          </>
        )}
      </div>

      <div className={styles.formArea}>
        <div className={styles.courseCard}>
          <div className={styles.courseCardHeading}>{lbl.learningPath.assessmentCourseSectionTitle}</div>
          <p className={styles.courseCardDescription}>{lbl.learningPath.assessmentCourseSectionDescription}</p>
          {isFilled ? (
            <AssessmentSlotItem slot={slot} isEditable={isEditable} />
          ) : (
            <div className={styles.courseNotAdded}>{lbl.learningPath.assessmentNotAddedYet}</div>
          )}
        </div>

        <div className={styles.assessmentExplainer}>
          <div className={styles.assessmentExplainerHeading}>
            <ExplainerIcon size={16} />
            <span>{explainerTitle}</span>
          </div>
          <p>{explainerBody}</p>
        </div>
      </div>
    </div>
  );
};
