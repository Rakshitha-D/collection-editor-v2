import React, { useCallback, useMemo, useState } from 'react';
import { Search, Library, SlidersHorizontal, ArrowUpAZ, Clock, PanelRightClose, Info } from 'lucide-react';
import type { EditorMode } from '../../types/editor';
import type { IContent } from '../../types/content';
import { CT_FILTERS } from '../../types/content';
import { useLibrary } from '../../hooks/useLibrary';
import { useLibraryTargetLabel } from '../../hooks/useLibraryTargetLabel';
import { useLabels } from '../../hooks/useLabels';
import { useTreeStore } from '../../store/tree.store';
import { useEditorStore } from '../../store/editor.store';
import { useUiStore } from '../../store/ui.store';
import { getAssessmentCourseInfo, hasExplicitCurriculum, isAssessmentLevel, isAssessmentSlotFilled } from '../../utils/lpStructure';
import { LibraryCard } from './LibraryCard';
import { FilterChips } from './FilterChips';
import { LibraryFilterPanel } from './LibraryFilterPanel';
import type { LibraryFilters } from './LibraryFilterPanel';
import { LibraryPreviewPanel } from './LibraryPreviewPanel';
import toast from 'react-hot-toast';
import styles from './LibraryDock.module.scss';

interface LibraryDockProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  editorMode: EditorMode;
}

// Single permanently-active chip for the LP profile — 'all' so it renders
// filled by default without needing extra state.
const LP_COURSE_FILTER = [{ label: 'Courses', value: 'all' }] as const;

// Collect all resource identifiers from the tree (non-folder nodes)
function collectResourceIds(nodes: ReturnType<typeof useTreeStore.getState>['treeData']): Set<string> {
  const ids = new Set<string>();
  const queue = [...nodes];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (!node.isFolder) {
      ids.add(node.identifier);
    }
    if (node.children) queue.push(...node.children);
  }
  return ids;
}

export const LibraryDock: React.FC<LibraryDockProps> = ({ editorMode, collapsed = false, onToggleCollapse }) => {
  const lbl = useLabels();
  const {
    content,
    isLoading,
    totalCount,
    activeFilter,
    searchQuery,
    sortAZ,
    hasMore,
    search,
    setFilter,
    applyAdvancedFilters,
    toggleSort,
    loadMore,
    activeAssessmentSlot,
  } = useLibrary();

  const { addResource, selectedNodeId, treeData, treeCache } = useTreeStore();
  const setActiveAssessmentSlot = useUiStore(s => s.setActiveAssessmentSlot);
  const isLearningPath = useEditorStore(s => s.editorProfile.competencyScoped);
  const isEditable = editorMode === 'edit';

  // LP profile: the header shows where an "Add" click will land — "Open a
  // level to add" (root/nothing selected), "Add to {Level}" (a Level is
  // selected), or the slot-specific label while an assessment slot is armed.
  const libraryTargetLabel = useLibraryTargetLabel();

  // Panel state
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<LibraryFilters>({});
  const [previewContent, setPreviewContent] = useState<IContent | null>(null);
  const [checkingAssessmentCourseId, setCheckingAssessmentCourseId] = useState<string | null>(null);

  // Build a set of already-added resource identifiers for O(1) lookup
  const addedIds = useMemo(() => collectResourceIds(treeData), [treeData]);

  // Filling the Prior/Outcome Assessment slot: only a question-set-only
  // course qualifies, and there's no metadata marker for that — the check
  // requires reading the course's own hierarchy (Phase 1), done here on
  // selection rather than filtering search results.
  const handleFillAssessmentSlot = useCallback(
    async (item: IContent, slot: 'pre' | 'post') => {
      const rootId = treeData[0]?.id;
      if (!rootId || checkingAssessmentCourseId) return;
      // The slot stays armed while its detail page is open, so an add click
      // can arrive for an already-filled slot — say so up front instead of
      // running the question-set check and reporting the wrong problem.
      if (isAssessmentSlotFilled(treeData[0]?.children ?? [], slot)) {
        toast.error(slot === 'pre'
          ? lbl.learningPath.priorSlotFilledToast
          : lbl.learningPath.outcomeSlotFilledToast);
        return;
      }
      setCheckingAssessmentCourseId(item.identifier);
      try {
        const { qualifies, meta } = await getAssessmentCourseInfo(item.identifier);
        if (!qualifies) {
          toast.error(lbl.learningPath.notAssessmentCourseToast.replace('{name}', item.name));
          return;
        }
        // Merge the course's own full metadata (framework + its skill tags) —
        // the search item only carries the LP framework's skill field, which
        // is the wrong one when the course was tagged under another framework.
        const enriched = { ...item, ...meta } as unknown as IContent;
        const added = addResource(enriched, rootId, { isAssessmentCourse: true, slot });
        if (added === false) {
          toast.error(lbl.learningPath.bothSlotsFilledToast);
          return;
        }
        toast.success(lbl.libraryDock.itemAddedToast.replace('{name}', item.name));
        setActiveAssessmentSlot(null);
      } catch (e) {
        console.error('[LibraryDock] assessment-course check failed:', e);
        toast.error(lbl.learningPath.assessmentCheckFailedToast);
      } finally {
        setCheckingAssessmentCourseId(null);
      }
    },
    [treeData, addResource, setActiveAssessmentSlot, checkingAssessmentCourseId, lbl],
  );

  const handleAdd = useCallback(
    (item: IContent) => {
      // Every course carries a skill tag under its OWN framework — with no
      // Curriculum chosen yet, the path has nothing to check that tag
      // against, and the course would just get pruned the moment one is set.
      if (isLearningPath && !hasExplicitCurriculum(treeData[0], treeCache)) {
        toast.error(lbl.learningPath.selectCurriculumFirstToast);
        return;
      }
      if (activeAssessmentSlot) {
        handleFillAssessmentSlot(item, activeAssessmentSlot);
        return;
      }
      if (!selectedNodeId) {
        toast.error(isLearningPath
          ? lbl.learningPath.selectLevelFirstToast
          : lbl.libraryDock.selectUnitFirstToast);
        return;
      }
      const rootId = treeData[0]?.id;
      const selectedNode = useTreeStore.getState().getNodeById(selectedNodeId);
      // A filled pre/post slot is selected as its wrapper Level (arming only
      // happens while the slot is empty), so an add here must say "slot
      // already has a course" — not fall through to the duplicate message.
      if (isLearningPath) {
        const levelNode = selectedNode?.isFolder
          ? selectedNode
          : (selectedNode?.parent ? useTreeStore.getState().getNodeById(selectedNode.parent) : undefined);
        if (levelNode && isAssessmentLevel(levelNode)) {
          const preLevelId = treeData[0]?.children?.[0]?.id;
          toast.error(levelNode.id === preLevelId
            ? lbl.learningPath.priorSlotFilledToast
            : lbl.learningPath.outcomeSlotFilledToast);
          return;
        }
      }
      // Root and leaf targets both need a unit/Level picked first — a course
      // can never receive children (LP rule: no course under a course).
      if (selectedNodeId === rootId || !selectedNode?.isFolder) {
        toast(isLearningPath
          ? lbl.learningPath.selectLevelFromOutlineToast
          : lbl.libraryDock.selectUnitFromOutlineToast, {
          icon: <Info size={16} />,
          duration: 4000,
        });
        return;
      }
      const added = addResource(item, selectedNodeId);
      if (added === false) {
        toast.error((isLearningPath
          ? lbl.learningPath.itemAlreadyInPathToast
          : lbl.libraryDock.itemAlreadyAddedToast).replace('{name}', item.name));
        return;
      }
      toast.success(lbl.libraryDock.itemAddedToast.replace('{name}', item.name));
    },
    [activeAssessmentSlot, handleFillAssessmentSlot, selectedNodeId, addResource, treeData, treeCache, lbl, isLearningPath],
  );

  const handleApplyFilters = useCallback(
    (filters: LibraryFilters) => {
      setActiveFilters(filters);
      applyAdvancedFilters(filters);
    },
    [applyAdvancedFilters],
  );

  const handleCardPreview = useCallback((item: IContent) => {
    setPreviewContent(item);
  }, []);

  const handlePreviewAdd = useCallback(
    (item: IContent) => {
      handleAdd(item);
      setPreviewContent(null);
    },
    [handleAdd],
  );

  // Count active advanced filters for badge
  const activeFilterCount = useMemo(
    () =>
      Object.values(activeFilters).reduce(
        (sum, arr) => sum + (arr?.length ?? 0),
        0,
      ),
    [activeFilters],
  );

  return (
    <div className={styles.dock}>
      {/* Header — collapse control sits to the left of the Library icon */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={onToggleCollapse}
            aria-label={lbl.libraryDock.collapseLibraryPanelAriaLabel}
            title={lbl.libraryDock.collapseLibraryTitle}
          >
            <PanelRightClose size={15} />
          </button>
          <Library size={16} />
          <span className={styles.headerTitle}>{lbl.libraryDock.headerTitle}</span>
          {totalCount > 0 && (
            <span className={styles.count}>{totalCount}</span>
          )}
        </div>
        {libraryTargetLabel && (
          <span className={styles.libraryTargetLabel}>{libraryTargetLabel}</span>
        )}
      </div>

      {/* Search + Filter button row */}
      <div className={styles.searchRow}>
        <div className={styles.searchWrap}>
          <Search size={14} className={styles.searchIcon} />
          <input
            type="search"
            className={styles.searchInput}
            placeholder={lbl.libraryDock.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => search(e.target.value)}
            aria-label={lbl.libraryDock.searchAriaLabel}
          />
        </div>
        <button
          type="button"
          className={[styles.filterToggleBtn, sortAZ ? styles.filterToggleBtnActive : ''].join(' ')}
          onClick={toggleSort}
          aria-label={sortAZ ? lbl.libraryDock.sortAZAriaLabel : lbl.libraryDock.sortRecentAriaLabel}
          title={sortAZ ? lbl.libraryDock.sortAZTitle : lbl.libraryDock.sortRecentTitle}
        >
          {sortAZ ? <ArrowUpAZ size={15} /> : <Clock size={15} />}
        </button>
        <button
          type="button"
          className={[
            styles.filterToggleBtn,
            filterPanelOpen ? styles.filterToggleBtnActive : '',
          ].join(' ')}
          onClick={() => setFilterPanelOpen((v) => !v)}
          aria-label={lbl.libraryDock.toggleAdvancedFiltersAriaLabel}
          aria-pressed={filterPanelOpen}
          title={lbl.libraryDock.advancedFiltersTitle}
        >
          <SlidersHorizontal size={15} />
          {activeFilterCount > 0 && (
            <span className={styles.filterBadge}>{activeFilterCount}</span>
          )}
        </button>
      </div>

      {/* Content type filter chips — LP profile only ever searches Courses
          (see useLibrary's buildLpLibraryFilters), so show that as the sole,
          permanently-active chip instead of the generic category list. */}
      <div className={styles.filters}>
        <FilterChips
          filters={isLearningPath ? LP_COURSE_FILTER : CT_FILTERS}
          active={activeFilter}
          onChange={setFilter}
        />
      </div>

      {/* Main area: card list + optional side panels */}
      <div className={styles.mainArea}>
        {/* Card list */}
        <div className={styles.cardList} role="list" aria-label={lbl.libraryDock.libraryContentAriaLabel}>
          {isLoading && content.length === 0 ? (
            // Loading skeleton
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={styles.skeleton} aria-hidden="true">
                <div className={styles.skeletonIcon} />
                <div className={styles.skeletonText}>
                  <div className={styles.skeletonLine} />
                  <div className={styles.skeletonLineSm} />
                </div>
              </div>
            ))
          ) : content.length > 0 ? (
            <>
              {content.map((item) => (
                <LibraryCard
                  key={item.identifier}
                  item={item}
                  onAdd={handleAdd}
                  onPreview={handleCardPreview}
                  isDraggable={isEditable}
                  isAdded={addedIds.has(item.identifier)}
                />
              ))}

              {/* Load More */}
              {hasMore && (
                <button
                  type="button"
                  className={styles.loadMoreBtn}
                  onClick={loadMore}
                  disabled={isLoading}
                  aria-label={lbl.libraryDock.loadMoreAriaLabel}
                >
                  {isLoading ? lbl.libraryDock.loadingText : lbl.libraryDock.loadMoreText}
                </button>
              )}
            </>
          ) : (
            <div className={styles.emptyState}>
              <Search size={24} />
              <p>{lbl.libraryDock.noContentFound}</p>
              <span>{lbl.libraryDock.tryDifferentSearch}</span>
            </div>
          )}
        </div>

        {/* Advanced filter panel */}
        {filterPanelOpen && (
          <div className={styles.sidePanelOverlay}>
            <LibraryFilterPanel
              isOpen={filterPanelOpen}
              filters={activeFilters}
              onApply={handleApplyFilters}
              onClose={() => setFilterPanelOpen(false)}
            />
          </div>
        )}

        {/* Preview — opens directly as a centered modal (self-portaled) */}
        {previewContent && (
          <LibraryPreviewPanel
            content={previewContent}
            editorMode={editorMode}
            onAdd={handlePreviewAdd}
            onClose={() => setPreviewContent(null)}
          />
        )}
      </div>
    </div>
  );
};
