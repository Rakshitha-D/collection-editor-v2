import React from 'react';
import { ArrowLeft, Info, Award } from 'lucide-react';
import { useTreeStore } from '../../store/tree.store';
import { useLabels } from '../../hooks/useLabels';
import { AssessmentSlotItem } from '../UnitContentList/AssessmentSlotItem';
import styles from './ContextualEditor.module.scss';

interface AssessmentDetailPanelProps {
  slot: 'pre' | 'post';
  isEditable: boolean;
}

// Dedicated view for the Prior/Outcome assessment slot — replaces the
// generic Level panel when that slot's Level is selected. Shows the linked
// course (or the "not added yet" placeholder) plus a slot-specific explainer
// of why it exists (design: "Why this can't be skipped" / "Closes the path").
export const AssessmentDetailPanel: React.FC<AssessmentDetailPanelProps> = ({ slot, isEditable }) => {
  const lbl = useLabels();
  const treeData = useTreeStore((s) => s.treeData);
  const selectNode = useTreeStore((s) => s.selectNode);
  const rootId = treeData[0]?.id;

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

      <div className={styles.titleRow}>
        <div className={styles.nodeTitle}>{title}</div>
      </div>

      <div className={styles.formArea}>
        <AssessmentSlotItem slot={slot} isEditable={isEditable} />

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
