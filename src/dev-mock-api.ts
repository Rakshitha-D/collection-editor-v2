// Dev-only offline mock for the shared `apiClient` axios instance — lets the
// Learning Path UI be exercised (library search, course hierarchy, save)
// without a live backend. Installed conditionally from dev-main.tsx via
// ?mock=1; never imported by the published library entry points.
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { apiClient } from './api/client';

const SKILL_CODE = 'skill';
const LATENCY_MS = 200;

function ok<T>(config: InternalAxiosRequestConfig, data: T): AxiosResponse<T> {
  return { data, status: 200, statusText: 'OK', headers: {}, config };
}

function parseBody(config: InternalAxiosRequestConfig): Record<string, unknown> {
  if (typeof config.data !== 'string') return (config.data ?? {}) as Record<string, unknown>;
  try {
    return JSON.parse(config.data);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

interface MockContentLeaf {
  identifier: string;
  name: string;
  objectType: string;
  mimeType: string;
  contentType: string;
  primaryCategory: string;
  [SKILL_CODE]?: string[];
}

interface MockUnit {
  identifier: string;
  name: string;
  objectType: string;
  mimeType: string;
  visibility: string;
  description?: string;
  keywords?: string[];
  topic?: string[];
  children: MockContentLeaf[];
}

interface MockCourse {
  identifier: string;
  name: string;
  mimeType: string;
  contentType: string;
  primaryCategory: string;
  channel: string;
  organisation: string[];
  status: string;
  description: string;
  framework: string;
  [SKILL_CODE]: string[];
  units: MockUnit[];
}

const CHANNEL = '0146092176054435840';

const leaf = (
  identifier: string,
  name: string,
  mimeType: string,
  skills: string[] = [],
): MockContentLeaf => ({
  identifier,
  name,
  objectType: 'Content',
  mimeType,
  contentType: 'Resource',
  primaryCategory: 'Learning Resource',
  ...(skills.length ? { [SKILL_CODE]: skills } : {}),
});

const questionSetLeaf = (identifier: string, name: string): MockContentLeaf => ({
  identifier,
  name,
  objectType: 'QuestionSet',
  mimeType: 'application/vnd.sunbird.questionset',
  contentType: 'SelfAssess',
  primaryCategory: 'Practice Question Set',
});

const unit = (over: Partial<MockUnit> & { identifier: string; name: string }): MockUnit => ({
  objectType: 'Unit',
  mimeType: 'application/vnd.ekstep.content-collection',
  visibility: 'Parent',
  children: [],
  ...over,
});

function course(over: Partial<MockCourse> & { identifier: string; name: string }): MockCourse {
  return {
    mimeType: 'application/vnd.ekstep.content-collection',
    contentType: 'Course',
    primaryCategory: 'Course',
    channel: CHANNEL,
    organisation: ['Sunbird Org'],
    status: 'Live',
    description: '',
    framework: 'NCF',
    [SKILL_CODE]: [],
    units: [],
    ...over,
  };
}

const MOCK_COURSES: MockCourse[] = [
  course({
    identifier: 'do_mock_prior_assessment',
    name: 'Intro to Machine Learning',
    description: "A diagnostic question set measuring the learner's starting skill.",
    [SKILL_CODE]: ['Data literacy'],
    units: [
      unit({
        identifier: 'do_mock_prior_u1',
        name: 'Diagnostic unit',
        description: 'The single unit holding this question set.',
        keywords: ['diagnostic', 'baseline'],
        topic: ['Starting skill'],
        children: [questionSetLeaf('do_mock_prior_qs1', 'Question set')],
      }),
    ],
  }),
  course({
    identifier: 'do_mock_outcome_assessment',
    name: 'Outcome Question Set',
    description: 'A question set confirming the skill gained across the path.',
    [SKILL_CODE]: ['Data literacy', 'Applied skills'],
    units: [
      unit({
        identifier: 'do_mock_outcome_u1',
        name: 'Outcome unit',
        description: 'The single unit holding this question set.',
        keywords: ['outcome', 'certification'],
        topic: ['Skill gained'],
        children: [questionSetLeaf('do_mock_outcome_qs1', 'Question set')],
      }),
    ],
  }),
  course({
    identifier: 'do_mock_python_for_data',
    name: 'Python for Data',
    description: 'Course content learners complete as part of this level.',
    [SKILL_CODE]: ['Python basics', 'Data handling'],
    units: [
      unit({
        identifier: 'do_mock_python_u1',
        name: 'Unit 1 · Getting started',
        description: 'Foundational concepts before hands-on practice.',
        keywords: ['basics', 'setup'],
        topic: ['Environment', 'syntax'],
        children: [
          leaf('do_mock_python_c1', 'Video lesson', 'video/mp4', ['Python basics']),
          leaf('do_mock_python_c2', 'Reading material', 'application/pdf', ['Python basics']),
        ],
      }),
      unit({
        identifier: 'do_mock_python_u2',
        name: 'Unit 2 · Applied practice',
        description: 'Hands-on exercises reinforcing the unit concepts.',
        keywords: ['practice', 'exercise'],
        topic: ['Data structures', 'loops'],
        children: [
          leaf('do_mock_python_c3', 'Practice quiz', 'application/vnd.ekstep.h5p-archive', ['Data handling']),
        ],
      }),
    ],
  }),
  course({
    identifier: 'do_mock_statistics_essentials',
    name: 'Statistics Essentials',
    description: 'Core statistical concepts used throughout the path.',
    [SKILL_CODE]: ['Statistics'],
    units: [
      unit({
        identifier: 'do_mock_stats_u1',
        name: 'Unit 1 · Descriptive statistics',
        description: 'Mean, median, mode, and spread.',
        keywords: ['statistics'],
        topic: ['Descriptive stats'],
        children: [leaf('do_mock_stats_c1', 'Lecture video', 'video/mp4', ['Statistics'])],
      }),
    ],
  }),
  course({
    identifier: 'do_mock_pandas_deep_dive',
    name: 'Pandas Deep Dive',
    description: 'Working with tabular data using pandas.',
    framework: 'USF',
    [SKILL_CODE]: ['Data handling', 'Python basics'],
    units: [
      unit({
        identifier: 'do_mock_pandas_u1',
        name: 'Unit 1 · DataFrames',
        description: 'Loading, filtering, and transforming DataFrames.',
        keywords: ['pandas', 'dataframes'],
        topic: ['DataFrames'],
        children: [leaf('do_mock_pandas_c1', 'Hands-on notebook', 'application/pdf', ['Data handling'])],
      }),
    ],
  }),
  course({
    identifier: 'do_mock_5aug_course',
    name: '5Aug-Course',
    description: 'A general-purpose course — not question-set-only.',
    framework: 'USF',
    [SKILL_CODE]: ['General'],
    units: [
      unit({
        identifier: 'do_mock_5aug_u1',
        name: 'Unit 1',
        children: [leaf('do_mock_5aug_c1', 'Intro video', 'video/mp4', ['General'])],
      }),
    ],
  }),
  course({
    identifier: 'do_mock_healthcare',
    name: 'HealthCare',
    description: 'Foundations of healthcare data and terminology.',
    framework: 'USF',
    [SKILL_CODE]: ['Healthcare basics'],
    units: [
      unit({
        identifier: 'do_mock_healthcare_u1',
        name: 'Unit 1 · Terminology',
        children: [leaf('do_mock_healthcare_c1', 'Glossary', 'application/pdf', ['Healthcare basics'])],
      }),
    ],
  }),
  course({
    identifier: 'do_mock_reading_critically',
    name: 'Reading Data Critically',
    description: 'Spotting bias and misleading charts in data reporting.',
    framework: 'USF',
    [SKILL_CODE]: ['Critical thinking'],
    units: [
      unit({
        identifier: 'do_mock_reading_u1',
        name: 'Unit 1 · Spotting bias',
        children: [leaf('do_mock_reading_c1', 'Case studies', 'application/pdf', ['Critical thinking'])],
      }),
    ],
  }),
];

const courseById = new Map(MOCK_COURSES.map((c) => [c.identifier, c]));

function toSearchResultContent(c: MockCourse): Record<string, unknown> {
  return {
    identifier: c.identifier,
    name: c.name,
    mimeType: c.mimeType,
    contentType: c.contentType,
    primaryCategory: c.primaryCategory,
    channel: c.channel,
    organisation: c.organisation,
    status: c.status,
    framework: c.framework,
    [SKILL_CODE]: c[SKILL_CODE],
  };
}

function toCourseHierarchy(c: MockCourse): Record<string, unknown> {
  return {
    identifier: c.identifier,
    name: c.name,
    description: c.description,
    objectType: 'Content',
    mimeType: c.mimeType,
    contentType: c.contentType,
    primaryCategory: c.primaryCategory,
    channel: c.channel,
    status: c.status,
    framework: c.framework,
    children: c.units.map((u) => ({
      identifier: u.identifier,
      name: u.name,
      objectType: u.objectType,
      mimeType: u.mimeType,
      visibility: u.visibility,
      description: u.description,
      keywords: u.keywords,
      topic: u.topic,
      children: u.children,
    })),
  };
}

// The Learning Path OCD (learning_path_ocd.md §1) — verbatim create/update/
// unitMetadata/childMetadata forms plus sourcingSettings.collection, so the
// tree's Add Level / Add Course gating and the Basic Information /
// Level information forms render exactly as designed.
const LEARNING_PATH_OCD = {
  objectMetadata: {
    config: {
      frameworkMetadata: { orgFWType: ['K-12', 'TPD'], targetFWType: [] },
      sourcingSettings: {
        collection: {
          maxDepth: 1,
          objectType: 'Collection',
          primaryCategory: 'Learning Path',
          isRoot: true,
          iconClass: 'fa fa-road',
          children: {},
          hierarchy: {
            level1: {
              name: 'Level',
              type: 'Unit',
              mimeType: 'application/vnd.ekstep.content-collection',
              contentType: 'Level',
              primaryCategory: 'Level',
              iconClass: 'fa fa-layer-group',
              children: { Content: ['Course'] },
            },
          },
        },
      },
    },
    schema: {
      properties: {
        mimeType: { type: 'string', enum: ['application/vnd.ekstep.content-collection'] },
        policy: { type: 'string', enum: ['strict', 'adaptive', 'priorLearning'], default: 'strict' },
      },
    },
  },
  forms: {
    create: {
      templateName: '',
      required: [],
      properties: [
        {
          name: 'First Section',
          fields: [
            {
              code: 'name', dataType: 'text', description: 'Name of the learning path', editable: true,
              inputType: 'text', label: 'Title', name: 'Name', placeholder: 'Title',
              renderingHints: { class: 'sb-g-col-lg-1 required' }, required: true, visible: true,
              validations: [
                { type: 'maxLength', value: '120', message: 'Input is Exceeded' },
                { type: 'required', message: 'Title is required' },
              ],
            },
            {
              code: 'description', dataType: 'text', description: 'Description of the learning path', editable: true,
              inputType: 'textarea', label: 'Description', name: 'Description',
              placeholder: 'A path from starting skill to demonstrated outcome.',
              renderingHints: { class: 'sb-g-col-lg-1' }, required: false, visible: true,
              validations: [{ type: 'maxLength', value: '256', message: 'Input is Exceeded' }],
            },
            {
              code: 'keywords', dataType: 'list', description: 'Keywords for the learning path', editable: true,
              inputType: 'keywords', label: 'Keywords', name: 'Keywords', placeholder: 'Enter keywords',
              renderingHints: { class: 'sb-g-col-lg-1' }, required: false, visible: true,
            },
            {
              code: 'policy', dataType: 'text', description: 'How learners move through the levels of this path',
              editable: true, inputType: 'select', label: 'Consumption policy', name: 'Policy',
              placeholder: 'Select…', renderingHints: { class: 'sb-g-col-lg-1 required' }, required: true, visible: true,
              range: ['strict', 'adaptive', 'priorLearning'], default: 'strict',
              validations: [{ type: 'required', message: 'Consumption policy is required' }],
            },
          ],
        },
      ],
    },
    update: {
      templateName: '',
      required: [],
      properties: [
        {
          name: 'Basic information',
          fields: [
            {
              code: 'name', dataType: 'text', editable: true, inputType: 'text', label: 'Title', name: 'Name',
              placeholder: 'Title', renderingHints: { class: 'sb-g-col-lg-1 required' }, required: true, visible: true,
              validations: [
                { type: 'maxLength', value: '120', message: 'Input is Exceeded' },
                { type: 'required', message: 'Title is required' },
              ],
            },
            {
              code: 'description', dataType: 'text', editable: true, inputType: 'textarea', label: 'Description',
              name: 'Description', placeholder: 'A path from starting skill to demonstrated outcome.',
              renderingHints: { class: 'sb-g-col-lg-1' }, required: false, visible: true,
            },
            {
              code: 'appIcon', dataType: 'text', editable: true, inputType: 'appIcon', label: 'Icon', name: 'Icon',
              renderingHints: { class: 'sb-g-col-lg-1' }, required: false, visible: true,
            },
          ],
        },
        {
          // Matches learning_path_ocd.md's Curriculum section exactly
          // (framework + industry + domain, with depends/sourceCategory
          // wiring) so local dev testing exercises the same cascading
          // Curriculum → Industry → Domain fields the real OCD declares.
          name: 'Curriculum', description: 'Framework-aligned categorisation.',
          fields: [
            {
              code: 'framework', dataType: 'text', editable: true, inputType: 'framework', label: 'Curriculum',
              name: 'Framework', placeholder: 'Select…', renderingHints: { class: 'sb-g-col-lg-1 required' },
              required: true, visible: true, depends: ['industry', 'domain'],
            },
            {
              code: 'industry', dataType: 'list', editable: true, inputType: 'multiSelect', label: 'Industry',
              name: 'Industry', placeholder: 'Select industry', renderingHints: { class: 'sb-g-col-lg-1' },
              required: false, visible: true, sourceCategory: 'industry', depends: ['domain'],
            },
            {
              code: 'domain', dataType: 'list', editable: true, inputType: 'multiSelect', label: 'Domain',
              name: 'Domain', placeholder: 'Select domain', renderingHints: { class: 'sb-g-col-lg-1' },
              required: false, visible: true, sourceCategory: 'domain',
            },
          ],
        },
        {
          name: 'Consumption policy',
          fields: [
            {
              code: 'policy', dataType: 'text', editable: true, inputType: 'select', label: 'Consumption policy',
              name: 'Policy', placeholder: 'Select…', renderingHints: { class: 'sb-g-col-lg-1 required' },
              required: true, visible: true, range: ['strict', 'adaptive', 'priorLearning'], default: 'strict',
            },
          ],
        },
        {
          name: 'Audience and licensing',
          fields: [
            {
              code: 'audience', dataType: 'list', editable: true, inputType: 'nestedselect', label: 'Audience',
              name: 'Audience', placeholder: 'Select audience', renderingHints: { class: 'sb-g-col-lg-1' },
              required: false, visible: true, range: ['Student', 'Teacher', 'Administrator', 'Parent', 'Other'],
            },
            {
              code: 'author', dataType: 'text', editable: true, inputType: 'text', label: 'Author', name: 'Author',
              renderingHints: { class: 'sb-g-col-lg-1' }, required: false, visible: true,
            },
            {
              code: 'license', dataType: 'text', editable: true, inputType: 'select', label: 'License', name: 'License',
              renderingHints: { class: 'sb-g-col-lg-1' }, required: false, visible: true,
            },
          ],
        },
      ],
    },
    unitMetadata: {
      templateName: '',
      required: [],
      properties: [
        {
          name: 'Level information', description: 'Title and description shown to learners for this level.',
          fields: [
            {
              code: 'name', dataType: 'text', editable: true, inputType: 'text', label: 'Title', name: 'Name',
              placeholder: 'Level title', renderingHints: { class: 'sb-g-col-lg-1 required' }, required: true, visible: true,
              validations: [
                { type: 'maxLength', value: '120', message: 'Input is Exceeded' },
                { type: 'required', message: 'Title is required' },
              ],
            },
            {
              code: 'description', dataType: 'text', editable: true, inputType: 'textarea', label: 'Description',
              name: 'Description', placeholder: 'What learners build in this level',
              renderingHints: { class: 'sb-g-col-lg-1' }, required: false, visible: true,
            },
            // No 'competencies'/Skills field here — deliberately, see
            // learning_path_ocd.md §3 item 4 (reserved-field collision; the
            // editor's own SkillPicker writes the resolved skill-category
            // code directly, which a static form field can't represent).
          ],
        },
      ],
    },
    childMetadata: {
      templateName: '',
      required: [],
      properties: [
        {
          name: 'First Section',
          fields: [
            {
              code: 'name', dataType: 'text', editable: false, inputType: 'text', label: 'Title', name: 'Name',
              renderingHints: { class: 'sb-g-col-lg-1' }, required: true, visible: true,
            },
          ],
        },
      ],
    },
    publishchecklist: {
      templateName: '',
      required: [],
      properties: [
        {
          name: 'Publish checklist',
          fields: [
            {
              code: 'checklist', dataType: 'list', inputType: 'checkbox', label: 'Learning path review checklist',
              name: 'Checklist', visible: true,
              range: [
                'Prior assessment is a question-set-only course (when policy requires it)',
                'Outcome assessment is a question-set-only course',
                'Every level has at least one course and at least one skill',
                'Level skills are within the prior assessment\'s skill scope',
                'All linked courses carry skill tags',
                'No duplicate courses across the path',
                'Consumption policy is appropriate for the audience',
              ],
            },
          ],
        },
      ],
    },
  },
};

function makeFramework(identifier: string, name: string, skillTerms: string[]) {
  return {
    identifier,
    name,
    code: identifier,
    categories: [
      {
        identifier: `${identifier}_board`, name: 'Board', code: 'board', index: 1,
        terms: [{ identifier: `${identifier}_cbse`, name: 'CBSE', code: 'cbse', category: 'board' }],
      },
      {
        identifier: `${identifier}_medium`, name: 'Medium', code: 'medium', index: 2,
        terms: [{ identifier: `${identifier}_english`, name: 'English', code: 'english', category: 'medium' }],
      },
      // Descriptive-tagging categories for the Curriculum section's
      // Industry → Domain cascade (learning_path_ocd.md's depends/
      // sourceCategory wiring) — never the skill-equivalent category.
      {
        identifier: `${identifier}_industry`, name: 'Industry', code: 'industry', index: 3,
        terms: [{ identifier: `${identifier}_edtech`, name: 'EdTech', code: 'edtech', category: 'industry' }],
      },
      {
        identifier: `${identifier}_domain`, name: 'Domain', code: 'domain', index: 4,
        terms: [{ identifier: `${identifier}_k12`, name: 'K-12', code: 'k12', category: 'domain' }],
      },
      // NOTE: both mock frameworks hardcode the SAME skill-category code
      // (SKILL_CODE) for simplicity — a real deployment resolves a
      // DIFFERENT code per framework (see useSkillCategory.ts), but
      // exercising that here would require every MOCK_COURSES fixture's
      // skill tag to also vary per framework. Deliberately out of scope
      // for this dev-only mock; don't take this file as a template for
      // "the code is always 'skill'."
      {
        identifier: `${identifier}_skill`, name: 'Skill', code: SKILL_CODE, index: 5,
        terms: skillTerms.map((name, i) => ({
          identifier: `${identifier}_skill_${i}`, name, code: name.toLowerCase().replace(/\s+/g, '-'), category: SKILL_CODE,
        })),
      },
    ],
  };
}

// Two distinct frameworks so switching the LP root's Curriculum is actually
// observable: each has its own skill catalog, and half the mock courses
// belong to each (see MOCK_COURSES' `framework` field) — matching this
// content set to the wrong framework is exactly the "unrelated course"
// scenario pruneCoursesByFramework/the Library's framework filter cover.
const MOCK_FRAMEWORKS: Record<string, ReturnType<typeof makeFramework>> = {
  NCF: makeFramework('NCF', 'National Curriculum Framework', [
    'Python basics', 'Data handling', 'Statistics', 'Data literacy', 'Applied skills',
  ]),
  USF: makeFramework('USF', 'Universal Skills Framework', [
    'General', 'Healthcare basics', 'Critical thinking', 'Data handling', 'Python basics',
  ]),
};

const CHANNEL_FRAMEWORKS = [
  { identifier: 'NCF', name: 'National Curriculum Framework', type: 'K-12' },
  { identifier: 'USF', name: 'Universal Skills Framework', type: 'TPD' },
];

let tempIdCounter = 0;

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handleRootHierarchy(config: InternalAxiosRequestConfig, contentId: string): AxiosResponse {
  return ok(config, {
    result: {
      content: {
        identifier: contentId,
        name: 'Mock Learning Path',
        description: '',
        objectType: 'Collection',
        mimeType: 'application/vnd.ekstep.content-collection',
        contentType: 'Course',
        primaryCategory: 'Learning Path',
        status: 'Draft',
        channel: CHANNEL,
        children: [],
      },
    },
  });
}

function handleChannel(config: InternalAxiosRequestConfig, channelId: string): AxiosResponse {
  return ok(config, {
    result: {
      channel: {
        identifier: channelId,
        name: 'Mock Org',
        defaultFramework: 'NCF',
        frameworks: CHANNEL_FRAMEWORKS,
      },
    },
  });
}

function handleCategoryDefinition(config: InternalAxiosRequestConfig): AxiosResponse {
  return ok(config, { result: { objectCategoryDefinition: LEARNING_PATH_OCD } });
}

function handleFrameworkRead(config: InternalAxiosRequestConfig, frameworkId: string): AxiosResponse {
  const framework = MOCK_FRAMEWORKS[frameworkId] ?? MOCK_FRAMEWORKS.NCF;
  return ok(config, { result: { framework } });
}

function handleCompositeSearch(config: InternalAxiosRequestConfig): AxiosResponse {
  const body = parseBody(config);
  const request = (body.request ?? {}) as Record<string, unknown>;
  const filters = (request.filters ?? {}) as Record<string, unknown>;
  const query = String(request.query ?? '').toLowerCase();
  const limit = Number(request.limit ?? 20);
  const offset = Number(request.offset ?? 0);
  const skillFilter = filters[SKILL_CODE] as string[] | undefined;
  const frameworkFilter = filters['framework'] as string[] | undefined;

  let matches = MOCK_COURSES;
  if (query) matches = matches.filter((c) => c.name.toLowerCase().includes(query));
  if (frameworkFilter?.length) {
    matches = matches.filter((c) => frameworkFilter.includes(c.framework));
  }
  if (skillFilter?.length) {
    matches = matches.filter((c) => c[SKILL_CODE].some((s) => skillFilter.includes(s)));
  }

  const page = matches.slice(offset, offset + limit).map(toSearchResultContent);
  return ok(config, { result: { Course: page, count: matches.length } });
}

function handleCourseHierarchy(config: InternalAxiosRequestConfig, courseId: string): AxiosResponse {
  const c = courseById.get(courseId);
  if (!c) {
    return ok(config, {
      result: {},
      params: { status: 'failed', errmsg: `Mock course "${courseId}" not found` },
    });
  }
  return ok(config, { result: { content: toCourseHierarchy(c) } });
}

function handleHierarchyUpdate(config: InternalAxiosRequestConfig): AxiosResponse {
  const body = parseBody(config);
  const data = ((body.request as Record<string, unknown>)?.data ?? {}) as Record<string, unknown>;
  const nodesModified = (data.nodesModified ?? {}) as Record<string, unknown>;
  const identifiers: Record<string, string> = {};
  for (const id of Object.keys(nodesModified)) {
    if (id.startsWith('temp-')) {
      identifiers[id] = `do_mock_saved_${++tempIdCounter}`;
    }
  }
  return ok(config, { result: { identifiers } });
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

async function mockAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const url = config.url ?? '';
  const method = (config.method ?? 'get').toLowerCase();
  await new Promise((r) => setTimeout(r, LATENCY_MS));

  let m: RegExpMatchArray | null;

  if (method === 'get' && (m = url.match(/\/action\/content\/v3\/hierarchy\/([^/?]+)/))) {
    return handleRootHierarchy(config, m[1]);
  }
  if (method === 'get' && (m = url.match(/\/api\/channel\/v1\/read\/([^/?]+)/))) {
    return handleChannel(config, m[1]);
  }
  if (method === 'post' && /\/action\/object\/category\/definition\/[^/]+\/read/.test(url)) {
    return handleCategoryDefinition(config);
  }
  if (method === 'get' && (m = url.match(/\/api\/framework\/v1\/read\/([^/?]+)/))) {
    return handleFrameworkRead(config, m[1]);
  }
  if (method === 'post' && /\/action\/composite\/v3\/search/.test(url)) {
    return handleCompositeSearch(config);
  }
  if (method === 'get' && (m = url.match(/\/action\/course\/v1\/hierarchy\/([^/?]+)/))) {
    return handleCourseHierarchy(config, m[1]);
  }
  if (method === 'patch' && /\/action\/content\/v3\/hierarchy\/update/.test(url)) {
    return handleHierarchyUpdate(config);
  }

  // Everything else (collaborators, dialcode, CSV/asset upload, publish, …)
  // is out of scope for this offline LP mock — fail the same way a down
  // server would, rather than fake success for flows this doesn't model.
  console.warn(`[mock-api] no mock for ${method.toUpperCase()} ${url} — rejecting`);
  return Promise.reject(new Error(`[mock-api] no mock registered for ${method.toUpperCase()} ${url}`));
}

export function installMockApi(): void {
  apiClient.defaults.adapter = mockAdapter;
  // eslint-disable-next-line no-console
  console.info('[mock-api] installed — apiClient requests are served from in-memory fixtures.');
}
