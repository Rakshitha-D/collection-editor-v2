import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useTreeStore } from '../store/tree.store';
import { useEditorStore } from '../store/editor.store';
import { useLabels } from './useLabels';
import { useSkillCategory } from './useSkillCategory';
import { useSkillScope } from './useSkillScope';
import { findLevelsWithOutOfScopeSkills } from '../utils/lpStructure';

/**
 * Proactively toasts when linking or changing the Prior Assessment narrows
 * the skill scope enough that one or more existing content Levels now have
 * a selected skill outside it — otherwise this only ever surfaces later, as
 * a levelSkillsOutOfScope issue at send-for-review/publish time. Mounted
 * once from a component that stays mounted for the whole editing session
 * (not UnitContentList, which mounts/unmounts per node selection and would
 * lose its "have I already alerted for this" state on every navigation).
 */
export function useSkillScopeNarrowingAlert(): void {
  const lbl = useLabels();
  const isLearningPath = useEditorStore((s) => s.editorProfile.key === 'learningPath');
  const treeData = useTreeStore((s) => s.treeData);
  const skillCategory = useSkillCategory();
  const { scope, source } = useSkillScope();

  const hasCheckedOnceRef = useRef(false);
  const prevAffectedKeyRef = useRef('');

  useEffect(() => {
    if (!isLearningPath || source !== 'prior' || !skillCategory) return;
    const affected = findLevelsWithOutOfScopeSkills(treeData[0], skillCategory.code, scope);
    const key = affected.map((l) => l.id).sort().join(',');

    // Skip the first computation (e.g. on initial load of an existing path)
    // — only alert on a genuine narrowing that happens during this session.
    if (!hasCheckedOnceRef.current) {
      hasCheckedOnceRef.current = true;
    } else if (affected.length > 0 && key !== prevAffectedKeyRef.current) {
      toast.error(lbl.learningPath.priorAssessmentNarrowedScopeToast.replace('{count}', String(affected.length)));
    }
    prevAffectedKeyRef.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLearningPath, source, scope.join('|'), skillCategory?.code, treeData]);
}
