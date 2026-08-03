import { useEditorStore } from '../store/editor.store';
import { useFramework } from './useFramework';
import type { ICategory, ITerm } from '../types/framework';

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

export function useSkillCategory(): ISkillCategory | null {
  const config = useEditorStore((s) => s.editorConfig);
  const contentFramework = useEditorStore((s) => s.contentFramework);
  const frameworkId = (contentFramework ?? config?.context?.framework) as string | undefined;
  const { organisationFramework } = useFramework(frameworkId);
  return resolveSkillCategory(organisationFramework?.categories);
}
