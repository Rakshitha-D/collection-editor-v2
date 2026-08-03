import { describe, it, expect, beforeEach } from 'vitest';
import { useTreeStore } from './tree.store';
import { useEditorStore } from './editor.store';
import { learningPathProfile, collectionProfile } from '../types/profile';
import type { INode } from '../types/editor';
import type { IContent } from '../types/content';

const rootNode = (): INode => ({
  id: 'root', identifier: 'root', name: 'My Path', isFolder: true, children: [],
  metadata: { name: 'My Path' },
});

const course = (id: string, name = 'Course'): IContent => ({
  identifier: id, name, mimeType: 'application/vnd.ekstep.content-collection', primaryCategory: 'Course',
});

function setupLpTree() {
  useEditorStore.setState({ editorProfile: learningPathProfile });
  useTreeStore.setState({ treeData: [rootNode()], treeCache: {}, selectedNodeId: 'root' });
}

describe('tree.store (Learning Path) — assessment-slot auto-wrap', () => {
  beforeEach(setupLpTree);

  it('auto-wraps the first assessment course into a new pre-slot Level at index 0', () => {
    const added = useTreeStore.getState().addResource(course('c1', 'Prior Course'), 'root', { isAssessmentCourse: true });
    expect(added).toBe(true);

    const root = useTreeStore.getState().treeData[0];
    expect(root.children).toHaveLength(1);
    const preLevel = root.children![0];
    expect(preLevel.metadata?.contentType).toBe('Competency Level');
    expect(preLevel.metadata?.primaryCategory).toBe('Level');
    expect(preLevel.children).toHaveLength(1);
    expect(preLevel.children![0].id).toBe('c1');
    expect(preLevel.children![0].metadata?.isAssessmentCourse).toBe(true);
  });

  it('auto-wraps the second assessment course into a new post-slot Level appended at the end', () => {
    useTreeStore.getState().addResource(course('c1', 'Prior'), 'root', { isAssessmentCourse: true });
    useTreeStore.getState().addResource(course('c2', 'Outcome'), 'root', { isAssessmentCourse: true });

    const root = useTreeStore.getState().treeData[0];
    expect(root.children).toHaveLength(2);
    expect(root.children![0].children![0].id).toBe('c1');
    expect(root.children![1].children![0].id).toBe('c2');
  });

  it('rejects a third assessment course targeted at root once both slots are filled', () => {
    useTreeStore.getState().addResource(course('c1'), 'root', { isAssessmentCourse: true });
    useTreeStore.getState().addResource(course('c2'), 'root', { isAssessmentCourse: true });
    const added = useTreeStore.getState().addResource(course('c3'), 'root', { isAssessmentCourse: true });
    expect(added).toBe(false);
    expect(useTreeStore.getState().treeData[0].children).toHaveLength(2);
  });

  it('rejects a non-assessment course targeted directly at root', () => {
    const added = useTreeStore.getState().addResource(course('c1'), 'root');
    expect(added).toBe(false);
  });

  it('inserts the pre slot ahead of an existing content Level, keeping it pinned at index 0', () => {
    const levelId = useTreeStore.getState().addNode('root', 'unit');
    const added = useTreeStore.getState().addResource(course('c1'), 'root', { isAssessmentCourse: true });
    expect(added).toBe(true);

    const root = useTreeStore.getState().treeData[0];
    expect(root.children).toHaveLength(2);
    expect(root.children![0].children![0]?.id).toBe('c1'); // pre slot now pinned at index 0
    expect(root.children![1].id).toBe(levelId); // original content Level pushed to index 1
  });

  it('rejects a duplicate course even through the auto-wrap path', () => {
    useTreeStore.getState().addResource(course('c1'), 'root', { isAssessmentCourse: true });
    const added = useTreeStore.getState().addResource(course('c1'), 'root', { isAssessmentCourse: true });
    expect(added).toBe(false);
    expect(useTreeStore.getState().treeData[0].children).toHaveLength(1);
  });
});

describe('tree.store (Learning Path) — per-Level course caps (addResource)', () => {
  beforeEach(setupLpTree);

  it('allows unlimited regular courses on a content Level', () => {
    const levelId = useTreeStore.getState().addNode('root', 'unit');
    expect(useTreeStore.getState().addResource(course('c1'), levelId)).toBe(true);
    expect(useTreeStore.getState().addResource(course('c2'), levelId)).toBe(true);
  });

  it('allows exactly one Level-assessment course on a content Level, rejecting a second', () => {
    const levelId = useTreeStore.getState().addNode('root', 'unit');
    expect(useTreeStore.getState().addResource(course('a1'), levelId, { isAssessmentCourse: true })).toBe(true);
    expect(useTreeStore.getState().addResource(course('a2'), levelId, { isAssessmentCourse: true })).toBe(false);
  });

  it('rejects any further addition to a Level that is already an assessment slot', () => {
    useTreeStore.getState().addResource(course('c1'), 'root', { isAssessmentCourse: true });
    const preLevelId = useTreeStore.getState().treeData[0].children![0].id;
    expect(useTreeStore.getState().addResource(course('c2'), preLevelId)).toBe(false);
  });
});

describe('tree.store (Learning Path) — slot pinning (reorderChildren)', () => {
  beforeEach(setupLpTree);

  it('rejects moving the pinned pre Level away from index 0', () => {
    useTreeStore.getState().addResource(course('c1'), 'root', { isAssessmentCourse: true });
    useTreeStore.getState().addNode('root', 'unit');
    useTreeStore.getState().addNode('root', 'unit');

    useTreeStore.getState().reorderChildren('root', 0, 2);

    expect(useTreeStore.getState().treeData[0].children![0].children![0]?.id).toBe('c1');
  });

  it('allows reordering content Levels between the pinned slots', () => {
    useTreeStore.getState().addResource(course('c1'), 'root', { isAssessmentCourse: true });
    const mid1 = useTreeStore.getState().addNode('root', 'unit');
    const mid2 = useTreeStore.getState().addNode('root', 'unit');
    useTreeStore.getState().addResource(course('c2'), 'root', { isAssessmentCourse: true });

    useTreeStore.getState().reorderChildren('root', 1, 2);

    const ids = useTreeStore.getState().treeData[0].children!.map((c) => c.id);
    expect(ids[1]).toBe(mid2);
    expect(ids[2]).toBe(mid1);
    expect(useTreeStore.getState().treeData[0].children![0].children![0]?.id).toBe('c1');
    expect(useTreeStore.getState().treeData[0].children![3].children![0]?.id).toBe('c2');
  });
});

describe('tree.store (Learning Path) — per-Level course caps on cross-Level drag (moveNode)', () => {
  beforeEach(setupLpTree);

  it('blocks moving a course into an already-full assessment Level', () => {
    useTreeStore.getState().addResource(course('c1'), 'root', { isAssessmentCourse: true });
    const preLevelId = useTreeStore.getState().treeData[0].children![0].id;
    const midId = useTreeStore.getState().addNode('root', 'unit');
    useTreeStore.getState().addResource(course('c2'), midId);

    useTreeStore.getState().moveNode('c2', midId, preLevelId);

    const mid = useTreeStore.getState().treeData[0].children!.find((c) => c.id === midId)!;
    expect(mid.children!.some((c) => c.id === 'c2')).toBe(true); // still there — move blocked
  });

  it('blocks moving a second Level-assessment course into a content Level that already has one', () => {
    const midId = useTreeStore.getState().addNode('root', 'unit');
    useTreeStore.getState().addResource(course('a1'), midId, { isAssessmentCourse: true });
    const otherId = useTreeStore.getState().addNode('root', 'unit');
    useTreeStore.getState().addResource(course('a2'), otherId, { isAssessmentCourse: true });

    useTreeStore.getState().moveNode('a2', otherId, midId);

    const other = useTreeStore.getState().treeData[0].children!.find((c) => c.id === otherId)!;
    expect(other.children!.some((c) => c.id === 'a2')).toBe(true); // still there — move blocked
  });

  it('allows moving a regular course between content Levels', () => {
    const midId = useTreeStore.getState().addNode('root', 'unit');
    const otherId = useTreeStore.getState().addNode('root', 'unit');
    useTreeStore.getState().addResource(course('c1'), midId);

    useTreeStore.getState().moveNode('c1', midId, otherId);

    const other = useTreeStore.getState().treeData[0].children!.find((c) => c.id === otherId)!;
    expect(other.children!.some((c) => c.id === 'c1')).toBe(true);
  });
});

describe('tree.store — collection profile is unaffected by the LP guards', () => {
  beforeEach(() => {
    useEditorStore.setState({ editorProfile: collectionProfile });
    useTreeStore.setState({ treeData: [rootNode()], treeCache: {}, selectedNodeId: 'root' });
  });

  it('ignores isAssessmentCourse opts entirely — no auto-wrap, no per-Level cap', () => {
    const levelId = useTreeStore.getState().addNode('root', 'unit');
    expect(useTreeStore.getState().addResource(course('c1'), levelId, { isAssessmentCourse: true })).toBe(true);
    expect(useTreeStore.getState().addResource(course('c2'), levelId, { isAssessmentCourse: true })).toBe(true);
  });

  it('addResource still refuses to target root directly (unrelated allowContentUnderRoot guard)', () => {
    expect(useTreeStore.getState().addResource(course('c1'), 'root', { isAssessmentCourse: true })).toBe(false);
  });
});
