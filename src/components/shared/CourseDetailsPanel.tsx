import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Video,
  FileText,
  Layers,
  Package,
  Music,
  HelpCircle,
  BookOpen,
  File,
} from 'lucide-react';
import { readCourseHierarchy, mapToINode } from '../../api/hierarchy';
import { getCtStyle } from '../../hooks/useContentType';
import { useSkillCategory } from '../../hooks/useSkillCategory';
import { useLabels } from '../../hooks/useLabels';
import type { INode } from '../../types/editor';
import styles from './CourseDetailsPanel.module.scss';

const CT_ICON_COMPONENTS: Record<string, React.ElementType> = {
  video: Video,
  pdf: FileText,
  h5p: Layers,
  scorm: Package,
  audio: Music,
  quiz: HelpCircle,
  course: BookOpen,
  default: File,
};

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return value ? [String(value)] : [];
}

interface CourseDetailsPanelProps {
  courseId: string;
  // 'compact' (default): the Library's "preview before adding" modal — just
  // the Units list. 'full': the tree's already-linked-course page, with the
  // extra Course details card and per-unit description/keywords/topics
  // (design: two distinct templates sharing the same hierarchy read).
  variant?: 'compact' | 'full';
  // 'full' only — the caller already knows the course's display title
  // synchronously (from the tree node), so it doesn't have to wait on this
  // panel's own fetch to paint its heading.
  title?: string;
  onLoaded?: (info: { totalContents: number }) => void;
}

// LP profile: a linked Course is never played inline in the editor —
// authors/reviewers see this read-only "Course details" (Units, their
// content, and each content item's skill tags) instead, sourced from the
// course's own hierarchy. Shared between the library preview modal and the
// tree's leaf-content view.
export const CourseDetailsPanel: React.FC<CourseDetailsPanelProps> = ({ courseId, variant = 'compact', title, onLoaded }) => {
  const lbl = useLabels();
  const skillCategory = useSkillCategory();
  const [units, setUnits] = useState<INode[] | null>(null);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const isFull = variant === 'full';

  useEffect(() => {
    let cancelled = false;
    setUnits(null);
    setDescription('');
    setError(null);
    readCourseHierarchy(courseId)
      .then((course) => {
        if (cancelled) return;
        const rawUnits = (course['children'] as unknown[] | undefined) ?? [];
        const mapped = rawUnits.map((u) => mapToINode(u));
        setUnits(mapped);
        setDescription((course['description'] as string) ?? '');
        // Units start expanded (design) — the author is here to see what's inside.
        setExpanded(Object.fromEntries(mapped.map((u) => [u.id, true])));
        onLoaded?.({ totalContents: mapped.reduce((sum, u) => sum + (u.children?.length ?? 0), 0) });
      })
      .catch(() => {
        if (!cancelled) setError(lbl.learningPath.courseDetailsError);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, lbl.learningPath.courseDetailsError]);

  const toggleUnit = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const skillsFor = (content: INode): string[] => {
    if (!skillCategory) return [];
    return toStringList(content.metadata?.[skillCategory.code]);
  };

  const contentCountLabel = (count: number) =>
    (count === 1 ? lbl.learningPath.contentCountLabel : lbl.learningPath.contentCountLabelPlural)
      .replace('{count}', String(count));

  return (
    <div className={styles.courseDetails}>
      {error ? (
        <p className={styles.courseDetailsError}>{error}</p>
      ) : units === null ? (
        <p className={styles.courseDetailsLoading}>{lbl.learningPath.courseDetailsLoading}</p>
      ) : (
        <>
          {isFull && (
            <div className={styles.detailsCard}>
              <h3 className={styles.cardTitle}>{lbl.learningPath.courseDetailsCardTitle}</h3>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>{lbl.learningPath.courseTitleFieldLabel}</span>
                <div className={styles.fieldValue}>{title}</div>
              </div>
              <div className={styles.fieldGroupLast}>
                <span className={styles.fieldLabel}>{lbl.learningPath.courseDescriptionFieldLabel}</span>
                <div className={styles.fieldValueMultiline}>
                  {description || lbl.learningPath.noCourseDescriptionPlaceholder}
                </div>
              </div>
            </div>
          )}
          {units.length === 0 ? (
            <p className={styles.courseDetailsLoading}>{lbl.learningPath.courseDetailsEmpty}</p>
          ) : (
            <div className={isFull ? styles.unitsCard : undefined}>
              <span className={styles.unitsLabel}>{lbl.learningPath.unitsSectionLabel}</span>
              {isFull && <p className={styles.unitsDescription}>{lbl.learningPath.unitsSectionDescription}</p>}
              <div className={styles.unitList}>
                {units.map((unit) => {
                  const isExpanded = !!expanded[unit.id];
                  const contentCount = (unit.children ?? []).length;
                  const keywords = toStringList(unit.metadata?.['keywords']);
                  const topics = toStringList(unit.metadata?.['topic']);
                  return (
                    <div key={unit.id} className={styles.unitCard}>
                      <button
                        type="button"
                        className={styles.unitHeader}
                        onClick={() => toggleUnit(unit.id)}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                        <span className={styles.unitIcon}><Folder size={16} /></span>
                        <span className={styles.unitTitle}>{unit.name}</span>
                        {isFull && <span className={styles.unitCount}>{contentCountLabel(contentCount)}</span>}
                      </button>
                      {isExpanded && (
                        <div className={styles.unitBody}>
                          {isFull && unit.description && (
                            <p className={styles.unitDescription}>{unit.description}</p>
                          )}
                          {isFull && keywords.length > 0 && (
                            <div className={styles.unitKeywords}>
                              {keywords.map((k) => <span key={k} className={styles.keywordPill}>{k}</span>)}
                            </div>
                          )}
                          {isFull && topics.length > 0 && (
                            <div className={styles.unitTopicsRow}>
                              <span className={styles.fieldLabel}>{lbl.learningPath.unitTopicsFieldLabel}</span>
                              <span>{topics.join(', ')}</span>
                            </div>
                          )}
                          <div className={styles.unitContents}>
                            {(unit.children ?? []).map((content) => {
                              const ctStyle = getCtStyle(content);
                              const CtIcon = CT_ICON_COMPONENTS[ctStyle.key] ?? File;
                              const skills = skillsFor(content);
                              return (
                                <div key={content.id} className={styles.contentRow}>
                                  <CtIcon size={16} className={styles.contentIcon} />
                                  <span className={styles.contentTitle}>{content.name}</span>
                                  {skills.length > 0 && (
                                    <div className={styles.contentSkills}>
                                      {skills.map((s) => <span key={s} className={styles.skillPill}>{s}</span>)}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
