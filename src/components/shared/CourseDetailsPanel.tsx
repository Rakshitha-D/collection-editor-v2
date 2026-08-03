import React, { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { readCourseHierarchy } from '../../api/hierarchy';
import { useLabels } from '../../hooks/useLabels';
import styles from './CourseDetailsPanel.module.scss';

interface CourseUnitSummary {
  name: string;
  topicCount: number;
}

interface CourseDetailsPanelProps {
  courseId: string;
}

// LP profile: a linked Course is never played inline in the editor —
// authors/reviewers see this read-only "Course details" (Title, Units,
// Topics) instead, sourced from the course's own hierarchy. Shared between
// the library preview modal and the tree's leaf-content view.
export const CourseDetailsPanel: React.FC<CourseDetailsPanelProps> = ({ courseId }) => {
  const lbl = useLabels();
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
        if (!cancelled) setError(lbl.learningPath.courseDetailsError);
      });
    return () => { cancelled = true; };
  }, [courseId, lbl.learningPath.courseDetailsError]);

  return (
    <div className={styles.courseDetails}>
      {error ? (
        <p className={styles.courseDetailsError}>{error}</p>
      ) : units === null ? (
        <p className={styles.courseDetailsLoading}>{lbl.learningPath.courseDetailsLoading}</p>
      ) : units.length === 0 ? (
        <p className={styles.courseDetailsLoading}>{lbl.learningPath.courseDetailsEmpty}</p>
      ) : (
        <ul className={styles.courseUnitList}>
          {units.map((u, i) => (
            <li key={i} className={styles.courseUnitRow}>
              <Layers size={13} />
              <span>{u.name}</span>
              <span className={styles.courseUnitTopics}>
                {(u.topicCount === 1 ? lbl.learningPath.courseUnitTopicsLabel : lbl.learningPath.courseUnitTopicsLabelPlural)
                  .replace('{count}', String(u.topicCount))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
