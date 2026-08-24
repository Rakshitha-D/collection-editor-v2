import React, { useEffect, useState } from 'react';
import { useEditorStore } from '../../store/editor.store';
import { useTreeStore } from '../../store/tree.store';
import { useSkillCategory } from '../../hooks/useSkillCategory';
import { useSkillScope } from '../../hooks/useSkillScope';
import { validateLearningPathStructure, revalidateAssessmentSlots, type LpValidationIssue } from '../../utils/lpStructure';
import { Button } from '../shared/Button';
import { useLabels } from '../../hooks/useLabels';
import styles from './modals.module.scss';

// LP profile: replaces the manual checkbox checklist with the derived
// publish-readiness rules from learning_path_plan.md §5 — the gate is
// automated, not self-attested.
const LearningPathChecklist: React.FC<{ objectType: string; onConfirm: () => void; onCancel: () => void }> = ({
  objectType, onConfirm, onCancel,
}) => {
  const lbl = useLabels();
  const root = useTreeStore((s) => s.treeData[0]);
  const treeCache = useTreeStore((s) => s.treeCache);
  const skillCategory = useSkillCategory();
  const { scope } = useSkillScope();
  const [asyncIssues, setAsyncIssues] = useState<LpValidationIssue[] | null>(null);

  const structuralIssues = validateLearningPathStructure(root, skillCategory?.code, scope, treeCache);

  useEffect(() => {
    let cancelled = false;
    setAsyncIssues(null);
    revalidateAssessmentSlots(root)
      .then((issues) => { if (!cancelled) setAsyncIssues(issues); })
      .catch((e) => {
        // Without this, a rejected fetch (network error, 4xx/5xx) leaves
        // asyncIssues null forever — isChecking never clears, so the modal
        // is stuck on "Verifying assessment courses…" with no way out
        // besides closing it. Surface it as a blocking issue instead, same
        // as any other unresolved slot problem, with a retry-worthy message.
        console.error('[PublishChecklist] assessment-course re-check failed:', e);
        if (!cancelled) {
          setAsyncIssues([{ code: 'slotCourseCheckFailed', message: lbl.learningPath.assessmentCheckFailedToast }]);
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  const isChecking = asyncIssues === null;
  const issues = [...structuralIssues, ...(asyncIssues ?? [])];
  const canPublish = !isChecking && issues.length === 0;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="publish-modal-title">
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span id="publish-modal-title">{lbl.publishChecklist.publishTitlePrefix} {objectType}</span>
          <button className={styles.modalHeaderClose} onClick={onCancel} aria-label={lbl.publishChecklist.closeAriaLabel}>×</button>
        </div>

        <div className={styles.modalBody}>
          {issues.length === 0 ? (
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              {isChecking ? lbl.learningPath.verifyingAssessmentCourses : `${lbl.publishChecklist.confirmPublishPrefix} ${objectType}?`}
            </p>
          ) : (
            <>
              <p className={styles.sectionTitle}>{lbl.learningPath.resolveBeforePublishing}</p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                {issues.map((issue, i) => <li key={`${issue.code}-${issue.nodeId ?? i}`}>{issue.message}</li>)}
              </ul>
            </>
          )}
        </div>

        <div className={styles.modalFooter}>
          <Button variant="ghost" onClick={onCancel}>{lbl.publishChecklist.noButton}</Button>
          <Button variant="primary" onClick={onConfirm} disabled={!canPublish}>{lbl.publishChecklist.yesButton}</Button>
        </div>
      </div>
    </div>
  );
};

interface PublishChecklistProps {
  contentId: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Publish confirmation — mirrors the Angular publish-checklist popup.
 * - With no checklist items: a simple "Are you sure you want to publish this {objectType}?"
 * - With checklist items: the reviewer must tick every item before "Yes" is enabled.
 */
export const PublishChecklist: React.FC<PublishChecklistProps> = ({
  contentId: _contentId,
  onConfirm,
  onCancel,
}) => {
  const lbl = useLabels();
  const objectType =
    useEditorStore((s) => s.editorConfig?.config?.objectType) || 'Content';
  // `derivedRoles` means something narrower ("structural roles derived from
  // unit index") — `key === 'learningPath'` is the actual LP-identity check
  // used everywhere else this profile is gated.
  const isLearningPath = useEditorStore((s) => s.editorProfile.key === 'learningPath');

  // Manual confirmation items defined by the category definition (forms.publishchecklist).
  const checklistItems = useEditorStore((s) => s.publishChecklist) ?? [];
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const allConfirmed = checklistItems.every((c) => confirmed[c.code]);
  const canPublish = checklistItems.length === 0 || allConfirmed;

  // Publishing is performed centrally (useToolbarActions) after confirmation.
  const handlePublish = () => {
    onConfirm();
  };

  if (isLearningPath) {
    return <LearningPathChecklist objectType={objectType} onConfirm={onConfirm} onCancel={onCancel} />;
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="publish-modal-title">
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span id="publish-modal-title">{lbl.publishChecklist.publishTitlePrefix} {objectType}</span>
          <button
            className={styles.modalHeaderClose}
            onClick={onCancel}
            aria-label={lbl.publishChecklist.closeAriaLabel}
          >
            ×
          </button>
        </div>

        <div className={styles.modalBody}>
          {checklistItems.length === 0 ? (
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              {lbl.publishChecklist.confirmPublishPrefix} {objectType}?
            </p>
          ) : (
            <>
              <p className={styles.sectionTitle}>
                {lbl.publishChecklist.checklistInstructions}
              </p>
              {checklistItems.map((item) => (
                <label key={item.code} className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={!!confirmed[item.code]}
                    onChange={(e) =>
                      setConfirmed((prev) => ({ ...prev, [item.code]: e.target.checked }))
                    }
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </>
          )}
        </div>

        <div className={styles.modalFooter}>
          <Button variant="ghost" onClick={onCancel}>
            {lbl.publishChecklist.noButton}
          </Button>
          <Button variant="primary" onClick={handlePublish} disabled={!canPublish}>
            {lbl.publishChecklist.yesButton}
          </Button>
        </div>
      </div>
    </div>
  );
};
