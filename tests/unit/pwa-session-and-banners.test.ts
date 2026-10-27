import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  hasUnsavedWork,
  setUnsavedWork,
  subscribeUnsavedWork,
} from '../../apps/web/src/editing/unsavedWork.js';
import {
  RefreshAuthError,
  isInvalidRefreshError,
  isUnavailableRefreshError,
} from '../../apps/web/src/auth/refreshErrors.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('PWA unsaved-work guard and banner stacking', () => {
  beforeEach(() => {
    setUnsavedWork(false);
  });

  afterEach(() => {
    setUnsavedWork(false);
  });

  it('exposes unsaved-work helpers that are no-ops without a document', () => {
    expect(() => setUnsavedWork(true)).not.toThrow();
    expect(hasUnsavedWork()).toBe(false);
    expect(() => setUnsavedWork(false)).not.toThrow();
    const unsub = subscribeUnsavedWork(() => undefined);
    expect(typeof unsub).toBe('function');
    unsub();
    const src = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/editing/unsavedWork.ts'),
      'utf8'
    );
    expect(src).toContain('data-daynori-unsaved');
    expect(src).toContain('daynori:unsaved-change');
  });

  it('wires unsaved-work to Journal editor as well as Library notes', () => {
    const journal = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/app/journal/page.tsx'),
      'utf8'
    );
    expect(journal).toContain('setUnsavedWork(true)');
    expect(journal).toContain('setUnsavedWork(false)');
    const library = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/app/library/page.tsx'),
      'utf8'
    );
    expect(library).toContain('setUnsavedWork(true)');
  });

  it('keeps Install and Update in one stacked status component', () => {
    const banners = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/components/AppStatusBanners.tsx'),
      'utf8'
    );
    expect(banners).toContain('daynori-status-banners');
    expect(banners).toContain('hasUnsavedWork');
    expect(banners).toContain('SKIP_WAITING');
    expect(banners).toContain('PRECACHE_PUBLIC_STATIC');
    expect(banners).toMatch(/showInstall.*!showUpdate|!showUpdate[\s\S]*showInstall/);
    const layout = fs.readFileSync(path.join(repoRoot, 'apps/web/src/app/layout.tsx'), 'utf8');
    expect(layout).not.toContain('ServiceWorkerRegistration');
    const shell = fs.readFileSync(path.join(repoRoot, 'apps/web/src/components/AppShell.tsx'), 'utf8');
    expect(shell).toContain('AppStatusBanners');
    expect(shell).toContain('FirstLoginOnboardingGate');
    expect(shell).not.toContain('PwaInstallBanner');
    expect(
      fs.existsSync(path.join(repoRoot, 'apps/web/src/components/ServiceWorkerRegistration.tsx'))
    ).toBe(false);
    expect(fs.existsSync(path.join(repoRoot, 'apps/web/src/components/PwaInstallBanner.tsx'))).toBe(
      false
    );
    const css = fs.readFileSync(path.join(repoRoot, 'apps/web/src/app/globals.css'), 'utf8');
    expect(css).toContain('.daynori-status-banners');
    expect(css).not.toContain('.daynori-sw-update');
  });

  it('ships improved offline shell without caching private APIs', () => {
    const offline = fs.readFileSync(path.join(repoRoot, 'apps/web/public/offline.html'), 'utf8');
    expect(offline.toLowerCase()).toContain('offline');
    expect(offline).toContain('safe-area-inset-bottom');
    expect(offline).toContain('/today');
    const shellHtml = fs.readFileSync(
      path.join(repoRoot, 'apps/web/public/offline-shell.html'),
      'utf8'
    );
    const shellJs = fs.readFileSync(
      path.join(repoRoot, 'apps/web/public/offline-shell.js'),
      'utf8'
    );
    expect(shellHtml).toContain('offline-shell.js');
    expect(shellHtml).toContain('Saved on this device');
    expect(shellJs).toContain('daynori_trusted_device_consent');
    expect(shellJs).toContain('offline_boot');
    expect(shellJs).not.toContain('/api/');
    const sw = fs.readFileSync(path.join(repoRoot, 'apps/web/public/sw.js'), 'utf8');
    expect(sw).toMatch(/daynori-static-v8/);
    expect(sw).toContain("path.startsWith('/api/')");
    expect(sw).toContain('/offline.html');
    expect(sw).toContain('/offline-shell.html');
    expect(sw).toContain('navigationOfflineFallback');
    expect(sw).toContain('PRECACHE_PUBLIC_STATIC');
    expect(sw).toContain('REQUIRED_SHELL_ASSETS');
    // Never instruct caching of private HTML navigations into Cache Storage.
    expect(sw).not.toMatch(/cache\.put\([^)]*navigate/);
  });

  it('Library default chrome hides secondary tools until More tools', () => {
    const library = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/app/library/page.tsx'),
      'utf8'
    );
    expect(library).toContain('libraryToolsOpen');
    expect(library).toContain('More tools');
    expect(library).toContain('Write note');
    expect(library).toContain('Clear filters');
    expect(library).not.toMatch(/Load Demo Journeys/);
    expect(library).toContain('Write a note or create a folder');
    expect(library).not.toContain('Canonical folder hierarchy');
  });

  it('capture script fails on horizontal overflow, not merely file size', () => {
    const script = fs.readFileSync(
      path.join(repoRoot, 'scripts/capture-pwa-usability-shots.mjs'),
      'utf8'
    );
    expect(script).toContain('horizontalOverflow');
    expect(script).toContain('OVERFLOW_TOLERANCE_PX');
    expect(script).toContain('layoutFailCount');
    expect(script).toMatch(/File size alone is NOT acceptance|PNG existence is insufficient/);
  });
});

describe('Session refresh failure classification', () => {
  it('treats invalid refresh as clearable and outages as keep-cookies', () => {
    expect(isInvalidRefreshError(new RefreshAuthError('invalid_refresh', 'bad'))).toBe(true);
    expect(isUnavailableRefreshError(new RefreshAuthError('unavailable', 'down'))).toBe(true);
    expect(isInvalidRefreshError(new Error('Invalid or expired refresh token'))).toBe(true);
    expect(isUnavailableRefreshError(new Error('fetch failed'))).toBe(true);
  });

  it('exports a shared refresh helper used by session and refresh routes', async () => {
    const mod = await import('../../apps/web/src/auth/refreshSingleFlight.js');
    expect(typeof mod.refreshSingleFlight).toBe('function');
    const sessionRoute = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/app/api/auth/session/route.ts'),
      'utf8'
    );
    const refreshRoute = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/app/api/auth/refresh/route.ts'),
      'utf8'
    );
    expect(sessionRoute).toContain('refreshSingleFlight');
    expect(sessionRoute).toContain('SESSION_TEMPORARILY_UNAVAILABLE');
    expect(sessionRoute).toContain('isInvalidRefreshError');
    expect(refreshRoute).toContain('refreshSingleFlight');
    expect(refreshRoute).toContain('AUTH_SERVICE_UNAVAILABLE');
    expect(refreshRoute).toContain('isInvalidRefreshError');
    // 503 path must not clear cookies (only the invalid_refresh branch may).
    const unavailableBlock = refreshRoute.slice(refreshRoute.indexOf('AUTH_SERVICE_UNAVAILABLE'));
    expect(unavailableBlock).not.toContain('clearSessionCookies');
    // AuthContext must not wipe session on generic network failure
    const auth = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/components/AuthContext.tsx'),
      'utf8'
    );
    expect(auth).toContain('session check deferred');
    expect(auth).toContain('401 || res.status === 403');
  });
});
