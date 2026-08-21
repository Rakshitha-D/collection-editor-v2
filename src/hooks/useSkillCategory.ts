import { useTreeStore } from '../store/tree.store';
import { useFramework } from './useFramework';
import { getCourseFrameworkId, isAssessmentLevel } from '../utils/lpStructure';
import type { ICategory, ITerm } from '../types/framework';
import type { INode } from '../types/editor';

export interface ISkillCategory {
  /** The metadata field used for tagging Levels/Courses and filtering course search. */
  code: string;
  /** The skill catalog — this category's terms. */
  terms: ITerm[];
}

/**
 * Skills are not a fixed field: resolve the active framework's
 * skill-equivalent category. USF exposes it directly as the `skill`
 * category; any other framework's highest-index category is the
 * skill-equivalent (USF's `skill` category also has the highest index, so
 * one rule covers both — see learning_path_plan.md §3 item 0). Categories
 * missing `index` are treated as lower priority than any category that
 * declares one, rather than crashing the comparison.
 */
export function resolveSkillCategory(categories: ICategory[] | undefined): ISkillCategory | null {
  if (!categories?.length) return null;
  const highest = categories.reduce((best, c) =>
    (c.index ?? -Infinity) > (best.index ?? -Infinity) ? c : best);
  return { code: highest.code, terms: highest.terms ?? [] };
}

/** The prior-assessment course's own framework, when one is linked. Its skill
 *  tags live under *that* framework's skill category — an LP whose own
 *  framework is a fallback (e.g. context default) must not resolve the skill
 *  field against the wrong taxonomy. */
export function resolvePriorCourseFramework(rootNode: INode | undefined): string | undefined {
  const preLevel = rootNode?.children?.[0];
  if (!isAssessmentLevel(preLevel)) return undefined;
  return getCourseFrameworkId(preLevel?.children?.[0]);
}

/**
 * The skill category for the linked Prior Assessment course specifically —
 * resolved from THAT course's own framework, nothing else. There is no
 * root-level "Curriculum" or context-default fallback anymore
 * (learning_path_multi_framework_skills_plan.md §2): a Learning Path's
 * courses may span several frameworks, so there is no single ambient
 * framework to fall back to. Returns null when no Prior Assessment is
 * linked (or it has no resolvable framework) — callers use the
 * multi-framework catalog (useSkillCatalog) instead in that case.
 */
export function useSkillCategory(): ISkillCategory | null {
  const treeData = useTreeStore((s) => s.treeData);
  const frameworkId = resolvePriorCourseFramework(treeData[0]);
  const { organisationFramework } = useFramework(frameworkId);
  return resolveSkillCategory(organisationFramework?.categories);
}
