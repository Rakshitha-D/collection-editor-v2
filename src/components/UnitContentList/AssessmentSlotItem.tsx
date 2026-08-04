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

// A row in the root panel's "Prior & outcome assessments" card — the same
// data useAssessmentSlots feeds to OutlineTree's pinned tree rows, presented
// as a filled item-row (course + menu) or a dashed "Add X" placeholder.
export const AssessmentSlotItem: React.FC<AssessmentSlotItemProps> = ({ slot, isEditable }) => {
  const lbl = useLabels();
  const { pre, post, setActiveAssessmentSlot, deleteSlot } = useAssessmentSlots();
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
    return (
      <button
        type="button"
        className={styles.addRow}
        disabled={!isEditable}
        onClick={() => setActiveAssessmentSlot(slot)}
      >
        <Plus size={14} /> {lbl.learningPath.addAssessmentSlotButton.replace('{label}', label)}
      </button>
    );
  }

  return (
    <div
      className={styles.assessmentItemRow}
      role="button"
      tabIndex={0}
      onClick={() => info.level && selectNode(info.level.id)}
    >
      <span className={styles.assessmentItemIcon}><BookOpen size={14} /></span>
      <div className={styles.assessmentItemInfo}>
        <span className={styles.assessmentItemTitle}>{info.courseName}</span>
        <span className={styles.assessmentItemMeta}>{label}</span>
      </div>
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
