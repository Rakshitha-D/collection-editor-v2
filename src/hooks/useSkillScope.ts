import { useMemo } from 'react';
import { useTreeStore } from '../store/tree.store';
import { isAssessmentLevel } from '../utils/lpStructure';
import { useSkillCategory, type ISkillCategory } from './useSkillCategory';
import { useSkillCatalog } from './useSkillCatalog';
import type { INode } from '../types/editor';

export interface ISkillScope {
  scope: string[];
  source: 'prior' | 'manual';
}

/**
 * LP skill scope, sole source of truth: the prior assessment's skill-category
 * tags when one is linked (resolved from THAT course's own framework only —
 * priorSkillCategory); otherwise every Level falls back to manual selection
 * from the catalog spanning EVERY relevant framework's highest-index
 * category (manualCatalogNames — see useSkillCatalog and
 * learning_path_multi_framework_skills_plan.md §2). Never derived from
 * linked courses or their content (learning_path_plan.md §3 item 1).
 */
export function resolveSkillScope(
  rootNode: INode | undefined,
  priorSkillCategory: ISkillCategory | null,
  manualCatalogNames: string[],
  treeCache: Record<string, Record<string, unknown>>,
): ISkillScope {
  const manual: ISkillScope = { scope: manualCatalogNames, source: 'manual' };
  if (!priorSkillCategory) return manual;

  const preLevel = rootNode?.children?.[0];
  if (!isAssessmentLevel(preLevel)) return manual;

  const priorCourse = preLevel?.children?.[0];
  if (!priorCourse) return manual;
  const cached = treeCache[priorCourse.id]?.[priorSkillCategory.code] as string[] | undefined;
  const raw = (cached ?? priorCourse.metadata?.[priorSkillCategory.code]) as string[] | string | undefined;
  const scope = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return { scope, source: 'prior' };
}

export function useSkillScope(): ISkillScope {
  const skillCategory = useSkillCategory();
  const catalog = useSkillCatalog();
  const treeData = useTreeStore((s) => s.treeData);
  const treeCache = useTreeStore((s) => s.treeCache);
  // De-duped by name for display/selection — entries keep per-framework
  // provenance separately (catalog.byFrameworkId) for search/tag resolution.
  const manualNames = useMemo(
    () => Array.from(new Set(catalog.entries.map((e) => e.name))),
    [catalog.entries],
  );

  return useMemo(
    () => resolveSkillScope(treeData[0], skillCategory, manualNames, treeCache),
    [treeData, skillCategory, manualNames, treeCache],
  );
}
