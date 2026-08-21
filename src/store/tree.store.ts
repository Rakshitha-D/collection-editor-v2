import { create } from 'zustand';
import type { INode } from '../types/editor';
import type { IContent } from '../types/content';
import { useEditorStore } from './editor.store';
import { useUiStore } from './ui.store';
import { useI18nStore } from './i18n.store';
import { canAddCourseToLevel, canReorderLevel, isAssessmentLevel, isAssessmentSlotFilled, isPrePostSlot, resolveOpenAssessmentSlot } from '../utils/lpStructure';

interface TreeState {
  treeData: INode[];
  selectedNodeId: string | null;
  treeCache: Record<string, Record<string, unknown>>;
  breadcrumb: Array<{ id: string; name: string }>;
  activeNodeMeta: Record<string, unknown>;
  // actions
  setTreeData: (nodes: INode[]) => void;
  selectNode: (id: string) => void;
  updateNode: (id: string, patch: Record<string, unknown>, extraMirrorKeys?: string[]) => void;
  addNode: (parentId: string, type: 'unit' | 'subunit') => string;
  deleteNode: (id: string) => boolean;
  reorderChildren: (parentId: string, fromIndex: number, toIndex: number) => void;
  addResource: (content: IContent, nodeId: string, opts?: { isAssessmentCourse?: boolean; slot?: 'pre' | 'post' }) => boolean;
  markDirty: () => void;
  getNodeById: (id: string) => INode | undefined;
  getChildrenOf: (id: string) => INode[];
  getBreadcrumb: (id: string) => Array<{ id: string; name: string }>;
  moveNode: (nodeId: string, fromParentId: string, toParentId: string) => void;
  replaceNodeIds: (identifiers: Record<string, string>) => void;
  /** LP: drop linked courses tagged under a different framework than the
   *  root's newly-selected curriculum. Returns how many were removed. */
  pruneCoursesByFramework: (frameworkId: string) => number;
  /** LP: clear every Level's selected-skills field under the OLD resolved
   *  skill-category code when the Curriculum changes. Returns how many
   *  Levels had a selection cleared. */
  clearLevelSkills: (skillCategoryCode: string | undefined) => number;
}

// BFS through treeData to find a node by id
function bfsFind(nodes: INode[], id: string): INode | undefined {
  const queue: INode[] = [...nodes];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.id === id) return node;
    if (node.children) queue.push(...node.children);
  }
  return undefined;
}

// Compute the depth of a target node (root nodes are depth 0)
function getNodeDepth(nodes: INode[], targetId: string, depth = 0): number {
  for (const n of nodes) {
    if (n.id === targetId) return depth;
    if (n.children?.length) {
      const found = getNodeDepth(n.children, targetId, depth + 1);
      if (found >= 0) return found;
    }
  }
  return -1;
}

// Deep merge a patch into a node's properties within a tree
// Fields that live both on INode top-level AND inside node.metadata
const METADATA_MIRROR_FIELDS = new Set([
  'name', 'appIcon', 'description', 'keywords', 'trackable',
  'qrCodeProcessId', 'reservedDialcodes',
]);

// extraMirrorKeys: for patch keys whose NAME is only known at call time (e.g.
// a Level's skill selection, stored under the resolved skill-category code —
// 'skill' for USF, a different code for another framework — never the
// reserved Sunbird `competencies` field, whose platform schema expects
// competency-ontology objects, not plain framework-term strings). Callers
// pass the dynamic key(s) explicitly rather than growing the static set above.
function deepMergeNode(
  nodes: INode[], id: string, patch: Record<string, unknown>, extraMirrorKeys?: string[],
): INode[] {
  return nodes.map((node) => {
    if (node.id === id) {
      const explicitMetaPatch = (patch['metadata'] as Record<string, unknown>) ?? {};
      // Mirror top-level patch fields into metadata so cleanMetadata sees the latest values
      const mirrorFields = extraMirrorKeys?.length
        ? new Set([...METADATA_MIRROR_FIELDS, ...extraMirrorKeys])
        : METADATA_MIRROR_FIELDS;
      const mirroredFields: Record<string, unknown> = {};
      for (const key of mirrorFields) {
        if (key in patch) mirroredFields[key] = patch[key];
      }
      return {
        ...node,
        ...patch,
        metadata: { ...(node.metadata ?? {}), ...mirroredFields, ...explicitMetaPatch },
      };
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: deepMergeNode(node.children, id, patch, extraMirrorKeys) };
    }
    return node;
  });
}

// Insert a new node into parent's children
function insertIntoParent(nodes: INode[], parentId: string, newNode: INode): INode[] {
  return nodes.map((node) => {
    if (node.id === parentId) {
      return { ...node, children: [...(node.children ?? []), newNode] };
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: insertIntoParent(node.children, parentId, newNode) };
    }
    return node;
  });
}

// Insert a new node into parent's children at a specific index
function insertIntoParentAt(nodes: INode[], parentId: string, newNode: INode, index: number): INode[] {
  return nodes.map((node) => {
    if (node.id === parentId) {
      const children = [...(node.children ?? [])];
      children.splice(index, 0, newNode);
      return { ...node, children };
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: insertIntoParentAt(node.children, parentId, newNode, index) };
    }
    return node;
  });
}

// Recursively filter out a node
function removeNode(nodes: INode[], id: string): INode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({
      ...node,
      children: node.children ? removeNode(node.children, id) : [],
    }));
}

// Reorder children of a parent node
function reorderInParent(nodes: INode[], parentId: string, from: number, to: number): INode[] {
  return nodes.map((node) => {
    if (node.id === parentId) {
      const children = [...(node.children ?? [])];
      const [moved] = children.splice(from, 1);
      children.splice(to, 0, moved);
      return { ...node, children };
    }
    if (node.children && node.children.length > 0) {
      return { ...node, children: reorderInParent(node.children, parentId, from, to) };
    }
    return node;
  });
}

// Recursively rename node ids (temp-xxx → do_xxx) after a save that returns identifiers
function renameNodeIds(nodes: INode[], idMap: Record<string, string>): INode[] {
  return nodes.map((node) => {
    const newId = idMap[node.id] ?? node.id;
    const newParent = node.parent ? (idMap[node.parent] ?? node.parent) : node.parent;
    return {
      ...node,
      id: newId,
      identifier: newId,
      parent: newParent,
      children: node.children ? renameNodeIds(node.children, idMap) : [],
    };
  });
}

// Count all non-folder (leaf content) nodes in the tree via BFS
function countLeafNodes(nodes: INode[]): number {
  let count = 0;
  const queue: INode[] = [...nodes];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (!node.isFolder) count++;
    if (node.children) queue.push(...node.children);
  }
  return count;
}

// Build breadcrumb by walking parent references via BFS lookup
function buildBreadcrumb(
  nodes: INode[],
  id: string,
): Array<{ id: string; name: string }> {
  const node = bfsFind(nodes, id);
  if (!node) return [];
  const crumbs: Array<{ id: string; name: string }> = [];
  let current: INode | undefined = node;
  while (current) {
    crumbs.unshift({ id: current.id, name: current.name });
    current = current.parent ? bfsFind(nodes, current.parent) : undefined;
  }
  return crumbs;
}

export const useTreeStore = create<TreeState>((set, get) => ({
  treeData: [],
  selectedNodeId: null,
  treeCache: {},
  breadcrumb: [],
  activeNodeMeta: {},

  setTreeData: (nodes) => {
    const firstId = nodes[0]?.id ?? null;
    set({ treeData: nodes, selectedNodeId: firstId });
    // Activate the first node so activeNodeMeta and isCurrentNodeRoot are populated
    if (firstId) {
      // Use setTimeout to let the treeData state settle before selectNode reads it
      setTimeout(() => get().selectNode(firstId), 0);
    }
  },

  selectNode: (id) => {
    const { treeData, treeCache, getBreadcrumb } = get();
    const node = bfsFind(treeData, id);
    const breadcrumb = getBreadcrumb(id);
    // Merge treeCache so non-mirror fields (audience, board, targetBoardIds, etc.)
    // are included in activeNodeMeta and available to SparkMetaForm on remount.
    const activeNodeMeta = { ...(node?.metadata ?? {}), ...(treeCache[id] ?? {}) };

    // Update editor store node flags synchronously so consumers don't read a
    // stale isRoot/isFolder for a render after the node changes.
    useEditorStore.getState().setNodeFlags({
      isFolder: node?.isFolder ?? false,
      isRoot: !node?.parent,
      isQuml: false,
    });

    // Any explicit navigation cancels a pending "filling the Prior/Outcome
    // Assessment slot" virtual view (LP profile) — otherwise there'd be no
    // way to back out of it short of actually adding a course.
    useUiStore.getState().setActiveAssessmentSlot(null);

    set({ selectedNodeId: id, breadcrumb, activeNodeMeta });
  },

  updateNode: (id, patch, extraMirrorKeys) => {
    set((state) => ({
      treeData: deepMergeNode(state.treeData, id, patch, extraMirrorKeys),
      treeCache: {
        ...state.treeCache,
        [id]: { ...(state.treeCache[id] ?? {}), ...patch },
      },
    }));
    // Keep activeNodeMeta live for the edited node — controlled inputs (e.g.
    // the LP SkillPicker) read their value from it, so a stale snapshot would
    // swallow every edit after the first until the node is re-selected.
    if (get().selectedNodeId === id) {
      const node = bfsFind(get().treeData, id);
      set((state) => ({
        activeNodeMeta: { ...(node?.metadata ?? {}), ...(state.treeCache[id] ?? {}) },
      }));
    }
    // Any node edit (root/unit/leaf form, inline title) must mark the tree
    // dirty so the debounced autosave in useSaveHierarchy actually runs.
    get().markDirty();
  },

  addNode: (parentId, _type) => {
    const state = get();
    const profile = useEditorStore.getState().editorProfile;
    const maxDepth = useEditorStore.getState().editorConfig?.config?.maxDepth ?? profile.maxDepth;
    const parentDepth = getNodeDepth(state.treeData, parentId);

    // parentDepth is the depth of the parent; child would be at parentDepth + 1.
    // Allow children at depths 1..maxDepth (root is depth 0), matching Angular behaviour.
    if (parentDepth >= maxDepth) {
      console.warn(`[tree.store] addNode: depth would exceed maxDepth (${maxDepth}). parentDepth=${parentDepth}`);
      return '';
    }

    // The 'temp-' prefix is load-bearing (isNew detection throughout
    // useSaveHierarchy/useSaveQuestion/etc. checks identifier.startsWith
    // ('temp-')) — it must stay on the tree's own local id. metadata.code is
    // a different concern: it's the value that actually reaches the backend
    // and gets persisted, so it should look like any other content's code
    // (a plain UUID), not carry the local-only 'temp-' placeholder along
    // with it.
    const newId = 'temp-' + Math.random().toString(36).slice(2);
    const newNode: INode = {
      id: newId,
      identifier: newId,
      name: profile.defaultUnitName,
      isFolder: true,
      children: [],
      parent: parentId,
      metadata: {
        mimeType: 'application/vnd.ekstep.content-collection',
        code: crypto.randomUUID(),
        name: profile.defaultUnitName,
        contentType: profile.unitContentType,
        primaryCategory: profile.unitPrimaryCategory,
        visibility: 'Parent',
      },
    };

    // LP: the Outcome Assessment Level must stay pinned at the last index
    // (canReorderLevel/isAssessmentSlotFilled rely on it) — a plain append
    // would otherwise land a new content Level after it.
    const siblings = bfsFind(state.treeData, parentId)?.children ?? [];
    const insertBeforePost = profile.derivedRoles && isAssessmentSlotFilled(siblings, 'post');

    set((state) => ({
      treeData: insertBeforePost
        ? insertIntoParentAt(state.treeData, parentId, newNode, siblings.length - 1)
        : insertIntoParent(state.treeData, parentId, newNode),
      treeCache: {
        ...state.treeCache,
        [newId]: { ...newNode.metadata, isNew: true },
      },
    }));

    // Defer selectNode so treeData settles before bfsFind runs — same pattern as setTreeData.
    setTimeout(() => get().selectNode(newId), 0);
    return newId;
  },

  deleteNode: (id) => {
    // Never allow the root/collection node to be removed — it would leave the
    // tree empty with no way to add units back or recover in the UI.
    const rootId = get().treeData[0]?.id;
    if (id === rootId) return false;

    // LP profile: removing a content Level's course must not leave that
    // Level — if it sits at index 0/last — looking like a genuine pre/post
    // Assessment slot (isAssessmentLevel: exactly one course, flagged).
    // Same ambiguity wouldBecomeAmbiguousSlot guards against on add (a
    // content Level with a Level Exam course, first/last, reduced to just
    // that one course by deleting its other content).
    const profile = useEditorStore.getState().editorProfile;
    if (profile.derivedRoles) {
      const node = bfsFind(get().treeData, id);
      const parent = node?.parent ? bfsFind(get().treeData, node.parent) : undefined;
      const levels = get().treeData[0]?.children ?? [];
      const levelIndex = parent ? levels.findIndex((l) => l.id === parent.id) : -1;
      if (levelIndex === 0 || levelIndex === levels.length - 1) {
        const remaining = (parent!.children ?? []).filter((c) => c.id !== id);
        if (remaining.length === 1 && !!remaining[0].metadata?.['isAssessmentCourse']) return false;
      }
    }

    set((state) => ({
      treeData: removeNode(state.treeData, id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    }));
    return true;
  },

  reorderChildren: (parentId, fromIndex, toIndex) => {
    const profile = useEditorStore.getState().editorProfile;
    const rootId = get().treeData[0]?.id;
    // LP profile: the pre/post assessment Levels are pinned at index 0 / last
    // (doc model) — reordering is only free for the content Levels between them.
    if (profile.derivedRoles && parentId === rootId) {
      const parent = bfsFind(get().treeData, parentId);
      if (parent?.children && !canReorderLevel(parent.children, fromIndex, toIndex)) return;
    }
    set((state) => ({
      treeData: reorderInParent(state.treeData, parentId, fromIndex, toIndex),
    }));
  },

  moveNode: (nodeId, _fromParentId, toParentId) => {
    const profile = useEditorStore.getState().editorProfile;
    const movedNode = bfsFind(get().treeData, nodeId);
    const targetNode = bfsFind(get().treeData, toParentId);
    // The move target is always a parent — a leaf (e.g. a linked course) can
    // never receive children, in any profile.
    if (!targetNode?.isFolder) return;
    // LP: Levels are root's only direct children (flat root -> Level ->
    // course model) — dragging a whole Level into another Level would nest
    // folders and break every position-aware rule (canAddCourseToLevel,
    // isAssessmentLevel) that assumes that flatness.
    const rootId = get().treeData[0]?.id;
    if (profile.derivedRoles && movedNode?.isFolder && toParentId !== rootId) return;
    if (profile.derivedRoles && movedNode && !movedNode.isFolder) {
      // Dragging a course across Levels must still respect the one-course-per-
      // assessment-Level / one-Level-assessment-per-content-Level caps (item 4)
      // that addResource enforces for library-driven adds.
      const incomingIsAssessmentCourse = !!movedNode.metadata?.['isAssessmentCourse'];
      const rootLevels = get().treeData[0]?.children ?? [];
      if (!canAddCourseToLevel(targetNode, incomingIsAssessmentCourse, isPrePostSlot(rootLevels, targetNode))) return;
    }
    set((state) => {
      const node = bfsFind(state.treeData, nodeId);
      if (!node) return state;
      let newTree = removeNode(state.treeData, nodeId);
      newTree = insertIntoParent(newTree, toParentId, { ...node, parent: toParentId });
      return { treeData: newTree };
    });
    get().markDirty();
  },

  addResource: (content, nodeId, opts) => {
    const config = useEditorStore.getState().editorConfig;
    const profile = useEditorStore.getState().editorProfile;
    const rootId = get().treeData[0]?.id;
    const incomingIsAssessmentCourse = !!opts?.isAssessmentCourse;

    // LP profile: linking an assessment course targeted at root fills the
    // open pre/post slot by auto-wrapping it in its own dedicated Level
    // (doc: "assessment Levels contain exactly the one assessment course") —
    // this is how the Prior/Outcome Assessment pickers add a course, instead
    // of requiring the author to create the Level by hand first.
    if (profile.derivedRoles && nodeId === rootId) {
      if (!incomingIsAssessmentCourse) return false; // only assessment courses may target root directly
      if (bfsFind(get().treeData, content.identifier)) return false; // duplicate guard

      const rootNode = get().treeData[0];
      const levels = rootNode?.children ?? [];
      // Honor the caller's armed slot when given: filling "post" must never
      // land in an open pre slot, and a filled requested slot is a rejection,
      // not a fallback to the other slot.
      const slot = opts?.slot ?? resolveOpenAssessmentSlot(levels);
      if (!slot || isAssessmentSlotFilled(levels, slot)) return false;

      const newLevelId = get().addNode(rootId, 'unit');
      if (!newLevelId) return false;
      // Name the wrapper Level after its slot — addNode's "Untitled Level"
      // default would otherwise surface everywhere the node name renders
      // (tree rows, breadcrumb, the saved hierarchy).
      const { learningPath: lpLabels } = useI18nStore.getState().labelConfig;
      get().updateNode(newLevelId, {
        name: slot === 'pre' ? lpLabels.priorAssessmentLabel : lpLabels.outcomeAssessmentLabel,
      });
      if (slot === 'pre') {
        // addNode always appends; pull the fresh Level back to index 0 for the pre slot.
        const lastIndex = (get().treeData[0]?.children?.length ?? 1) - 1;
        set((state) => ({
          treeData: reorderInParent(state.treeData, rootId, lastIndex, 0),
        }));
      }
      return get().addResource(content, newLevelId, opts);
    }

    // Prevent adding content directly under the root node unless explicitly allowed by config
    const allowContentUnderRoot = config?.config?.allowContentUnderRoot ?? false;
    if (!allowContentUnderRoot && nodeId === rootId) {
      return false;
    }

    // Prevent duplicate content anywhere in the collection (cross-unit)
    if (bfsFind(get().treeData, content.identifier)) {
      return false;
    }

    // Leaf content is terminal in every profile — in an LP specifically, a
    // course can never nest under a course. Callers may pass a leaf id (e.g.
    // a selected course), so reject here rather than silently inserting under it.
    const targetNode = bfsFind(get().treeData, nodeId);
    if (!targetNode?.isFolder) {
      return false;
    }
    if (profile.derivedRoles) {
      const rootLevels = get().treeData[0]?.children ?? [];
      if (!canAddCourseToLevel(targetNode, incomingIsAssessmentCourse, isPrePostSlot(rootLevels, targetNode))) {
        return false;
      }
    }

    // Enforce maxContentsLimit (default 1200) and maxQuestionsLimit (default 500)
    const maxContents = (config?.config as unknown as Record<string, unknown>)?.['maxContentsLimit'] as number | undefined ?? 1200;
    const currentLeafCount = countLeafNodes(get().treeData);
    if (currentLeafCount >= maxContents) {
      return false;
    }

    const leafNode: INode = {
      id: content.identifier,
      identifier: content.identifier,
      name: content.name,
      isFolder: false,
      children: [],
      parent: nodeId,
      mimeType: content.mimeType,
      primaryCategory: content.primaryCategory,
      contentType: content.contentType,
      appIcon: content.appIcon,
      status: content.status,
      metadata: {
        ...(content as unknown as Record<string, unknown>),
        ...(incomingIsAssessmentCourse ? { isAssessmentCourse: true } : {}),
      },
    };

    set((state) => ({
      treeData: insertIntoParent(state.treeData, nodeId, leafNode),
    }));

    get().markDirty();
    return true;
  },

  markDirty: () => {
    // View modes (review/read/sourcingreview) never dirty the tree — form
    // mount-time normalization fires updateNode even when just viewing, which
    // would otherwise show "Unsaved" and trigger the back-guard.
    const { editorMode, setIsDirty } = useEditorStore.getState();
    if (editorMode === 'edit') setIsDirty(true);
  },

  pruneCoursesByFramework: (frameworkId) => {
    let removed = 0;
    set((state) => {
      const root = state.treeData[0];
      if (!root) return state;
      const newLevels: INode[] = [];
      for (const lvl of root.children ?? []) {
        const wasAssessmentLevel = isAssessmentLevel(lvl);
        const keptChildren = (lvl.children ?? []).filter((child) => {
          if (child.isFolder) return true;
          const fw = child.metadata?.['framework'];
          // Courses with no framework metadata are kept — only a KNOWN
          // mismatch is unrelated to the new curriculum. A multi-value
          // framework array must be checked by membership, not just its
          // first element, or a course tagged under several frameworks
          // (one of which matches) gets wrongly dropped.
          const matches = !fw || (Array.isArray(fw) ? fw.includes(frameworkId) : fw === frameworkId);
          if (!matches) removed++;
          return matches;
        });
        // An emptied assessment slot loses its wrapper Level too, so the
        // pre/post slot reverts to its dashed "Add …" placeholder instead of
        // lingering as an empty content Level.
        if (wasAssessmentLevel && keptChildren.length === 0) continue;
        newLevels.push(keptChildren.length === (lvl.children ?? []).length ? lvl : { ...lvl, children: keptChildren });
      }
      if (removed === 0) return state;
      return { treeData: [{ ...root, children: newLevels }] };
    });
    if (removed > 0) get().markDirty();
    return removed;
  },

  clearLevelSkills: (skillCategoryCode) => {
    if (!skillCategoryCode) return 0;
    let cleared = 0;
    set((state) => {
      const root = state.treeData[0];
      if (!root) return state;
      const newTreeCache = { ...state.treeCache };
      const newLevels = (root.children ?? []).map((lvl) => {
        const hadSelection = lvl.metadata?.[skillCategoryCode] !== undefined
          || newTreeCache[lvl.id]?.[skillCategoryCode] !== undefined;
        if (!hadSelection) return lvl;
        cleared++;
        const { [skillCategoryCode]: _metaRemoved, ...restMeta } = lvl.metadata ?? {};
        if (newTreeCache[lvl.id]) {
          const { [skillCategoryCode]: _cacheRemoved, ...restCache } = newTreeCache[lvl.id];
          newTreeCache[lvl.id] = restCache;
        }
        return { ...lvl, metadata: restMeta };
      });
      if (cleared === 0) return state;
      return { treeData: [{ ...root, children: newLevels }], treeCache: newTreeCache };
    });
    if (cleared > 0) get().markDirty();
    return cleared;
  },

  replaceNodeIds: (identifiers) => {
    if (!identifiers || Object.keys(identifiers).length === 0) return;
    set((state) => {
      const newTreeData = renameNodeIds(state.treeData, identifiers);
      // Rebuild treeCache with renamed keys and clear isNew flags for persisted nodes
      const newCache: Record<string, Record<string, unknown>> = {};
      for (const [oldId, cached] of Object.entries(state.treeCache)) {
        const newId = identifiers[oldId] ?? oldId;
        const { isNew: _, ...rest } = cached;
        newCache[newId] = rest;
      }
      const newSelectedId = state.selectedNodeId
        ? (identifiers[state.selectedNodeId] ?? state.selectedNodeId)
        : null;
      return { treeData: newTreeData, treeCache: newCache, selectedNodeId: newSelectedId };
    });
  },

  getNodeById: (id) => {
    return bfsFind(get().treeData, id);
  },

  getChildrenOf: (id) => {
    const node = bfsFind(get().treeData, id);
    return node?.children ?? [];
  },

  getBreadcrumb: (id) => {
    return buildBreadcrumb(get().treeData, id);
  },
}));

export const getTreeStore = () => useTreeStore.getState;
