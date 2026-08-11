import { useEffect } from 'react';
import { useTreeStore } from '../store/tree.store';
import { useEditorStore } from '../store/editor.store';
import { useSkillCategory } from './useSkillCategory';
import { resolveSkillsCoveredForSync } from '../utils/lpStructure';

/**
 * Keeps the LP root's own skill-category metadata field in sync with the
 * derived "Skills covered" union (Prior Assessment + every Level's own
 * selection + Outcome Assessment) — so adding a skill to a Level attaches it
 * to the path's own metadata too, not just that Level's. Mounted once from a
 * component that stays mounted for the whole editing session (not
 * UnitContentList, which mounts/unmounts per node selection).
 */
export function useSkillsCoveredSync(): void {
  const isLearningPath = useEditorStore((s) => s.editorProfile.key === 'learningPath');
  const treeData = useTreeStore((s) => s.treeData);
  const treeCache = useTreeStore((s) => s.treeCache);
  const updateNode = useTreeStore((s) => s.updateNode);
  const skillCategory = useSkillCategory();

  useEffect(() => {
    if (!isLearningPath || !skillCategory) return;
    const root = treeData[0];
    const toSync = resolveSkillsCoveredForSync(root, skillCategory.code, treeCache);
    if (toSync === null) return;
    updateNode(root!.id, { [skillCategory.code]: toSync }, [skillCategory.code]);
  }, [isLearningPath, treeData, treeCache, skillCategory, updateNode]);
}
