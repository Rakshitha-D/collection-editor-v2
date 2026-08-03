import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Layers } from 'lucide-react';
import type { IContent } from '../../types/content';
import type { EditorMode, INode } from '../../types/editor';
import { ContentPlayer } from '../ContentPlayer';
import { useLabels } from '../../hooks/useLabels';
import { useEditorStore } from '../../store/editor.store';
import { readCourseHierarchy } from '../../api/hierarchy';
import styles from './LibraryPreviewPanel.module.scss';

const QUESTIONSET_MIME = 'application/vnd.sunbird.questionset';

interface CourseUnitSummary {
  name: string;
  topicCount: number;
}

// LP profile: a linked Course is never played inline in the editor — authors
// see the same read-only "Course details" (Title, Units, Topics) the design
// specifies, sourced from the course's own hierarchy.
const CourseDetailsPanel: React.FC<{ courseId: string }> = ({ courseId }) => {
  const [units, setUnits] = useState<CourseUnitSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUnits(null);
    setError(null);
    readCourseHierarchy(courseId)
      .then((course) => {
        if (cancelled) return;
        const rawUnits = (course['children'] as Record<string, unknown>[] | undefined) ?? [];
        setUnits(rawUnits.map((u) => ({
          name: (u['name'] as string) ?? 'Untitled unit',
          topicCount: ((u['children'] as unknown[] | undefined) ?? []).length,
        })));
      })
      .catch(() => {
        if (!cancelled) setError('Could not load course details.');
      });
    return () => { cancelled = true; };
  }, [courseId]);

  return (
    <div className={styles.courseDetails}>
      {error ? (
        <p className={styles.courseDetailsError}>{error}</p>
      ) : units === null ? (
        <p className={styles.courseDetailsLoading}>Loading course details…</p>
      ) : units.length === 0 ? (
        <p className={styles.courseDetailsLoading}>This course has no units yet.</p>
      ) : (
        <ul className={styles.courseUnitList}>
          {units.map((u, i) => (
            <li key={i} className={styles.courseUnitRow}>
              <Layers size={13} />
              <span>{u.name}</span>
              <span className={styles.courseUnitTopics}>{u.topicCount} topic{u.topicCount === 1 ? '' : 's'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

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
  if (!content) return null;

  const isCourse = competencyScoped && content.primaryCategory === 'Course';

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
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={lbl.libraryPreviewPanel.contentPreviewAriaLabel}
      onClick={onClose}
    >
      <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title} title={content.name}>
            {content.name}
          </span>
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
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.addBtn}
              onClick={() => onAdd(content)}
            >
              {lbl.libraryPreviewPanel.addToUnitButton}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
