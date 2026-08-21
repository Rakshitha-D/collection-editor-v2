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
    expect(preLevel.metadata?.contentType).toBe('Level');
    expect(preLevel.metadata?.primaryCategory).toBe('Level');
    expect(preLevel.name).toBe('Prior Assessment'); // named after its slot, not "Untitled Level"
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
    expect(root.children![1].name).toBe('Outcome Assessment');
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

  it('rejects filling an explicitly-requested slot that is already filled — never falls back to the other slot', () => {
    useTreeStore.getState().addResource(course('c1'), 'root', { isAssessmentCourse: true, slot: 'pre' });
    const added = useTreeStore.getState().addResource(course('c2'), 'root', { isAssessmentCourse: true, slot: 'pre' });
    expect(added).toBe(false);
    const root = useTreeStore.getState().treeData[0];
    expect(root.children).toHaveLength(1); // c2 did NOT leak into the post slot
    expect(root.children![0].children![0].id).toBe('c1');
  });

  it('fills the requested post slot even while the pre slot is still open', () => {
    const levelId = useTreeStore.getState().addNode('root', 'unit');
    const added = useTreeStore.getState().addResource(course('c1'), 'root', { isAssessmentCourse: true, slot: 'post' });
    expect(added).toBe(true);

    const root = useTreeStore.getState().treeData[0];
    expect(root.children).toHaveLength(2);
    expect(root.children![0].id).toBe(levelId); // content Level untouched at index 0 — pre stays open
    expect(root.children![1].children![0].id).toBe('c1'); // wrapped at the end (post)
  });
});

describe("tree.store — updateNode mirrors the fixed 'skills' field (Level skill selection)", () => {
  beforeEach(setupLpTree);

  it("mirrors 'skills' into node.metadata — a static field, no per-call key list needed", () => {
    const levelId = useTreeStore.getState().addNode('root', 'unit');
    useTreeStore.getState().updateNode(levelId, { skills: ['Python basics'] });

    const level = useTreeStore.getState().treeData[0].children!.find((c) => c.id === levelId)!;
    expect(level.metadata?.['skills']).toEqual(['Python basics']);
    expect(useTreeStore.getState().treeCache[levelId]?.['skills']).toEqual(['Python basics']);
  });

  it('mirrors the static METADATA_MIRROR_FIELDS alongside skills in the same patch', () => {
    const levelId = useTreeStore.getState().addNode('root', 'unit');
    useTreeStore.getState().updateNode(levelId, { name: 'Level A', skills: ['Java'] });

    const level = useTreeStore.getState().treeData[0].children!.find((c) => c.id === levelId)!;
    expect(level.metadata?.['name']).toBe('Level A');
    expect(level.metadata?.['skills']).toEqual(['Java']);
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

  it('still allows a regular course on a middle Level whose only current course is its Level assessment', () => {
    // Three Levels so the target is genuinely in the middle — same shape as
    // a pre/post slot (exactly one assessment-flagged child), but position
    // must be what decides "is this actually a slot," not shape alone.
    useTreeStore.getState().addNode('root', 'unit');
    const midLevelId = useTreeStore.getState().addNode('root', 'unit');
    useTreeStore.getState().addNode('root', 'unit');

    expect(useTreeStore.getState().addResource(course('a1'), midLevelId, { isAssessmentCourse: true })).toBe(true);
    expect(useTreeStore.getState().addResource(course('c1'), midLevelId)).toBe(true);
  });

  it('rejects adding a course under a course — courses are terminal leaves', () => {
    const levelId = useTreeStore.getState().addNode('root', 'unit');
    useTreeStore.getState().addResource(course('c1'), levelId);
    expect(useTreeStore.getState().addResource(course('c2'), 'c1')).toBe(false);

    const level = useTreeStore.getState().treeData[0].children!.find((c) => c.id === levelId)!;
    expect(level.children!.find((c) => c.id === 'c1')!.children).toHaveLength(0);
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

  it('blocks moving a course under another course — courses are terminal leaves', () => {
    const midId = useTreeStore.getState().addNode('root', 'unit');
    useTreeStore.getState().addResource(course('c1'), midId);
    useTreeStore.getState().addResource(course('c2'), midId);

    useTreeStore.getState().moveNode('c2', midId, 'c1');

    const mid = useTreeStore.getState().treeData[0].children!.find((c) => c.id === midId)!;
    expect(mid.children!.some((c) => c.id === 'c2')).toBe(true); // still there — move blocked
    expect(mid.children!.find((c) => c.id === 'c1')!.children).toHaveLength(0);
  });
});

describe('tree.store (Learning Path) — pinned post slot stays last (addNode)', () => {
  beforeEach(setupLpTree);

  it('inserts a new Level before an already-filled Outcome Assessment slot, not after it', () => {
    useTreeStore.getState().addNode('root', 'unit'); // first content Level
    useTreeStore.getState().addResource(course('c1'), 'root', { isAssessmentCourse: true, slot: 'post' });

    const newLevelId = useTreeStore.getState().addNode('root', 'unit');

    const ids = useTreeStore.getState().treeData[0].children!.map((c) => c.id);
    expect(ids[ids.length - 1]).not.toBe(newLevelId); // post slot still last
    expect(useTreeStore.getState().treeData[0].children![ids.length - 1].children![0]?.id).toBe('c1');
    expect(ids).toContain(newLevelId);
  });

  it('still appends normally when neither slot is filled', () => {
    const first = useTreeStore.getState().addNode('root', 'unit');
    const second = useTreeStore.getState().addNode('root', 'unit');

    const ids = useTreeStore.getState().treeData[0].children!.map((c) => c.id);
    expect(ids).toEqual([first, second]);
  });
});

describe('tree.store (Learning Path) — moving a whole Level is guarded (moveNode)', () => {
  beforeEach(setupLpTree);

  it('blocks dragging a Level into another Level (folder-into-folder nesting)', () => {
    const levelA = useTreeStore.getState().addNode('root', 'unit');
    const levelB = useTreeStore.getState().addNode('root', 'unit');

    useTreeStore.getState().moveNode(levelB, 'root', levelA);

    const root = useTreeStore.getState().treeData[0];
    expect(root.children!.some((c) => c.id === levelB)).toBe(true); // still a direct child of root
    const a = root.children!.find((c) => c.id === levelA)!;
    expect(a.children!.some((c) => c.id === levelB)).toBe(false); // not nested under levelA
  });

  it('still allows moving a Level back to root (a no-op reposition, not nesting)', () => {
    const levelA = useTreeStore.getState().addNode('root', 'unit');

    useTreeStore.getState().moveNode(levelA, 'root', 'root');

    const root = useTreeStore.getState().treeData[0];
    expect(root.children!.some((c) => c.id === levelA)).toBe(true);
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

  it('also rejects adding content under leaf content (terminal-leaf rule is profile-independent)', () => {
    const unitId = useTreeStore.getState().addNode('root', 'unit');
    useTreeStore.getState().addResource(course('c1'), unitId);
    expect(useTreeStore.getState().addResource(course('c2'), 'c1')).toBe(false);
  });
});
