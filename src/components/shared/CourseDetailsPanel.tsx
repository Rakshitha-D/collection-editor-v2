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

interface CourseDetailsPanelProps {
  courseId: string;
}

// LP profile: a linked Course is never played inline in the editor —
// authors/reviewers see this read-only "Course details" (Units, their
// content, and each content item's skill tags) instead, sourced from the
// course's own hierarchy. Shared between the library preview modal and the
// tree's leaf-content view.
export const CourseDetailsPanel: React.FC<CourseDetailsPanelProps> = ({ courseId }) => {
  const lbl = useLabels();
  const skillCategory = useSkillCategory();
  const [units, setUnits] = useState<INode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    setUnits(null);
    setError(null);
    readCourseHierarchy(courseId)
      .then((course) => {
        if (cancelled) return;
        const rawUnits = (course['children'] as unknown[] | undefined) ?? [];
        const mapped = rawUnits.map((u) => mapToINode(u));
        setUnits(mapped);
        // Units start expanded (design) — the author is here to see what's inside.
        setExpanded(Object.fromEntries(mapped.map((u) => [u.id, true])));
      })
      .catch(() => {
        if (!cancelled) setError(lbl.learningPath.courseDetailsError);
      });
    return () => { cancelled = true; };
  }, [courseId, lbl.learningPath.courseDetailsError]);

  const toggleUnit = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const skillsFor = (content: INode): string[] => {
    if (!skillCategory) return [];
    const raw = content.metadata?.[skillCategory.code];
    return Array.isArray(raw) ? raw as string[] : raw ? [String(raw)] : [];
  };

  return (
    <div className={styles.courseDetails}>
      {error ? (
        <p className={styles.courseDetailsError}>{error}</p>
      ) : units === null ? (
        <p className={styles.courseDetailsLoading}>{lbl.learningPath.courseDetailsLoading}</p>
      ) : units.length === 0 ? (
        <p className={styles.courseDetailsLoading}>{lbl.learningPath.courseDetailsEmpty}</p>
      ) : (
        <>
          <span className={styles.unitsLabel}>{lbl.learningPath.unitsSectionLabel}</span>
          <div className={styles.unitList}>
            {units.map((unit) => {
              const isExpanded = !!expanded[unit.id];
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
                  </button>
                  {isExpanded && (
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
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
