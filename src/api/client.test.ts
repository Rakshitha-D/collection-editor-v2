import { describe, it, expect } from 'vitest';
import { resolveApiUrl } from './client';

describe('resolveApiUrl', () => {
  it('leaves the url untouched when no apiSlug is configured', () => {
    expect(resolveApiUrl('/action/channel/v1/read/ch1', undefined)).toBe('/action/channel/v1/read/ch1');
  });

  it('replaces a leading /action segment with the configured apiSlug', () => {
    expect(resolveApiUrl('/action/channel/v1/read/ch1', '/my-portal')).toBe('/my-portal/channel/v1/read/ch1');
  });

  it('replaces a leading /api segment', () => {
    expect(resolveApiUrl('/api/dialcode/v1/read', '/my-portal')).toBe('/my-portal/dialcode/v1/read');
  });

  it('replaces a leading /portal segment', () => {
    expect(resolveApiUrl('/portal/user/v5/read/u1', '/my-action')).toBe('/my-action/user/v5/read/u1');
  });

  it('normalizes an apiSlug missing its leading slash', () => {
    expect(resolveApiUrl('/action/user/v1/search', 'my-portal')).toBe('/my-portal/user/v1/search');
  });

  it('strips a trailing slash from apiSlug before substituting', () => {
    expect(resolveApiUrl('/action/user/v1/search', '/my-portal/')).toBe('/my-portal/user/v1/search');
  });

  it('leaves a url with none of the known prefixes untouched', () => {
    expect(resolveApiUrl('/preview.html', '/my-portal')).toBe('/preview.html');
  });

  it('is a no-op for a blank/whitespace-only apiSlug', () => {
    expect(resolveApiUrl('/action/user/v1/search', '   ')).toBe('/action/user/v1/search');
  });

  it('ignores a non-string apiSlug value defensively', () => {
    expect(resolveApiUrl('/action/user/v1/search', 42)).toBe('/action/user/v1/search');
  });

  it('passes through an undefined url unchanged', () => {
    expect(resolveApiUrl(undefined, '/my-portal')).toBeUndefined();
  });
});
