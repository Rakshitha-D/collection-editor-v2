import React, { useState, useRef, useEffect } from 'react';
import { Eye, Trash2, Plus, BookOpen } from 'lucide-react';
import { useTreeStore } from '../../store/tree.store';
import { useAssessmentSlots } from '../../hooks/useAssessmentSlots';
import { useLabels } from '../../hooks/useLabels';
import styles from './UnitContentList.module.scss';

interface AssessmentSlotItemProps {
  slot: 'pre' | 'post';
  isEditable: boolean;
}

// A row in the root panel's "Prior & outcome assessments" card (the sole
// add/fill/view/remove surface for these slots — OutlineTree's own pinned
// rows were removed as a duplicate, see f04ed7b), presented as a filled
// item-row (course + menu) or a dashed "Add X" placeholder.
export const AssessmentSlotItem: React.FC<AssessmentSlotItemProps> = ({ slot, isEditable }) => {
  const lbl = useLabels();
  const { pre, post, activeAssessmentSlot, setActiveAssessmentSlot, deleteSlot } = useAssessmentSlots();
  const selectNode = useTreeStore((s) => s.selectNode);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const info = slot === 'pre' ? pre : post;
  const label = slot === 'pre' ? lbl.learningPath.priorAssessmentLabel : lbl.learningPath.outcomeAssessmentLabel;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  if (!info.filled) {
    const isActiveTarget = activeAssessmentSlot === slot;
    return (
      <button
        type="button"
        className={[styles.addRow, styles.addRowAssessment, isActiveTarget ? styles.addRowActive : ''].filter(Boolean).join(' ')}
        disabled={!isEditable}
        onClick={() => setActiveAssessmentSlot(isActiveTarget ? null : slot)}
        aria-pressed={isActiveTarget}
      >
        <span className={styles.addRowIcon}><Plus size={16} /></span>
        <span className={styles.addRowText}>{lbl.learningPath.addAssessmentSlotButton.replace('{label}', label)}</span>
        {info.required && (
          <span className={styles.requiredBadge}>{lbl.learningPath.requiredSlotBadge}</span>
        )}
      </button>
    );
  }

  const badgeText = slot === 'pre' ? lbl.learningPath.skillCheckBadge : lbl.learningPath.outcomeCheckBadge;
  const openCourse = () => info.level && selectNode(info.level.id);

  return (
    <div
      className={styles.assessmentItemRow}
      role="button"
      tabIndex={0}
      onClick={openCourse}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openCourse();
        }
      }}
    >
      <span className={styles.assessmentItemIcon}><BookOpen size={16} /></span>
      <div className={styles.assessmentItemInfo}>
        <span className={styles.assessmentItemTitle}>{info.courseName || lbl.learningPath.courseNameUnavailable}</span>
        <span className={styles.assessmentItemMeta}>{label} · {lbl.learningPath.assessmentCourseMeta}</span>
      </div>
      <span className={styles.assessmentItemBadge}>{badgeText}</span>
      {isEditable && (
        <div className={styles.menuWrap} ref={menuRef}>
          <button
            type="button"
            className={styles.menuBtn}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            aria-label={lbl.treeNode.nodeOptionsAriaLabel}
          >
            ⋮
          </button>
          {menuOpen && (
            <div className={styles.dropmenu} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); info.level && selectNode(info.level.id); }}
              >
                <Eye size={12} /> {lbl.learningPath.viewCourseMenuItem}
              </button>
              <button
                type="button"
                className={styles.dangerItem}
                onClick={() => { setMenuOpen(false); deleteSlot(slot); }}
              >
                <Trash2 size={12} /> {lbl.treeNode.deleteMenuItem}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
