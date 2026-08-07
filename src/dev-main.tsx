import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { CollectionEditor } from './components/CollectionEditor';
import type { IEditorConfig } from './types/editor';

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
    authToken: '',
    userId: 'cdee2eb6-d1d6-43bd-b18d-959213006510',
    uid: 'cdee2eb6-d1d6-43bd-b18d-959213006510',
    sid: 'iYO2K6dOSdA0rwq7NeT1TDzS-dbqduvV',
    did: '7e85b4967aebd6704ba1f604f20056b6',
    channel: '0145017576228454407',
    pdata: { id: 'test.sunbird.portal', ver: '2.8.0', pid: 'creation-portal' },
    env: 'collection_editor',
    identifier: 'do_2145942355538657281390',
    contentId: 'do_2145942355538657281390',
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
  },
  enableSplitBuilder: true,
};

// Learning Path sample config — same shape as MOCK_CONFIG, just a different
// primaryCategory/objectType/contentId. Load with ?profile=lp.
const LP_MOCK_CONFIG: IEditorConfig = {
  ...MOCK_CONFIG,
  context: {
    ...MOCK_CONFIG.context,
    identifier: 'do_2145942355538657281391',
    contentId: 'do_2145942355538657281391',
  },
  config: {
    ...MOCK_CONFIG.config,
    maxDepth: undefined,
    primaryCategory: 'Learning Path',
  },
};

const useLpProfile = new URLSearchParams(window.location.search).get('profile') === 'lp';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <CollectionEditor
        {...(useLpProfile ? LP_MOCK_CONFIG : MOCK_CONFIG)}
        onToolbarEvent={console.log}
      />
      <Toaster position="top-right" />
    </QueryClientProvider>
  </React.StrictMode>,
);
