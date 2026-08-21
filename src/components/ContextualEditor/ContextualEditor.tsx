import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { EditorMode, ToolbarAction, INode } from '../../types/editor';
import { useTreeStore } from '../../store/tree.store';
import { useEditorStore } from '../../store/editor.store';
import { useUiStore } from '../../store/ui.store';
import { Breadcrumb } from './Breadcrumb';
import { TabBar } from './TabBar';
import { SparkMetaForm } from '../SparkMetaForm';
import { UnitContentList } from '../UnitContentList';
import { DropZone } from '../shared/DropZone';
import { ContentPlayer } from '../ContentPlayer';
import { ResourceReorderDialog } from '../ResourceReorder/ResourceReorderDialog';
import { AssignPageNumber } from '../AssignPageNumber/AssignPageNumber';
import { ContentEditForm } from './ContentEditForm';
import { TitleAppIcon } from './TitleAppIcon';
import { CourseDetailsPanel } from '../shared/CourseDetailsPanel';
import { AssessmentDetailPanel } from './AssessmentDetailPanel';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { useLabels } from '../../hooks/useLabels';
import { isAssessmentLevel, getLevelDisplayInfo, isEvaluationCourse } from '../../utils/lpStructure';
import styles from './ContextualEditor.module.scss';

const QUESTIONSET_MIME = 'application/vnd.sunbird.questionset';
const QUESTION_MIME = 'application/vnd.sunbird.question';
const QUML_TYPES = [QUESTIONSET_MIME, QUESTION_MIME];

interface ContextualEditorProps {
  editorMode: EditorMode;
  onToolbarEvent: (event: { action: ToolbarAction; data?: unknown }) => void;
}

type TabId = 'details' | 'audience' | 'licensing';

// A reviewer's rejectComment should only surface while the node is still in
// the Draft-after-reject state — hidden once resubmitted for review (status
// moves to 'Review') or published (status moves to 'Live'), even though the
// comment persists on the content's metadata.
function getDraftRejectComment(node: INode | null | undefined): string | undefined {
  if (!node || node.status !== 'Draft' || node.metadata?.prevStatus !== 'Review') {
    return undefined;
  }
  return node.metadata?.rejectComment as string | undefined;
}

export const ContextualEditor: React.FC<ContextualEditorProps> = ({ editorMode, onToolbarEvent }) => {
  const lbl = useLabels();
  const [activeTab, setActiveTab] = useState<TabId>('details');
  const [errorTabs, setErrorTabs] = useState<TabId[]>([]);
  const [reorderResourceId, setReorderResourceId] = useState<string | null>(null);
  const [showAssignPage, setShowAssignPage] = useState(false);
  const [courseContentCount, setCourseContentCount] = useState<number | null>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const { selectedNodeId, breadcrumb, activeNodeMeta, updateNode, treeData, selectNode } = useTreeStore();
  const activeAssessmentSlot = useUiStore(s => s.activeAssessmentSlot);
  const contentId = useEditorStore(
    s => s.editorConfig?.context?.contentId ?? s.editorConfig?.context?.identifier ?? '',
  );
  const isLearningPath = useEditorStore(s => s.editorProfile.competencyScoped);

  const selectedNode = selectedNodeId ? findNodeById(treeData, selectedNodeId) : null;

  // Reset the course-detail "Course · N contents" count on selection change
  // so it doesn't briefly show the previous course's count while the new
  // one's hierarchy read is still in flight.
  useEffect(() => {
    setCourseContentCount(null);
  }, [selectedNode?.identifier]);

  // Derive node flags synchronously from the resolved node. The editor-store
  // flags (isCurrentNodeRoot/isCurrentNodeFolder) are set asynchronously in
  // selectNode and lag a render behind, which made the form mount with the
  // wrong field set on root→unit→root and lose its pre-selected dropdowns.
  const isCurrentNodeRoot = !!selectedNode && !selectedNode.parent;
  const isCurrentNodeFolder = !!selectedNode?.isFolder;

  const isQuml = selectedNode && QUML_TYPES.includes(selectedNode.mimeType ?? '');
  const isSingleQuestion = selectedNode?.mimeType === QUESTION_MIME;
  const isLeafContent = selectedNode && !selectedNode.isFolder && !isQuml && !isCurrentNodeRoot;

  // LP profile: the pre/post assessment Level gets a dedicated view instead
  // of the generic Level panel — see AssessmentDetailPanel. An unfilled slot
  // has no Level to select yet (derived, not stored), so "Add Prior/Outcome
  // Assessment" navigates here virtually via activeAssessmentSlot instead;
  // any other explicit navigation clears it (see tree.store's selectNode).
  const isAssessmentSlot = isLearningPath && isCurrentNodeFolder && isAssessmentLevel(selectedNode ?? undefined);
  const assessmentSlotType: 'pre' | 'post' | null = isAssessmentSlot
    ? (treeData[0]?.children?.[0]?.id === selectedNode?.id ? 'pre' : 'post')
    : (isLearningPath ? activeAssessmentSlot : null);

  // Review comment from previous rejection cycle — only while still in the
  // Draft-after-reject state; hidden once resubmitted for review or published.
  const reviewComment = getDraftRejectComment(selectedNode)
    ?? (isCurrentNodeRoot ? getDraftRejectComment(treeData[0]) : undefined);

  const handleTitleChange = useCallback(() => {
    const el = titleRef.current;
    if (!el || !selectedNodeId) return;
    const newTitle = el.innerText.trim();
    clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(() => {
      updateNode(selectedNodeId, { name: newTitle });
    }, 600);
  }, [selectedNodeId, updateNode]);

  const handleFormValueChange = useCallback((data: unknown) => {
    onToolbarEvent({ action: 'onFormValueChange', data });
  }, [onToolbarEvent]);

  const handleFormStatusChange = useCallback((isValid: boolean, invalidTabs: TabId[]) => {
    setErrorTabs(invalidTabs);
    onToolbarEvent({ action: 'onFormStatusChange', data: { isValid, nodeId: selectedNodeId } });
  }, [onToolbarEvent, selectedNodeId]);

  if (!selectedNode) {
    return (
      <div className={styles.emptyState}>
        <p>{lbl.contextualEditor.emptyStateMessage}</p>
      </div>
    );
  }

  if (isQuml) {
    return (
      <ContentPlayer
        node={selectedNode}
        editorMode={editorMode}
        type="quml"
        singleQuestion={isSingleQuestion}
      />
    );
  }

  // LP profile: a linked Course is never authored/played inline — show the
  // read-only "Course details" (Title, Units, Topics) instead of
  // ContentPlayer + ContentEditForm (design: "Course details ... Back to {Level}").
  // A Level Exam course is linked the same way but categorized Evaluation
  // Course, not Course — it needs the same treatment, not the generic
  // leaf-content/player fallback below.
  if (isLearningPath && isLeafContent && (selectedNode.primaryCategory === 'Course' || isEvaluationCourse(selectedNode))) {
    const parentLevelInfo = selectedNode.parent
      ? getLevelDisplayInfo(treeData[0]?.children ?? [], selectedNode.parent)
      : null;
    const backToLabel = parentLevelInfo?.role === 'pre' ? lbl.learningPath.priorAssessmentLabel
      : parentLevelInfo?.role === 'post' ? lbl.learningPath.outcomeAssessmentLabel
      : parentLevelInfo?.role === 'level'
        ? lbl.learningPath.levelNumberPrefix.replace('{n}', String(parentLevelInfo.levelNumber))
        : null;
    const contentCountLabel = courseContentCount === null ? ''
      : ` · ${(courseContentCount === 1 ? lbl.learningPath.contentCountLabel : lbl.learningPath.contentCountLabelPlural)
          .replace('{count}', String(courseContentCount))}`;
    return (
      <div className={styles.container}>
        <button
          type="button"
          className={styles.backToPathButton}
          onClick={() => selectedNode.parent && selectNode(selectedNode.parent)}
        >
          <ArrowLeft size={14} />
          {backToLabel ? lbl.learningPath.backToLevelButton.replace('{label}', backToLabel) : lbl.learningPath.backToPathButton}
        </button>
        <div className={styles.courseDetailHeader}>
          <span className={styles.courseDetailIcon}><BookOpen size={26} /></span>
          <div>
            <h2 className={styles.courseDetailTitle}>{selectedNode.name}</h2>
            <span className={styles.courseDetailMeta}>{selectedNode.primaryCategory}{contentCountLabel}</span>
          </div>
        </div>
        <CourseDetailsPanel
          key={selectedNode.identifier}
          courseId={selectedNode.identifier}
          variant="full"
          title={selectedNode.name}
          onLoaded={({ totalContents }) => setCourseContentCount(totalContents)}
        />
      </div>
    );
  }

  if (assessmentSlotType) {
    return <AssessmentDetailPanel slot={assessmentSlotType} isEditable={editorMode === 'edit'} />;
  }

  if (isLeafContent) {
    return (
      <div className={styles.leafContentLayout}>
        <ContentPlayer node={selectedNode} editorMode={editorMode} type="content" layout="flow" />
        <ContentEditForm
          node={selectedNode}
          editorMode={editorMode}
          onMoveClick={() => setReorderResourceId(selectedNode.identifier)}
          reorderDialog={reorderResourceId ? (
            <ResourceReorderDialog
              resourceId={reorderResourceId}
              resourceName={selectedNode.name}
              currentUnitId={selectedNode.parent ?? ''}
              onClose={() => setReorderResourceId(null)}
            />
          ) : null}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Breadcrumb crumbs={breadcrumb} />

      {/* Review comment bar — shown whenever a rejection comment exists (edit or review mode) */}
      {reviewComment && (
        <div className={styles.reviewComment} role="alert">
          <span className={styles.reviewCommentLabel}>{lbl.contextualEditor.reviewCommentLabel}</span>
          <span className={styles.reviewCommentText}>{reviewComment}</span>
        </div>
      )}

      {/* Title row: app icon (root only) + inline editable title */}
      <div className={[styles.titleRow, isLearningPath ? styles.titleRowLp : ''].filter(Boolean).join(' ')}>
        {isCurrentNodeRoot && selectedNodeId && (
          <TitleAppIcon
            nodeId={selectedNodeId}
            value={String(selectedNode.appIcon ?? selectedNode.metadata?.appIcon ?? '')}
            editable={editorMode === 'edit'}
          />
        )}
        <div
          ref={titleRef}
          className={[
            styles.nodeTitle,
            isLearningPath && isCurrentNodeRoot ? styles.nodeTitleLpRoot : '',
            isLearningPath && !isCurrentNodeRoot ? styles.nodeTitleSub : '',
          ].filter(Boolean).join(' ')}
          contentEditable={editorMode === 'edit'}
          suppressContentEditableWarning
          onInput={handleTitleChange}
          onBlur={handleTitleChange}
          data-placeholder={lbl.contextualEditor.untitledPlaceholder}
          aria-label={lbl.contextualEditor.nodeTitleAriaLabel}
        >
          {selectedNode.name}
        </div>
      </div>

      {/* Tabs — Collection root shows all three; units, and the LP root
          (no target framework / audience fields at all — profile sets
          targetFWType: []), show only Details. */}
      <TabBar
        activeTab={activeTab}
        onChange={tab => setActiveTab(tab as TabId)}
        errorTabs={errorTabs}
        visibleTabs={isCurrentNodeRoot && !isLearningPath ? undefined : ['details']}
      />

      {/* Form */}
      <div className={styles.formArea}>
        <SparkMetaForm
          key={`${selectedNodeId ?? 'none'}:${isCurrentNodeRoot ? 'root' : 'node'}`}
          nodeMetadata={activeNodeMeta}
          activeTab={activeTab}
          isRoot={isCurrentNodeRoot}
          isFolder={isCurrentNodeFolder}
          editorMode={editorMode}
          onFormValueChange={handleFormValueChange}
          onFormStatusChange={handleFormStatusChange}
        />
      </div>

      {/* Content list — for folder nodes (both root and non-root units) */}
      {(isCurrentNodeFolder || isCurrentNodeRoot) && activeTab === 'details' && (
        <div className={[styles.contentListArea, isLearningPath ? styles.contentListAreaLp : ''].filter(Boolean).join(' ')}>
          <UnitContentList editorMode={editorMode} isRoot={isCurrentNodeRoot} />
        </div>
      )}

      {/* Drop zone overlay */}
      <DropZone
        isActive={false}
        label={lbl.contextualEditor.dropZoneLabel}
        nodeId={selectedNodeId ?? undefined}
        className={styles.dropZone}
      />

      {/* Modals */}
      {showAssignPage && (
        <AssignPageNumber contentId={contentId} onClose={() => setShowAssignPage(false)} />
      )}
    </div>
  );
};

function findNodeById(
  nodes: import('../../types/editor').INode[],
  id: string,
): import('../../types/editor').INode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const f = findNodeById(n.children, id);
      if (f) return f;
    }
  }
  return undefined;
}
