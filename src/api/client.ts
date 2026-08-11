import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';

let baseUrl = '';

export function setApiBaseUrl(url: string): void {
  baseUrl = url;
}

export const apiClient = axios.create({
  timeout: 30000,
});

/**
 * Every src/api/*.ts call hardcodes one of three prefixes (/action, /api,
 * /portal) matching this editor's own dev-proxy assumptions about which
 * backend service owns a route. A host portal's own gateway may collapse all
 * three under one prefix of its own — rather than guess at that mapping, the
 * portal tells us via config.config.apiSlug, and every request gets its
 * leading /action|/api|/portal segment swapped for it. No apiSlug (the
 * default) leaves every hardcoded prefix exactly as each api file wrote it.
 */
export function resolveApiUrl(url: string | undefined, apiSlug: unknown): string | undefined {
  if (!url || typeof apiSlug !== 'string' || !apiSlug.trim()) return url;
  const trimmed = apiSlug.trim().replace(/\/+$/, '');
  const slug = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return url.replace(/^\/(action|api|portal)(?=\/|$)/, slug);
}

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  // Lazy import to avoid circular dependency
  const { useEditorStore } = await import('../store/editor.store');
  const state = useEditorStore.getState();
  const ctx = state.editorConfig?.context;

  config.headers = config.headers ?? {};

  if (ctx?.authToken) {
    config.headers['Authorization'] = `Bearer ${ctx.authToken}`;
  }

  // Portal proxy routes (/api/*) require the user session token in addition
  // to the Bearer auth token. The dialcode validate and link APIs use /api/*.
  if (ctx?.userToken) {
    config.headers['X-Authenticated-User-Token'] = ctx.userToken;
  }

  // Sunbird user/content APIs scope results to the tenant via X-Channel-Id.
  // Omitting it causes user-search to return cross-tenant results or nothing.
  if (ctx?.channel) {
    config.headers['X-Channel-Id'] = ctx.channel;
  }

  config.url = resolveApiUrl(config.url, state.editorConfig?.config?.apiSlug);

  if (baseUrl) {
    config.baseURL = baseUrl;
  }

  return config;
});

export default apiClient;
