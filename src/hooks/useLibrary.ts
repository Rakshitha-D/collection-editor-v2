import { useCallback, useEffect, useRef } from 'react';
import { useLibraryStore } from '../store/library.store';
import { useEditorStore } from '../store/editor.store';
import { useTreeStore } from '../store/tree.store';
import { useUiStore } from '../store/ui.store';
import { useSkillCategory } from './useSkillCategory';
import { useSkillCatalog, type SkillCatalogEntry } from './useSkillCatalog';
import { useSkillScope } from './useSkillScope';
import { isAssessmentLevel } from '../utils/lpStructure';
import { compositeSearch, DEFAULT_SEARCH_FIELDS } from '../api/content';
import { LIBRARY_PRIMARY_CATEGORIES } from '../types/content';
import type { IContent } from '../types/content';
import type { LibraryFilters } from '../components/LibraryDock/LibraryFilterPanel';

/**
 * Groups selected skill NAMES by the metadata field they must be filtered
 * under (learning_path_multi_framework_skills_plan.md §5). In 'prior' scope
 * there is exactly one relevant code — the Prior Assessment course's own
 * resolved category — since every option the picker offered came from it.
 * In 'manual' scope (no Prior Assessment) a Level's selection may span
 * several frameworks at once, so each name is looked up in the catalog
 * (a name can map to more than one code if two frameworks happen to reuse
 * it — grouped into both).
 */
export function groupSkillsByCode(
  selectedSkills: string[],
  scopeSource: 'prior' | 'manual',
  priorSkillCode: string | undefined,
  catalogEntries: SkillCatalogEntry[],
): Record<string, string[]> {
  if (selectedSkills.length === 0) return {};
  if (scopeSource === 'prior') {
    return priorSkillCode ? { [priorSkillCode]: selectedSkills } : {};
  }
  const groups: Record<string, string[]> = {};
  for (const name of selectedSkills) {
    for (const entry of catalogEntries) {
      if (entry.name !== name) continue;
      (groups[entry.categoryCode] ??= []).push(name);
    }
  }
  return groups;
}

/**
 * LP profile library filter VARIANTS — search is strictly constrained to
 * Courses. Filling the pre/post assessment slot has no competency
 * constraint (the prior assessment *defines* the skill scope, so it can't
 * be filtered by it). Browsing a Level otherwise shows every Course by
 * default, narrowed to the selected skills once the author has picked any.
 *
 * Composite search ANDs top-level filter keys — there's no native cross-
 * field OR — so a selection spanning multiple codes returns one filter
 * object PER code; the caller fans out and merges (learning_path_multi_framework_skills_plan.md §5).
 * A single-code (or no-code) selection returns exactly one variant — the
 * pre-existing, fully-correct-pagination path.
 */
export function buildLpLibraryFilterVariants(
  activeAssessmentSlot: 'pre' | 'post' | null,
  codeGroups: Record<string, string[]>,
): Array<Record<string, unknown>> {
  const base: Record<string, unknown> = { primaryCategory: ['Course'] };
  if (activeAssessmentSlot) return [base];
  const entries = Object.entries(codeGroups);
  if (entries.length === 0) return [base];
  return entries.map(([code, names]) => ({ ...base, [code]: names }));
}

/**
 * LP profile search fields: append EVERY known skill-category code (one per
 * relevant framework) so a returned course carries whatever skill tag it
 * actually has, regardless of which framework it turns out to belong to —
 * Skills covered, useSkillScope, and the publish-time "course has no skill
 * tag" check all read these fields off the linked course node, and they're
 * otherwise absent from the default search field set (Collection profile
 * leaves the default fields untouched).
 */
export function buildSearchFields(
  competencyScoped: boolean,
  skillCategoryCodes: string[],
): string[] | undefined {
  if (!competencyScoped || skillCategoryCodes.length === 0) return undefined;
  // 'framework' rides along so a linked course knows which taxonomy its
  // skill tags live under (each course resolves its OWN framework independently).
  return [...DEFAULT_SEARCH_FIELDS, ...new Set(skillCategoryCodes), 'framework'];
}

/**
 * Why the Library is (or would be) empty for the LP profile, so the dock can
 * show a guiding message instead of the generic "no results" empty state —
 * with no skills selected on a content Level there's nothing to filter by,
 * so browsing must show nothing rather than every course. Doesn't apply to
 * Collection, root, an assessment Level, or while filling the Prior/Outcome
 * Assessment slot (that course *defines* the skill scope, so it can't be
 * filtered by it).
 */
export function computeLibraryEmptyReason(
  competencyScoped: boolean,
  isLpLevel: boolean,
  activeAssessmentSlot: 'pre' | 'post' | null,
  selectedSkills: string[],
): 'noSkills' | null {
  if (!competencyScoped) return null;
  if (isLpLevel && !activeAssessmentSlot && selectedSkills.length === 0) return 'noSkills';
  return null;
}

const PAGE_SIZE = 20;
const EMPTY_SKILLS: string[] = [];

/**
 * Returns allowed primaryCategory values for the currently selected unit,
 * driven by editorConfig.config.hierarchy.levelN.children.Content.
 * Falls back to the full LIBRARY_PRIMARY_CATEGORIES constant.
 *
 * An Evaluation Course profile overrides this entirely, at every depth
 * (root or any Course Unit) — its content must be Question Sets or ECML
 * assessment content only, never regular course material.
 */
export function useAllowedCategories(): string[] {
  const config = useEditorStore((s) => s.editorConfig);
  const editorProfile = useEditorStore((s) => s.editorProfile);
  const selectedNodeId = useTreeStore((s) => s.selectedNodeId);
  const treeData = useTreeStore((s) => s.treeData);

  if (editorProfile.restrictedContentCategories) {
    return editorProfile.restrictedContentCategories;
  }

  // Compute selected node depth (root = 0)
  const depth = useCallback(() => {
    if (!selectedNodeId || !treeData.length) return 0;
    function getDepth(nodes: typeof treeData, id: string, d = 0): number {
      for (const n of nodes) {
        if (n.id === id) return d;
        if (n.children?.length) {
          const found = getDepth(n.children, id, d + 1);
          if (found >= 0) return found;
        }
      }
      return -1;
    }
    return Math.max(0, getDepth(treeData, selectedNodeId));
  }, [selectedNodeId, treeData])();

  const hierarchy = config?.config?.hierarchy as Record<string, unknown> | undefined;
  if (!hierarchy) return [...LIBRARY_PRIMARY_CATEGORIES];

  // level1 = depth 1, level2 = depth 2, etc.
  const levelKey = `level${depth}`;
  const levelConfig = hierarchy[levelKey] as Record<string, unknown> | undefined;
  const children = levelConfig?.children as Record<string, unknown> | undefined;
  const contentCategories = children?.['Content'] as string[] | undefined;

  if (contentCategories?.length) return contentCategories;
  return [...LIBRARY_PRIMARY_CATEGORIES];
}

// Merge multiple compositeSearch results by content identifier — used only
// when a Level's selected skills span more than one framework/code (§5).
function mergeByIdentifier(results: Array<{ content: IContent[]; count: number }>): { content: IContent[]; count: number } {
  const seen = new Set<string>();
  const content: IContent[] = [];
  for (const r of results) {
    for (const item of r.content) {
      if (seen.has(item.identifier)) continue;
      seen.add(item.identifier);
      content.push(item);
    }
  }
  // Approximate — Sunbird's per-branch counts don't sum to a true union
  // count; acceptable given multi-framework selections on one Level are the
  // uncommon case (see learning_path_multi_framework_skills_plan.md §5/§6).
  return { content, count: content.length };
}

export function useLibrary() {
  const store = useLibraryStore();
  const channel = useEditorStore((s) => s.editorConfig?.context?.channel ?? '');
  const allowedCategories = useAllowedCategories();
  const editorProfile = useEditorStore((s) => s.editorProfile);
  const activeAssessmentSlot = useUiStore((s) => s.activeAssessmentSlot);
  const activeNodeMeta = useTreeStore((s) => s.activeNodeMeta);
  const selectedNodeId = useTreeStore((s) => s.selectedNodeId);
  const getNodeById = useTreeStore((s) => s.getNodeById);
  const priorSkillCategory = useSkillCategory();
  const { entries: catalogEntries, byFrameworkId } = useSkillCatalog();
  const { source: skillScopeSource } = useSkillScope();
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Same fixed field a Level's own SkillPicker writes to (never the reserved
  // Sunbird `competencies` field — see lpStructure.ts).
  const selectedLevelSkills = Array.isArray(activeNodeMeta['skills'])
    ? activeNodeMeta['skills'] as string[]
    : EMPTY_SKILLS;

  // A regular content Level (not root, not a pre/post/level-assessment slot
  // — those hold exactly one course and have no skill picker of their own).
  // Only this context requires skills to be picked before browsing.
  const selectedNode = selectedNodeId ? getNodeById(selectedNodeId) : undefined;
  const isLpLevel = editorProfile.competencyScoped
    && !!selectedNode?.isFolder && !!selectedNode.parent && !isAssessmentLevel(selectedNode);

  const emptyReason = computeLibraryEmptyReason(
    editorProfile.competencyScoped, isLpLevel, activeAssessmentSlot, selectedLevelSkills,
  );

  const allSkillCategoryCodes = Object.values(byFrameworkId).map((v) => v.code);
  const codeGroups = groupSkillsByCode(
    selectedLevelSkills, skillScopeSource, priorSkillCategory?.code, catalogEntries,
  );

  const load = useCallback(
    async (
      query = '',
      filter = 'all',
      advancedFilters: LibraryFilters = {},
      reset = true,
      sortAZ = false,
    ) => {
      store.setLoading(true);
      try {
        // No skills selected on a content Level yet: nothing to scope the
        // search by, so show nothing rather than every course (see
        // emptyReason above for why this applies).
        if (emptyReason) {
          store.setContent([], 0);
          return;
        }

        const currentOffset = reset ? 0 : store.offset;
        const searchFields = buildSearchFields(editorProfile.competencyScoped, allSkillCategoryCodes);

        if (editorProfile.competencyScoped) {
          const variants = buildLpLibraryFilterVariants(activeAssessmentSlot, codeGroups);
          const results = await Promise.all(variants.map((filters) => compositeSearch({
            filters: { status: ['Live'], ...filters },
            query,
            limit: query ? 50 : PAGE_SIZE,
            offset: currentOffset,
            channel: channel || undefined,
            sortBy: sortAZ ? { name: 'asc' } : { lastUpdatedOn: 'desc' },
            fields: searchFields,
          })));
          const { content, count } = variants.length > 1 ? mergeByIdentifier(results) : results[0];
          if (reset) store.setContent(content, count);
          else store.appendContent(content, count);
          return;
        }

        const filters: Record<string, unknown> = {
          status: ['Live'],
          primaryCategory: filter && filter !== 'all'
            ? [filter]
            : allowedCategories,
        };
        if (advancedFilters?.board?.length) filters['board'] = advancedFilters.board;
        if (advancedFilters?.medium?.length) filters['medium'] = advancedFilters.medium;
        if (advancedFilters?.gradeLevel?.length) filters['gradeLevel'] = advancedFilters.gradeLevel;
        if (advancedFilters?.subject?.length) filters['subject'] = advancedFilters.subject;
        if (advancedFilters?.primaryCategory?.length) filters['primaryCategory'] = advancedFilters.primaryCategory;

        const { content, count } = await compositeSearch({
          filters,
          query,
          limit: query ? 50 : PAGE_SIZE,
          offset: currentOffset,
          channel: channel || undefined,
          sortBy: sortAZ ? { name: 'asc' } : { lastUpdatedOn: 'desc' },
          fields: searchFields,
        });

        if (reset) {
          store.setContent(content, count);
        } else {
          store.appendContent(content, count);
        }
      } catch (e) {
        console.error('[useLibrary] load error:', e);
      } finally {
        store.setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allowedCategories, channel, editorProfile, activeAssessmentSlot, JSON.stringify(codeGroups), allSkillCategoryCodes.join('|'), emptyReason],
  );

  // Initial/channel-driven load — applies to every profile.
  // editorProfile.key is included because it resolves asynchronously
  // (useEditorInit calls setEditorProfile after this hook's own mount
  // effect may already have fired with the store's default collectionProfile)
  // — without it, an Evaluation Course's restrictedContentCategories would
  // never take effect: the very first load() call captures the default
  // (unrestricted) allowedCategories, and nothing else re-triggers this
  // effect since channel itself doesn't change once the profile resolves.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, editorProfile.key]);

  // LP-only: re-run on anything that changes what the search should be
  // scoped to (assessment slot armed, a Level's selected skills, or which
  // node is selected — moving from a skills-empty Level to the root/another
  // node can change emptyReason without changing selectedLevelSkills itself,
  // e.g. both read as []). Gated by competencyScoped so Collection's
  // user-driven search/filter/sort state (set via the search/setFilter/etc.
  // callbacks below) is never silently reset just because the author
  // clicked a different tree node.
  useEffect(() => {
    if (!editorProfile.competencyScoped) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorProfile.competencyScoped, activeAssessmentSlot, selectedLevelSkills.join('|'), selectedNodeId]);

  const search = useCallback(
    (query: string) => {
      store.setSearch(query);
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(
        () => load(query, store.activeFilter, store.advancedFilters, true, store.sortAZ),
        300,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.activeFilter, store.advancedFilters, store.sortAZ, load],
  );

  const setFilter = useCallback(
    (filter: string) => {
      store.setFilter(filter);
      load(store.searchQuery, filter, store.advancedFilters, true, store.sortAZ);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.searchQuery, store.advancedFilters, store.sortAZ, load],
  );

  const applyAdvancedFilters = useCallback(
    (advancedFilters: LibraryFilters) => {
      store.setAdvancedFilters(advancedFilters);
      load(store.searchQuery, store.activeFilter, advancedFilters, true, store.sortAZ);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.searchQuery, store.activeFilter, store.sortAZ, load],
  );

  const toggleSort = useCallback(() => {
    const nextSortAZ = !store.sortAZ;
    store.setSortAZ(nextSortAZ);
    load(store.searchQuery, store.activeFilter, store.advancedFilters, true, nextSortAZ);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.sortAZ, store.searchQuery, store.activeFilter, store.advancedFilters, load]);

  const loadMore = useCallback(() => {
    if (store.isLoading) return;
    load(store.searchQuery, store.activeFilter, store.advancedFilters, false, store.sortAZ);
  }, [store.isLoading, store.searchQuery, store.activeFilter, store.advancedFilters, store.sortAZ, load]);

  const hasMore = store.allContent.length < store.totalCount;

  return {
    content: store.filteredContent,
    isLoading: store.isLoading,
    totalCount: store.totalCount,
    activeFilter: store.activeFilter,
    advancedFilters: store.advancedFilters,
    searchQuery: store.searchQuery,
    sortAZ: store.sortAZ,
    hasMore,
    search,
    setFilter,
    applyAdvancedFilters,
    toggleSort,
    loadMore,
    refetch: () => load(store.searchQuery, store.activeFilter, store.advancedFilters, true, store.sortAZ),
    // LP profile only — drives the dock's "filling the Prior/Outcome
    // Assessment slot" banner.
    activeAssessmentSlot,
    // LP profile only — why content is (or would be) empty, so the dock can
    // show a guiding message instead of the generic "no results" state.
    emptyReason,
  };
}
