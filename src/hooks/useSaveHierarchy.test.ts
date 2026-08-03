import { describe, it, expect } from 'vitest';
import { buildSavePayload } from './useSaveHierarchy';
import { collectionProfile, learningPathProfile } from '../types/profile';
import type { INode } from '../types/editor';

// Representative Course tree: root -> existing unit (cached edit) -> leaf (cached edit),
// plus a brand-new unit -> uncached leaf. Exercises every buildSavePayload branch.
const tree: INode[] = [
  {
    id: 'do_root', identifier: 'do_root', name: 'My Course', isFolder: true,
    metadata: { name: 'My Course', description: 'A course', mimeType: 'application/vnd.ekstep.content-collection' },
    children: [
      {
        id: 'do_unit1', identifier: 'do_unit1', name: 'Unit 1', isFolder: true, parent: 'do_root',
        metadata: { name: 'Unit 1' },
        children: [
          {
            id: 'do_leaf1', identifier: 'do_leaf1', name: 'Video 1', isFolder: false, parent: 'do_unit1',
            objectType: 'Content',
            metadata: { name: 'Video 1' },
            children: [],
          },
        ],
      },
      {
        id: 'temp-newunit', identifier: 'temp-newunit', name: 'Untitled Unit', isFolder: true, parent: 'do_root',
        metadata: { name: 'Untitled Unit' },
        children: [
          {
            id: 'do_leaf2', identifier: 'do_leaf2', name: 'Video 2', isFolder: false, parent: 'temp-newunit',
            objectType: 'Content',
            metadata: { name: 'Video 2' },
            children: [],
          },
        ],
      },
    ],
  },
];

const treeCache = {
  do_root: { description: 'An updated course description' },
  do_unit1: { description: 'Unit description' },
  do_leaf1: { name: 'Video 1 (renamed)' },
  'temp-newunit': { isNew: true },
};

describe('buildSavePayload (collection profile)', () => {
  it('produces the exact v3 nodesModified/hierarchy shape', () => {
    const { nodesModified, hierarchy } = buildSavePayload(tree, treeCache, 'test-channel', collectionProfile);

    expect(nodesModified).toEqual({
      do_root: {
        metadata: {
          mimeType: 'application/vnd.ekstep.content-collection',
          description: 'An updated course description',
          name: 'My Course',
        },
        objectType: 'Collection',
        root: true,
        isNew: false,
      },
      do_unit1: {
        metadata: { name: 'Unit 1', visibility: 'Parent', description: 'Unit description' },
        objectType: 'Collection',
        root: false,
        isNew: false,
      },
      'temp-newunit': {
        metadata: {
          mimeType: 'application/vnd.ekstep.content-collection',
          code: 'temp-newunit',
          contentType: 'CourseUnit',
          primaryCategory: 'Course Unit',
          name: 'Untitled Unit',
          visibility: 'Parent',
          channel: 'test-channel',
        },
        objectType: 'Collection',
        root: false,
        isNew: true,
      },
    });

    expect(hierarchy).toEqual({
      do_root: { name: 'My Course', children: ['do_unit1', 'temp-newunit'], root: true },
      do_unit1: {
        name: 'Unit 1',
        children: ['do_leaf1'],
        relationalMetadata: { do_leaf1: { name: 'Video 1 (renamed)' } },
        root: false,
      },
      do_leaf1: { name: 'Video 1', children: [], root: false },
      'temp-newunit': { name: 'Untitled Unit', children: ['do_leaf2'], root: false },
      do_leaf2: { name: 'Video 2', children: [], root: false },
    });
  });

  it('is unaffected by the profile param default (Phase 0 exit criterion)', () => {
    const withDefault = buildSavePayload(tree, treeCache, 'test-channel');
    const withExplicitCollectionProfile = buildSavePayload(tree, treeCache, 'test-channel', collectionProfile);
    expect(withDefault).toEqual(withExplicitCollectionProfile);
  });
});

describe('buildSavePayload (learningPath profile)', () => {
  it('stamps new unit nodes with the Level contentType/primaryCategory instead of CourseUnit', () => {
    const { nodesModified } = buildSavePayload(tree, treeCache, 'test-channel', learningPathProfile);
    expect(nodesModified['temp-newunit']).toMatchObject({
      metadata: { contentType: 'Competency Level', primaryCategory: 'Level' },
    });
  });
});
