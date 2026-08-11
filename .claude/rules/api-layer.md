---
paths:
  - "src/api/**"
---

# API layer

One file per Sunbird API resource in `src/api/` (`asset.ts`, `bulkUpload.ts`, `categoryDefinition.ts`, `channel.ts`, `content.ts`, `dialcode.ts`, `framework.ts`, `hierarchy.ts`, `question.ts`, `user.ts`), all routed through the shared `apiClient` axios instance in `src/api/client.ts`.

## Standard

- **Don't create a second axios instance or call `axios` directly** — import `apiClient` (or the resource-specific functions) so every request goes through the shared interceptor.
- The request interceptor in `client.ts` lazily imports `useEditorStore` (`await import('../store/editor.store')`) specifically **to avoid a circular dependency** between the API layer and the store — don't turn this back into a static top-level import.
- The interceptor injects, from `editorConfig.context`: `Authorization: Bearer <authToken>`, `X-Authenticated-User-Token` (required for portal proxy routes under `/api/*`, e.g. dialcode validate/link), and `X-Channel-Id` (required for tenant scoping — omitting it can return cross-tenant or empty results on user-search). If you add a new endpoint that needs one of these headers, it already gets them for free through `apiClient`; don't re-add them manually.
- `baseUrl` is module-level mutable state set via `setApiBaseUrl()` (exported publicly from `src/index.ts`) — the editor is embedded into different host environments that each point at a different API base, so this can't be a build-time constant.
- Every call in `src/api/*.ts` hardcodes one of three prefixes (`/action`, `/api`, `/portal`) matching this editor's own assumption about which backend service owns that route. A host portal may proxy all three under one prefix of its own; when it does, it sets `config.config.apiSlug` and the interceptor's `resolveApiUrl()` swaps every request's leading `/action|/api|/portal` segment for it before it goes out. Don't hardcode a host-specific prefix in a new endpoint — write it with whichever of the three matches this editor's own default assumption, and `apiSlug` overrides it uniformly when the host needs to.
- New resource files should follow the existing shape: typed request/response functions calling `apiClient`, no business logic (that belongs in a hook — see `useSaveHierarchy.ts` for how a hook composes multiple API calls with the hierarchy/nodesModified payload logic).
