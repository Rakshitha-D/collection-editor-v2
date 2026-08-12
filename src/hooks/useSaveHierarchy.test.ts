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
      metadata: { contentType: 'Level', primaryCategory: 'Level' },
    });
  });

  it('a linked Course leaf under a Level never appears in nodesModified and links with empty children[] in hierarchy', () => {
    const lpTree: INode[] = [
      {
        id: 'do_lp', identifier: 'do_lp', name: 'My Path', isFolder: true,
        metadata: { name: 'My Path', policy: 'strict', mimeType: 'application/vnd.ekstep.content-collection' },
        children: [
          {
            id: 'temp-level1', identifier: 'temp-level1', name: 'Level 1', isFolder: true, parent: 'do_lp',
            metadata: { name: 'Level 1', contentType: 'Level', primaryCategory: 'Level' },
            children: [
              {
                // A linked, published Course — never authored, never in nodesModified.
                id: 'do_course1', identifier: 'do_course1', name: 'Intro to Python', isFolder: false, parent: 'temp-level1',
                objectType: 'Content', primaryCategory: 'Course',
                metadata: { name: 'Intro to Python', primaryCategory: 'Course' },
                children: [],
              },
            ],
          },
        ],
      },
    ];
    const lpTreeCache = { 'temp-level1': { isNew: true } };

    const { nodesModified, hierarchy } = buildSavePayload(lpTree, lpTreeCache, 'test-channel', learningPathProfile);

    expect(Object.keys(nodesModified).sort()).toEqual(['do_lp', 'temp-level1']);
    expect(nodesModified['temp-level1']).toMatchObject({
      metadata: { contentType: 'Level', primaryCategory: 'Level' },
      isNew: true,
    });

    // The linked Course is a leaf in the saved hierarchy — present with no
    // children (a link, not an expansion) — never modified as if authored.
    expect(hierarchy['do_course1']).toEqual({ name: 'Intro to Python', children: [], root: false });
    expect(hierarchy['temp-level1']).toMatchObject({ children: ['do_course1'] });
  });

  it('persists a Level\'s selected skills as a flat resolved-skill-category field, stripping nested metadata patches and local flags', () => {
    // Field name is the resolved skill-category code (e.g. 'skill' for
    // USF) — never the reserved Sunbird 'competencies' field, whose
    // platform schema expects competency-ontology objects, not plain
    // framework-term strings (see lpStructure.ts).
    const lpTree: INode[] = [
      {
        id: 'do_lp', identifier: 'do_lp', name: 'My Path', isFolder: true,
        metadata: { name: 'My Path' },
        children: [
          {
            id: 'do_level1', identifier: 'do_level1', name: 'Level 1', isFolder: true, parent: 'do_lp',
            metadata: { name: 'Level 1', skill: ['Python basics'] },
            children: [],
          },
        ],
      },
    ];
    const lpTreeCache = {
      'do_level1': {
        skill: ['Python basics', 'Data handling'],
        // legacy nested patch shape + local-only flag — must never reach the API
        metadata: { skill: ['stale'] },
        isAssessmentCourse: true,
      },
    };

    const { nodesModified } = buildSavePayload(lpTree, lpTreeCache, 'test-channel', learningPathProfile);

    const levelMeta = (nodesModified['do_level1'] as { metadata: Record<string, unknown> }).metadata;
    expect(levelMeta.skill).toEqual(['Python basics', 'Data handling']);
    expect(levelMeta).not.toHaveProperty('metadata');
    expect(levelMeta).not.toHaveProperty('isAssessmentCourse');
  });

  it('wraps the LP root Curriculum section\'s single-select category picks (industry/domain) into arrays', () => {
    // adaptLpCurriculumFields renders these as single-select (per the
    // Curriculum-fields fix) — SparkMetaForm's onChange writes the picked
    // term as a scalar, but the backend schema still types the field as an
    // array (same convention as medium/gradeLevel/subject), rejecting a
    // scalar with "Metadata domain should be a/an Array value".
    const lpTree: INode[] = [
      {
        id: 'do_lp', identifier: 'do_lp', name: 'My Path', isFolder: true,
        metadata: { name: 'My Path' },
        children: [],
      },
    ];
    const lpTreeCache = {
      do_lp: { industry: 'Information Technology', domain: 'Software Development' },
    };

    const { nodesModified } = buildSavePayload(lpTree, lpTreeCache, 'test-channel', learningPathProfile);

    const rootMeta = (nodesModified['do_lp'] as { metadata: Record<string, unknown> }).metadata;
    expect(rootMeta.industry).toEqual(['Information Technology']);
    expect(rootMeta.domain).toEqual(['Software Development']);
  });
});
