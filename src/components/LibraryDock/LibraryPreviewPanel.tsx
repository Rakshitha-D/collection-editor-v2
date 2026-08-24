import React from 'react';
import { createPortal } from 'react-dom';
import { X, BookOpen, Plus } from 'lucide-react';
import type { IContent } from '../../types/content';
import type { EditorMode, INode } from '../../types/editor';
import { ContentPlayer } from '../ContentPlayer';
import { CourseDetailsPanel } from '../shared/CourseDetailsPanel';
import { useLabels } from '../../hooks/useLabels';
import { useEditorStore } from '../../store/editor.store';
import { useLibraryTargetLabel } from '../../hooks/useLibraryTargetLabel';
import { isEvaluationCourse } from '../../utils/lpStructure';
import styles from './LibraryPreviewPanel.module.scss';

const QUESTIONSET_MIME = 'application/vnd.sunbird.questionset';

interface LibraryPreviewPanelProps {
  content: IContent | null;
  editorMode: EditorMode;
  onAdd: (item: IContent) => void;
  onClose: () => void;
}

/**
 * Content preview shown when a library item is selected. Opens directly as a
 * centered modal (portaled to body so it escapes the dock's stacking context).
 */
export const LibraryPreviewPanel: React.FC<LibraryPreviewPanelProps> = ({
  content,
  editorMode,
  onAdd,
  onClose,
}) => {
  const lbl = useLabels();
  const isEditable = editorMode === 'edit';
  const competencyScoped = useEditorStore(s => s.editorProfile.competencyScoped);
  const targetLabel = useLibraryTargetLabel();
  if (!content) return null;

  // While filling the Prior/Outcome Assessment slot or a Level Exam target,
  // useLibrary's search is filtered to Evaluation Course — every item here
  // during those flows carries that category, not 'Course', so it needs the
  // same "show Course details, not the content player" treatment.
  const isCourse = competencyScoped && (content.primaryCategory === 'Course' || isEvaluationCourse(content));
  const meta = [content.organisation?.[0] ?? content.channel ?? '', content.primaryCategory ?? '']
    .filter(Boolean)
    .join(' • ');

  // Convert IContent to INode — ContentPlayer fetches full details by identifier
  const node: INode = {
    id: content.identifier,
    identifier: content.identifier,
    name: content.name ?? '',
    mimeType: content.mimeType,
    primaryCategory: content.primaryCategory,
    contentType: content.contentType,
    appIcon: content.appIcon,
    status: content.status,
    isFolder: false,
    children: [],
    metadata: content as unknown as Record<string, unknown>,
  };

  return createPortal(
    <div
      className={[styles.modalOverlay, isCourse ? styles.modalOverlayCourse : ''].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label={lbl.libraryPreviewPanel.contentPreviewAriaLabel}
      onClick={onClose}
    >
      <div
        className={[styles.modalPanel, isCourse ? styles.modalPanelCourse : ''].filter(Boolean).join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={[styles.header, isCourse ? styles.headerCourse : ''].filter(Boolean).join(' ')}>
          {isCourse && (
            <span className={styles.courseIcon}><BookOpen size={20} /></span>
          )}
          <div className={styles.titleGroup}>
            <span className={styles.title} title={content.name}>
              {content.name}
            </span>
            {isCourse && meta && <span className={styles.courseMeta}>{meta}</span>}
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onClose}
              aria-label={lbl.libraryPreviewPanel.closePreviewAriaLabel}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className={styles.playerArea}>
          {isCourse ? (
            <CourseDetailsPanel courseId={content.identifier} />
          ) : (
            // QuestionSets preview via the QuML player (whole set); everything
            // else goes through the content players.
            <ContentPlayer
              node={node}
              editorMode="read"
              type={content.mimeType === QUESTIONSET_MIME ? 'quml' : 'content'}
            />
          )}
        </div>

        {isEditable && (
          <div className={[styles.footer, isCourse ? styles.footerCourse : ''].filter(Boolean).join(' ')}>
            {isCourse ? (
              <button
                type="button"
                className={styles.addBtnCourse}
                onClick={() => onAdd(content)}
              >
                <Plus size={15} /> {targetLabel ?? lbl.libraryPreviewPanel.addToUnitButton}
              </button>
            ) : (
              <button
                type="button"
                className={styles.addBtn}
                onClick={() => onAdd(content)}
              >
                {lbl.libraryPreviewPanel.addToUnitButton}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
