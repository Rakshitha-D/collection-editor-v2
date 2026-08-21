import React, { useCallback } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import type { EditorMode } from '../../types/editor';
import { useTreeStore } from '../../store/tree.store';
import { useEditorStore } from '../../store/editor.store';
import { useUiStore } from '../../store/ui.store';
import { useLabels } from '../../hooks/useLabels';
import { useSkillScope } from '../../hooks/useSkillScope';
import { computeSkillsCovered, computeUncoveredSkills, isAssessmentLevel } from '../../utils/lpStructure';
import { useSkillCategory } from '../../hooks/useSkillCategory';
import { ContentRow } from './ContentRow';
import { SkillPicker } from './SkillPicker';
import { AssessmentSlotItem } from './AssessmentSlotItem';
import { LevelExamItem } from './LevelExamItem';
import { LevelCourseItem } from './LevelCourseItem';
import styles from './UnitContentList.module.scss';

interface UnitContentListProps {
  editorMode: EditorMode;
  isRoot?: boolean;
}

export const UnitContentList: React.FC<UnitContentListProps> = ({ editorMode, isRoot = false }) => {
  const lbl = useLabels();
  const { selectedNodeId, getChildrenOf, getNodeById, reorderChildren, deleteNode, activeNodeMeta, updateNode, treeData } = useTreeStore();
  const editorProfile = useEditorStore(s => s.editorProfile);
  const children = selectedNodeId ? getChildrenOf(selectedNodeId) : [];
  const isEditable = editorMode === 'edit';
  const selectedNode = selectedNodeId ? getNodeById(selectedNodeId) : undefined;
  const isLearningPath = editorProfile.competencyScoped;
  // Assessment Levels (pre/post/level-assessment) hold exactly one course
  // whose own skill tags apply — no manual skill picker for them.
  const isLpLevel = isLearningPath && !isRoot && !isAssessmentLevel(selectedNode);
  const isLpRoot = isLearningPath && isRoot;
  // Explicit, parallel counterpart to "Add Level Exam" below — regular
  // course adds otherwise have no button of their own here (they just
  // happen whenever nothing is armed and this Level is selected), which
  // made it unclear how to get back to plain browsing once Level Exam mode
  // was armed. Clicking this unarms any slot/exam target; it has no "on"
  // state of its own to arm, so it's highlighted whenever neither is armed.
  const activeAssessmentSlot = useUiStore((s) => s.activeAssessmentSlot);
  const activeLevelExamTarget = useUiStore((s) => s.activeLevelExamTarget);
  const setActiveAssessmentSlot = useUiStore((s) => s.setActiveAssessmentSlot);
  const isDefaultAddMode = !activeAssessmentSlot && !activeLevelExamTarget;

  const { scope, source } = useSkillScope();
  const skillCategory = useSkillCategory();
  // Selected skills live under the resolved skill-category code (e.g. 'skill'
  // for USF) — the SAME field a linked course's own tags use — never the
  // reserved Sunbird `competencies` field, whose platform schema expects
  // competency-ontology objects, not plain framework-term strings.
  const selectedSkills = skillCategory && Array.isArray(activeNodeMeta[skillCategory.code])
    ? activeNodeMeta[skillCategory.code] as string[]
    : [];
  const outOfScopeSkills = source === 'prior' ? selectedSkills.filter(s => !scope.includes(s)) : [];
  const skillsCovered = isLpRoot ? computeSkillsCovered(treeData[0], skillCategory?.code) : [];
  // Selected but no linked course under THIS Level actually carries the tag —
  // independent of (and can overlap with) out-of-scope: a skill can be both.
  const uncoveredSkills = isLpLevel
    ? computeUncoveredSkills(selectedNode, selectedSkills, skillCategory?.code)
    : [];

  const handleSkillsChange = useCallback((skills: string[]) => {
    if (!selectedNodeId || !skillCategory?.code) return;
    // Flat patch — extraMirrorKeys makes this land in node.metadata AND flat
    // in treeCache, where buildSavePayload persists it. A nested
    // { metadata: {...} } patch would save a bogus 'metadata' field.
    updateNode(selectedNodeId, { [skillCategory.code]: skills }, [skillCategory.code]);
  }, [selectedNodeId, skillCategory?.code, updateNode]);

  const sensors = useSensors(
    // distance:5 prevents conflict with outer DnD context (distance:8) while still feeling responsive
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !selectedNodeId) return;
    // Read fresh children at event time to avoid stale closure
    const fresh = useTreeStore.getState().getChildrenOf(selectedNodeId);
    const fromIndex = fresh.findIndex(c => c.id === active.id);
    const toIndex = fresh.findIndex(c => c.id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    reorderChildren(selectedNodeId, fromIndex, toIndex);
  }, [selectedNodeId, reorderChildren]);

  const handleRemove = useCallback((id: string) => {
    if (window.confirm(lbl.unitContentList.removeConfirm)) {
      deleteNode(id);
    }
  }, [deleteNode, lbl.unitContentList.removeConfirm]);

  // Same confirmDelete modal OutlineTree's own course-delete and
  // useLevelExam's deleteExam use — keeps every LP course-removal path
  // consistent, rather than falling back to Collection's window.confirm.
  const openModal = useUiStore((s) => s.openModal);
  const handleRemoveCourse = useCallback((id: string) => {
    openModal('confirmDelete', {
      message: lbl.learningPath.deleteCourseConfirm,
      onConfirm: () => {
        if (!deleteNode(id)) {
          toast.error(lbl.learningPath.cannotRemoveLastRegularCourseToast);
        }
      },
    });
  }, [openModal, deleteNode, lbl.learningPath.deleteCourseConfirm, lbl.learningPath.cannotRemoveLastRegularCourseToast]);

  // The Level Exam course (if any) has its own dedicated row (LevelExamItem)
  // above — exclude it here so it's never shown twice.
  const regularCourses = isLpLevel
    ? children.filter((c) => !c.metadata?.['isAssessmentCourse'])
    : [];

  if (!selectedNodeId) return null;

  return (
    <div className={styles.container}>
      {isLpRoot && (
        <>
          <div className={styles.skillsCovered}>
            <span className={styles.heading}>{lbl.learningPath.skillsCoveredHeading}</span>
            <span className={styles.emptyHint}>{lbl.learningPath.skillsCoveredDescription}</span>
            {skillsCovered.length > 0 && (
              <div className={styles.chips}>
                {skillsCovered.map(s => <span key={s} className={styles.chip}>{s}</span>)}
              </div>
            )}
            {skillsCovered.length === 0 && (
              <span className={styles.emptyHint}>{lbl.learningPath.noSkillsYet}</span>
            )}
          </div>

          <div className={styles.assessmentsCard}>
            <span className={styles.heading}>{lbl.learningPath.assessmentsCardHeading}</span>
            <span className={styles.emptyHint}>{lbl.learningPath.assessmentsCardDescription}</span>
            <div className={styles.assessmentSlots}>
              <AssessmentSlotItem slot="pre" isEditable={isEditable} />
              <AssessmentSlotItem slot="post" isEditable={isEditable} />
            </div>
          </div>
        </>
      )}

      {isLpLevel && (
        <SkillPicker
          options={scope}
          selected={selectedSkills}
          outOfScope={outOfScopeSkills}
          uncovered={uncoveredSkills}
          onChange={handleSkillsChange}
          isEditable={isEditable}
          description={source === 'prior'
            ? lbl.learningPath.skillScopeFromPriorNote
            : lbl.learningPath.skillScopeManualNote}
        />
      )}

      {isLpLevel && (
        <button
          type="button"
          className={[styles.addRow, styles.addRowAssessment, isDefaultAddMode ? styles.addRowActive : ''].filter(Boolean).join(' ')}
          disabled={!isEditable}
          onClick={() => setActiveAssessmentSlot(null)}
          aria-pressed={isDefaultAddMode}
        >
          <span className={styles.addRowIcon}><Plus size={16} /></span>
          <span className={styles.addRowText}>{lbl.learningPath.addCourseToLevelButton}</span>
        </button>
      )}

      {isLpLevel && <LevelExamItem levelId={selectedNodeId} isEditable={isEditable} />}

      {isLpLevel && (
        <div className={styles.coursesCard}>
          <h3 className={styles.coursesCardTitle}>{lbl.learningPath.coursesCardHeading}</h3>
          <p className={styles.coursesCardDescription}>{lbl.learningPath.coursesCardDescription}</p>
          {regularCourses.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={regularCourses.map(c => c.id)} strategy={verticalListSortingStrategy}>
                <div className={styles.coursesList} role="list">
                  {regularCourses.map(course => (
                    <LevelCourseItem
                      key={course.id}
                      item={course}
                      onRemove={handleRemoveCourse}
                      isEditable={isEditable}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <span className={styles.emptyHint}>{lbl.learningPath.coursesEmptyHint}</span>
          )}
        </div>
      )}

      {/* "Content in this Unit" is a Collection-only concept — a content
          Level's Courses are managed via the Courses card above, and a
          Level's own content is never authored directly. */}
      {!isLearningPath && (
        <>
          <div className={styles.header}>
            <span className={styles.heading}>{lbl.unitContentList.heading}</span>
            <span className={styles.count}>{children.length}</span>
          </div>

          {children.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={children.map(c => c.id)} strategy={verticalListSortingStrategy}>
                <div className={styles.list} role="list">
                  {children.map(child => (
                    <ContentRow
                      key={child.id}
                      item={child}
                      onRemove={handleRemove}
                      isEditable={isEditable}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className={styles.emptyState}>
              <p>{lbl.unitContentList.emptyTitle}</p>
              <span>{lbl.unitContentList.emptyHint}</span>
            </div>
          )}

          {isEditable && !isAssessmentLevel(selectedNode) && (
            <button className={styles.addRow} type="button" aria-label={lbl.unitContentList.addContentAriaLabel}>
              <Plus size={14} /> {lbl.unitContentList.addContent}
            </button>
          )}
        </>
      )}
    </div>
  );
};
