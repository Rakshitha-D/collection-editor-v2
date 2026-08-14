import React, { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, BookOpen, Trash2 } from 'lucide-react';
import type { INode } from '../../types/editor';
import { useLabels } from '../../hooks/useLabels';
import styles from './UnitContentList.module.scss';

interface LevelCourseItemProps {
  item: INode;
  onRemove: (id: string) => void;
  isEditable: boolean;
}

// A regular course linked to a content Level, shown in the "Courses" card
// (drag to reorder, menu to remove) — the Level Exam course has its own
// dedicated row (LevelExamItem) and is filtered out of this list before it
// reaches here, so it's never shown twice.
export const LevelCourseItem: React.FC<LevelCourseItemProps> = ({ item, onRemove, isEditable }) => {
  const lbl = useLabels();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !isEditable,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div ref={setNodeRef} style={style} className={styles.courseRow}>
      {isEditable && (
        <span className={styles.courseDragHandle} {...attributes} {...listeners} aria-label={lbl.contentRow.dragToReorderAriaLabel}>
          <GripVertical size={16} />
        </span>
      )}
      <span className={styles.courseIcon}><BookOpen size={18} /></span>
      <div className={styles.courseInfo}>
        <span className={styles.courseTitle} title={item.name}>{item.name}</span>
        <span className={styles.courseMeta}>{lbl.learningPath.courseMetaLabel}</span>
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
                className={styles.dangerItem}
                onClick={() => { setMenuOpen(false); onRemove(item.id); }}
              >
                <Trash2 size={12} /> {lbl.learningPath.removeFromLevelMenuItem}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
