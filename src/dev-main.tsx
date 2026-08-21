import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CollectionEditor } from './components/CollectionEditor';
import { installMockApi } from './dev-mock-api';
import type { EditorMode, IEditorConfig } from './types/editor';

// ?mock=1 — serve every apiClient request from in-memory fixtures instead of
// the real backend (see dev-mock-api.ts). Useful when the backend is down.
// if (new URLSearchParams(window.location.search).get('mock') === '1') {
//   installMockApi();
// }

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const MOCK_CONFIG: IEditorConfig = {
  context: {
    authToken: 'eyJhbGciOiJSUzI1NiIsImtpZCI6InBvcnRhbF9sb2dnZWRpbl9rZXkyIn0.eyJpc3MiOiJoYzJ3cnRmd2JOZXN0RENIQTdUaDJPbF9YRHFsSDVGMyIsImlhdCI6MTc4NTc2MzI0N30.MEO0XqJ3KZzDXMlUcOMlAkyZ5ljU8fdGJ8XtzM44CV8lxZJ3M32cyBLJapnBIxdY1iypgAK3EY9zD-mNm62XLaxQWvW6uEscWURYotZi8f7NmhBpFkaxvK6DFTg_UYNe8hbt3Zay0ivYUJgy3Zi2BT2_DleRrS822-Yni6rUEnzq4A5MefXtiyiW_2m66VEO8dgLsNAfmtmn7pggWqEI0bzEiKbph42eNpIN_Ao5mdor5abTjtNpu92lxREMH0Z3vshlIfQmROWSfLMgEa1zjIVBXyl3BPWwpZZuMtQ_taxbXsrE8o9Bw-VVC4ugwXm3B65wfdeZ0bsYZ0tHCVnu6g',
    userId: '8145b0f2-5042-4e5c-9fb6-a00b2abbae83',
    uid: '8145b0f2-5042-4e5c-9fb6-a00b2abbae83',
    sid: 'iYO2K6dOSdA0rwq7NeT1TDzS-dbqduvV',
    did: '7e85b4967aebd6704ba1f604f20056b6',
    channel: '0146092176054435840',
    pdata: { id: 'test.sunbird.portal', ver: '2.8.0', pid: 'creation-portal' },
    env: 'collection_editor',
    identifier: 'do_21464106500683366415',
    contentId: 'do_21464106500683366415',
    framework: 'NCF',
    targetFWIds: ['NCF'],
  },
  config: {
    mode: 'edit',
    maxDepth: 4,
    objectType: 'Collection',
    primaryCategory: 'Course',
    framework: ['NCF'],
    targetFWIds: ['NCF'],
    categoryDefinitionApiVersion: 'v4',
    // test.sunbirded.org 404s on /action/channel/v1/read and
    // /action/course/v1/hierarchy (confirmed via captured network requests)
    // — /portal is what actually resolves there. Matches spark-portal's own
    // integration (config.config.apiSlug), which is why apiSlug lives on
    // IConfig, not metadata.
    // apiSlug: '/portal',
  },
  enableSplitBuilder: true,
};

// Learning Path sample config — same shape as MOCK_CONFIG, just a different
// primaryCategory/objectType/contentId. Load with ?profile=lp.
const LP_MOCK_CONFIG: IEditorConfig = {
  ...MOCK_CONFIG,
  context: {
    ...MOCK_CONFIG.context,
    identifier: 'do_21464106500683366415',
    contentId: 'do_21464106500683366415',
  },
  config: {
    ...MOCK_CONFIG.config,
    maxDepth: undefined,
    primaryCategory: 'Learning Path',
  },
};

// Evaluation Course sample config — a normal Course whose Library is
// restricted to Practice Question Set / Course Assessment content only (see
// evaluationCourseProfile in types/profile.ts). Load with ?profile=eval.
const EVALUATION_COURSE_MOCK_CONFIG: IEditorConfig = {
  ...MOCK_CONFIG,
  config: {
    ...MOCK_CONFIG.config,
    primaryCategory: 'Evaluation Course',
  },
};

const profileParam = new URLSearchParams(window.location.search).get('profile');
const useLpProfile = profileParam === 'lp';
const useEvaluationCourseProfile = profileParam === 'eval';

// ?mode=review|read|sourcingreview — override editorMode for testing
// reviewer/read-only flows locally (Publish/Reject buttons, PublishChecklist,
// ConfirmReviewModal) without a real portal-driven reviewer session. Falls
// back to 'edit' for anything unset/unrecognized.
const EDITOR_MODES: EditorMode[] = ['edit', 'review', 'read', 'sourcingreview'];
const modeParam = new URLSearchParams(window.location.search).get('mode');
const editorMode: EditorMode = EDITOR_MODES.includes(modeParam as EditorMode)
  ? (modeParam as EditorMode)
  : 'edit';

const selectedConfig = useLpProfile
  ? LP_MOCK_CONFIG
  : useEvaluationCourseProfile
    ? EVALUATION_COURSE_MOCK_CONFIG
    : MOCK_CONFIG;
const activeConfig: IEditorConfig = {
  ...selectedConfig,
  config: { ...selectedConfig.config, mode: editorMode },
};

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <CollectionEditor
        {...activeConfig}
        onToolbarEvent={console.log}
      />
    </QueryClientProvider>
  </React.StrictMode>,
);
