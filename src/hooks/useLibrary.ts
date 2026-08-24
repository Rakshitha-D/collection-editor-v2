import { useCallback, useEffect, useRef } from 'react';
import { useLibraryStore } from '../store/library.store';
import { useEditorStore } from '../store/editor.store';
import { useTreeStore } from '../store/tree.store';
import { useUiStore } from '../store/ui.store';
import { useSkillCategory } from './useSkillCategory';
import { EVALUATION_COURSE_CATEGORY, getExplicitCurriculum, isAssessmentLevel } from '../utils/lpStructure';
import { compositeSearch, DEFAULT_SEARCH_FIELDS } from '../api/content';
import { LIBRARY_PRIMARY_CATEGORIES } from '../types/content';
import type { LibraryFilters } from '../components/LibraryDock/LibraryFilterPanel';

/**
 * LP profile library filters: search is strictly constrained to Courses, or
 * to Evaluation Course specifically while picking the Prior/Outcome slot or
 * a Level Exam course (isPickingEvaluationCourse) — a course can only ever
 * fill those roles by being authored under that category (see
 * isEvaluationCourse). Filling the pre/post assessment slot additionally has
 * no competency constraint (the prior assessment *defines* the skill scope,
 * so it can't be filtered by it) — a Level Exam pick, by contrast, IS still
 * narrowed by the Level's selected skills, same as any other course added to
 * that Level. Browsing a Level otherwise shows every Course by default,
 * narrowed to the selected skills once the author has picked any.
 */
export function buildLpLibraryFilters(
  activeAssessmentSlot: 'pre' | 'post' | null,
  isPickingEvaluationCourse: boolean,
  selectedSkills: string[],
  skillCategoryCode: string | undefined,
  frameworkId?: string,
): Record<string, unknown> {
  const filters: Record<string, unknown> = {
    primaryCategory: [isPickingEvaluationCourse ? EVALUATION_COURSE_CATEGORY : 'Course'],
  };
  // Courses must belong to the LP root's selected curriculum (framework) —
  // a course tagged under another framework carries skills the path's scope
  // can't read.
  if (frameworkId) filters['framework'] = [frameworkId];
  if (!activeAssessmentSlot && selectedSkills.length && skillCategoryCode) {
    filters[skillCategoryCode] = selectedSkills;
  }
  return filters;
}

/**
 * LP profile search fields: append the resolved skill-category code so each
 * returned course carries its own skill tags in `metadata` — Skills
 * covered, useSkillScope, and the publish-time "course has no skill tag"
 * check all read that field off the linked course node, and it's otherwise
 * absent from the default search field set (Collection profile leaves the
 * default fields untouched).
 */
export function buildSearchFields(
  competencyScoped: boolean,
  skillCategoryCode: string | undefined,
): string[] | undefined {
  if (!competencyScoped || !skillCategoryCode) return undefined;
  // 'framework' rides along so a linked course knows which taxonomy its
  // skill tags live under (useSkillCategory resolves via the prior course's
  // framework, which may differ from the LP's own).
  return [...DEFAULT_SEARCH_FIELDS, skillCategoryCode, 'framework'];
}

/**
 * Why the Library is (or would be) empty for the LP profile, so the dock can
 * show a guiding message instead of the generic "no results" empty state —
 * mandatory per learning_path_plan.md §3 item 3: with no Curriculum chosen
 * there's no framework to scope search by, and with no skills selected on a
 * content Level there's nothing to filter by, so browsing must show nothing
 * rather than every course. Doesn't apply to Collection, root, an assessment
 * Level, or while picking an Evaluation Course for the Prior/Outcome
 * Assessment slot or a Level Exam — that course *defines* the skill scope
 * (and isn't required to belong to any particular Curriculum), so neither
 * gate applies while filling it. isPickingEvaluationCourse mirrors
 * useLibrary's own activeAssessmentSlot-or-activeLevelExamTarget check.
 */
export function computeLibraryEmptyReason(
  competencyScoped: boolean,
  frameworkId: string | undefined,
  isLpLevel: boolean,
  activeAssessmentSlot: 'pre' | 'post' | null,
  selectedSkills: string[],
  isPickingEvaluationCourse = false,
): 'noCurriculum' | 'noSkills' | null {
  if (!competencyScoped) return null;
  if (isPickingEvaluationCourse) return null;
  if (!frameworkId) return 'noCurriculum';
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

export function useLibrary() {
  const store = useLibraryStore();
  const channel = useEditorStore((s) => s.editorConfig?.context?.channel ?? '');
  const allowedCategories = useAllowedCategories();
  const editorProfile = useEditorStore((s) => s.editorProfile);
  const activeAssessmentSlot = useUiStore((s) => s.activeAssessmentSlot);
  const activeLevelExamTarget = useUiStore((s) => s.activeLevelExamTarget);
  const activeNodeMeta = useTreeStore((s) => s.activeNodeMeta);
  const treeData = useTreeStore((s) => s.treeData);
  const treeCache = useTreeStore((s) => s.treeCache);
  const selectedNodeId = useTreeStore((s) => s.selectedNodeId);
  const getNodeById = useTreeStore((s) => s.getNodeById);
  const skillCategory = useSkillCategory();
  // The LP root's EXPLICITLY chosen Curriculum only — never the channel/
  // context default (contentFramework) that useEditorInit/SparkMetaForm
  // resolve just so *something* exists to browse before the author has
  // chosen anything. Until this is set, the Library shows nothing rather
  // than silently scoping to a framework the author never picked.
  const lpFrameworkId = editorProfile.competencyScoped
    ? getExplicitCurriculum(treeData[0], treeCache)
    : undefined;
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Same resolved skill-category field a Level's own SkillPicker writes to
  // (never the reserved Sunbird `competencies` field — see lpStructure.ts).
  const selectedLevelSkills = skillCategory && Array.isArray(activeNodeMeta[skillCategory.code])
    ? activeNodeMeta[skillCategory.code] as string[]
    : EMPTY_SKILLS;

  // A regular content Level (not root, not a pre/post/level-assessment slot
  // — those hold exactly one course and have no skill picker of their own).
  // Only this context requires skills to be picked before browsing.
  const selectedNode = selectedNodeId ? getNodeById(selectedNodeId) : undefined;
  const isLpLevel = editorProfile.competencyScoped
    && !!selectedNode?.isFolder && !!selectedNode.parent && !isAssessmentLevel(selectedNode);

  const isPickingEvaluationCourse = !!activeAssessmentSlot || !!activeLevelExamTarget;

  const emptyReason = computeLibraryEmptyReason(
    editorProfile.competencyScoped, lpFrameworkId, isLpLevel, activeAssessmentSlot, selectedLevelSkills,
    isPickingEvaluationCourse,
  );

  // Guards against out-of-order resolution: load() is invoked from several
  // independent triggers (initial/channel effect, the LP-only slot/skills/
  // Curriculum effect, search/setFilter/applyAdvancedFilters/toggleSort/
  // loadMore) that can fire in quick succession — e.g. clicking through
  // Levels rapidly, or typing then immediately selecting a different node
  // before the debounced search resolves. Without this, an older request
  // resolving after a newer one silently overwrites the current selection's
  // results with stale ones.
  const requestIdRef = useRef(0);

  const load = useCallback(
    async (
      query = '',
      filter = 'all',
      advancedFilters: LibraryFilters = {},
      reset = true,
      sortAZ = false,
    ) => {
      const requestId = ++requestIdRef.current;
      store.setLoading(true);
      try {
        // No Curriculum chosen yet, or (viewing a content Level) no skills
        // selected on it yet: nothing to scope the search by, so show
        // nothing rather than every course in the framework (see
        // emptyReason above for why each case applies).
        if (emptyReason) {
          if (requestId !== requestIdRef.current) return;
          store.setContent([], 0);
          return;
        }
        let filters: Record<string, unknown>;
        if (editorProfile.competencyScoped) {
          const lpFilters = buildLpLibraryFilters(
            activeAssessmentSlot, isPickingEvaluationCourse, selectedLevelSkills, skillCategory?.code, lpFrameworkId,
          );
          filters = { status: ['Live'], ...lpFilters };
        } else {
          filters = {
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
        }

        const currentOffset = reset ? 0 : store.offset;

        const { content, count } = await compositeSearch({
          filters,
          query,
          limit: query ? 50 : PAGE_SIZE,
          offset: currentOffset,
          channel: channel || undefined,
          sortBy: sortAZ ? { name: 'asc' } : { lastUpdatedOn: 'desc' },
          fields: buildSearchFields(editorProfile.competencyScoped, skillCategory?.code),
        });

        // A newer load() has since started — this response is stale, don't
        // let it clobber whatever the newer request already committed (or
        // will commit).
        if (requestId !== requestIdRef.current) return;

        if (reset) {
          store.setContent(content, count);
        } else {
          store.appendContent(content, count);
        }
      } catch (e) {
        if (requestId === requestIdRef.current) console.error('[useLibrary] load error:', e);
      } finally {
        if (requestId === requestIdRef.current) store.setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allowedCategories, channel, editorProfile, activeAssessmentSlot, isPickingEvaluationCourse, selectedLevelSkills, skillCategory, lpFrameworkId, emptyReason],
  );

  // Reset any in-progress search when the resolved framework (Curriculum)
  // changes — the previous query text doesn't apply to the new framework's
  // course set, and library.store's filteredContent would otherwise keep
  // filtering the freshly-fetched, framework-matching results by stale text.
  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    store.setSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lpFrameworkId]);

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
  // scoped to (assessment slot or Level Exam target armed, a Level's
  // selected skills, the root's Curriculum, or which node is selected —
  // moving from a skills-empty Level to the root/another node can change
  // emptyReason without changing selectedLevelSkills itself, e.g. both read
  // as []). Gated by competencyScoped so Collection's user-driven search/
  // filter/sort state (set via the search/setFilter/etc. callbacks below) is
  // never silently reset just because the author clicked a different tree
  // node.
  useEffect(() => {
    if (!editorProfile.competencyScoped) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorProfile.competencyScoped, activeAssessmentSlot, activeLevelExamTarget, selectedLevelSkills.join('|'), lpFrameworkId, selectedNodeId]);

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
