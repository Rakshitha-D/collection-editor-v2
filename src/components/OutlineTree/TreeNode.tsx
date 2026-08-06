import React, { useState, useCallback, useRef, useEffect } from 'react';
import { type NodeRendererProps } from 'react-arborist';
import {
  ChevronRight,
  ChevronDown,
  GripVertical,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  FolderPlus,
  Book,
  Folder,
  Milestone,
  Video,
  FileText,
  Layers,
  Package,
  Music,
  HelpCircle,
  BookOpen,
  File,
} from 'lucide-react';
import type { INode, EditorMode } from '../../types/editor';
import { getCtStyle } from '../../hooks/useContentType';
import { isAssessmentLevel } from '../../utils/lpStructure';
import { useIsDraftStatus } from '../../hooks/useContentStatus';
import { useLabels } from '../../hooks/useLabels';
import { useEditorStore } from '../../store/editor.store';
import { LearningPathIcon } from '../shared/LearningPathIcon';
import styles from './TreeNode.module.scss';

const CT_ICON_COMPONENTS: Record<string, React.ElementType> = {
  video: Video,
  pdf: FileText,
  h5p: Layers,
  scorm: Package,
  audio: Music,
  quiz: HelpCircle,
  course: BookOpen,
  default: File,
};

interface TreeNodeProps extends NodeRendererProps<INode> {
  editorMode: EditorMode;
}

export const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  style,
  dragHandle,
  editorMode,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(node.data.name);
  const menuRef = useRef<HTMLDivElement>(null);
  const lbl = useLabels();
  const editorProfile = useEditorStore(s => s.editorProfile);
  const isEditable = editorMode === 'edit';
  const isDraft = useIsDraftStatus();
  const ctStyle = getCtStyle(node.data);
  const CtIcon = CT_ICON_COMPONENTS[ctStyle.key] ?? File;
  const isSelected = node.isSelected;
  const isRoot = node.level === 0;
  const isFolder =
    node.data.isFolder ?? (node.children && node.children.length > 0);
  const isLearningPath = editorProfile.key === 'learningPath';
  // Root → Book (Collection) / LearningPathIcon (Learning Path), Level
  // folders → Milestone, Unit/Sub-Unit (folders) → Folder, leaf → content-type icon.
  const NodeIcon = isRoot ? (isLearningPath ? LearningPathIcon : Book) : isFolder ? (isLearningPath ? Milestone : Folder) : CtIcon;
  // Regular (non pre/post-assessment) Levels get a numbered badge + "Level N
  // • {name}" label instead of the generic icon+name row (design). The
  // number is this Level's 1-based position among sibling non-assessment
  // Levels — Prior/Outcome Assessment slots aren't numbered.
  const isRegularLpLevel = isLearningPath && isFolder && !isRoot && !isAssessmentLevel(node.data);
  const levelNumber = isRegularLpLevel
    ? (node.parent?.children ?? []).filter(c => !isAssessmentLevel(c.data)).findIndex(c => c.id === node.id) + 1
    : null;
  // Adding a folder inside the current node would exceed the profile's maxDepth
  // (e.g. LP Levels can't contain sub-levels) — hide rather than error on click.
  const canAddChildFolder = node.level + 1 <= editorProfile.maxDepth;
  const addUnitLabel = isLearningPath ? lbl.learningPath.addLevelButton : lbl.treeNode.addSubunitMenuItem;
  const addSiblingLabel = isLearningPath ? lbl.learningPath.addLevelButton : lbl.treeNode.addSiblingMenuItem;

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleRenameSubmit = useCallback(() => {
    if (renameVal.trim()) node.submit(renameVal.trim());
    setIsRenaming(false);
  }, [renameVal, node]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleRenameSubmit();
      if (e.key === 'Escape') {
        setRenameVal(node.data.name);
        setIsRenaming(false);
      }
    },
    [handleRenameSubmit, node.data.name],
  );

  return (
    <div
      className={[
        styles.row,
        isLearningPath ? styles.rowLp : '',
        isSelected ? styles.selected : '',
        (node.state as unknown as Record<string, boolean>).isOver && isFolder ? styles.dropTarget : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      onClick={() => node.select()}
      data-node-id={node.data.id}
      data-droppable={isFolder ? 'true' : undefined}
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={isFolder ? !node.isClosed : undefined}
    >
      {/* Drag handle */}
      {isEditable && (
        <span ref={dragHandle} className={styles.grip} aria-hidden="true">
          <GripVertical size={14} />
        </span>
      )}

      {/* Expand toggle */}
      <button
        className={styles.toggle}
        onClick={(e) => {
          e.stopPropagation();
          node.toggle();
        }}
        aria-label={node.isClosed ? lbl.treeNode.expandAriaLabel : lbl.treeNode.collapseAriaLabel}
        style={{ visibility: isFolder ? 'visible' : 'hidden' }}
      >
        {node.isClosed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Node icon: Book (root) / Folder (unit) / content-type (leaf) —
          regular Levels get a numbered badge instead (design). */}
      {isRegularLpLevel ? (
        <span className={styles.levelBadge} aria-hidden="true">{levelNumber}</span>
      ) : (
        <span
          className={[
            styles.ctIcon,
            isRoot || isFolder ? styles.folderIcon : ctStyle.bgClass,
            isLearningPath ? styles.ctIconLp : '',
            isRoot && isLearningPath ? styles.rootIcon : '',
          ].filter(Boolean).join(' ')}
          aria-hidden="true"
        >
          <NodeIcon size={isRoot && isLearningPath ? 15 : 12} />
        </span>
      )}

      {/* Title or rename input */}
      {isRenaming ? (
        <input
          className={styles.renameInput}
          value={renameVal}
          autoFocus
          onChange={(e) => setRenameVal(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className={[
            styles.title,
            isLearningPath ? styles.titleLp : '',
            isRegularLpLevel ? styles.levelTitle : '',
          ].filter(Boolean).join(' ')}
          title={node.data.name}
          onDoubleClick={() => isEditable && setIsRenaming(true)}
        >
          {isRegularLpLevel
            ? `${lbl.learningPath.levelNumberPrefix.replace('{n}', String(levelNumber))} • ${node.data.name}`
            : (node.data.name.length > 25 ? `${node.data.name.slice(0, 25)}...` : node.data.name)}
        </span>
      )}

      {/* "Drop here" marker (visible when drag is over this folder) */}
      {(node.state as unknown as Record<string, boolean>).isOver && isFolder && (
        <span className={styles.dropHere} aria-hidden="true">
          {lbl.treeNode.dropHereLabel}
        </span>
      )}

      {/* Context menu button */}
      {isEditable && (
        <div className={styles.menuWrap} ref={menuRef}>
          <button
            className={styles.menuBtn}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-label={lbl.treeNode.nodeOptionsAriaLabel}
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <div className={styles.menu} role="menu">
              <button
                role="menuitem"
                onClick={() => {
                  setIsRenaming(true);
                  setMenuOpen(false);
                }}
              >
                <Pencil size={13} /> {lbl.treeNode.renameMenuItem}
              </button>
              {isFolder && isDraft && canAddChildFolder && (
                <button
                  role="menuitem"
                  onClick={() => {
                    node.tree.create({ parentId: node.id });
                    setMenuOpen(false);
                  }}
                >
                  <FolderPlus size={13} /> {addUnitLabel}
                </button>
              )}
              {/* Learning Path: a Level's own menu doesn't offer "Add Level" —
                  Levels are added via the dedicated button below the tree,
                  not positioned relative to an existing one. */}
              {node.data.parent && isDraft && !(isLearningPath && isFolder && !isRoot) && (
                <button
                  role="menuitem"
                  onClick={() => {
                    node.tree.create({ parentId: node.data.parent as string });
                    setMenuOpen(false);
                  }}
                >
                  <Plus size={13} /> {addSiblingLabel}
                </button>
              )}
              {!isRoot && (
                <button
                  role="menuitem"
                  className={styles.dangerItem}
                  onClick={() => {
                    node.tree.delete(node.id);
                    setMenuOpen(false);
                  }}
                >
                  <Trash2 size={13} /> {lbl.treeNode.deleteMenuItem}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
