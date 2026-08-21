import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getFramework } from '../api/framework';
import { useEditorStore } from '../store/editor.store';
import { useChannelData } from './useChannelData';
import { useFrameworkOptions } from './useFrameworkOptions';
import { resolveSkillCategory } from './useSkillCategory';
import type { ITerm } from '../types/framework';

export interface SkillCatalogEntry {
  name: string;
  frameworkId: string;
  categoryCode: string;
}

export interface ISkillCatalog {
  /** Flat, for the manual skill picker — one entry per (framework, term). */
  entries: SkillCatalogEntry[];
  /** Per-framework resolved skill category, for reading any course's own tag. */
  byFrameworkId: Record<string, { code: string; terms: ITerm[] }>;
  isLoading: boolean;
}

/**
 * The Learning Path skill catalog spans EVERY relevant framework, not one
 * chosen "Curriculum" — a path's linked courses may be tagged under
 * different frameworks entirely (learning_path_multi_framework_skills_plan.md
 * §2). For each relevant framework, resolve its highest-index category
 * (resolveSkillCategory — USF's `skill`, another framework's own
 * skill-equivalent) and union every framework's terms into one catalog.
 *
 * "Relevant frameworks" reuses the exact discovery useFrameworkOptions
 * already does for the (now-removed) Curriculum dropdown — the channel's own
 * frameworks, extended with system-default frameworks of any
 * categoryMeta.frameworkMetadata.orgFWType the channel doesn't cover — just
 * no longer gated behind picking one of them.
 */
export function useSkillCatalog(): ISkillCatalog {
  const config = useEditorStore((s) => s.editorConfig);
  const categoryMeta = useEditorStore((s) => s.categoryMeta);
  const channel = config?.context?.channel as string | undefined;
  const { frameworks: channelFrameworks } = useChannelData(channel);
  const frameworkOptions = useFrameworkOptions(
    channelFrameworks, categoryMeta?.frameworkMetadata?.orgFWType, channel,
  );
  const frameworkIds = useMemo(
    () => frameworkOptions.map((f) => f.value),
    [frameworkOptions],
  );

  const queries = useQueries({
    queries: frameworkIds.map((id) => ({
      queryKey: ['framework', id],
      queryFn: () => getFramework(id),
      staleTime: 5 * 60 * 1000,
    })),
  });

  return useMemo(() => {
    const entries: SkillCatalogEntry[] = [];
    const byFrameworkId: Record<string, { code: string; terms: ITerm[] }> = {};
    queries.forEach((q, i) => {
      const framework = q.data;
      if (!framework?.categories?.length) return;
      const skillCategory = resolveSkillCategory(framework.categories);
      if (!skillCategory) return;
      const frameworkId = frameworkIds[i];
      byFrameworkId[frameworkId] = skillCategory;
      skillCategory.terms.forEach((t) => entries.push({
        name: t.name, frameworkId, categoryCode: skillCategory.code,
      }));
    });
    return {
      entries,
      byFrameworkId,
      isLoading: queries.some((q) => q.isLoading),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries, frameworkIds]);
}
