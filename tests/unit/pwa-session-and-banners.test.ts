import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  hasUnsavedWork,
  setUnsavedWork,
  subscribeUnsavedWork,
} from '../../apps/web/src/editing/unsavedWork.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('PWA unsaved-work guard and banner stacking', () => {
  beforeEach(() => {
    setUnsavedWork(false);
  });

  afterEach(() => {
    setUnsavedWork(false);
  });

  it('exposes unsaved-work helpers that are no-ops without a document', () => {
    // Vitest default environment is node — helpers must not throw.
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

  it('keeps Install and Update in one stacked status component', () => {
    const banners = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/components/AppStatusBanners.tsx'),
      'utf8'
    );
    expect(banners).toContain('daynori-status-banners');
    expect(banners).toContain('hasUnsavedWork');
    expect(banners).toContain('SKIP_WAITING');
    expect(banners).toMatch(/showInstall.*!showUpdate|!showUpdate[\s\S]*showInstall/);
    const layout = fs.readFileSync(path.join(repoRoot, 'apps/web/src/app/layout.tsx'), 'utf8');
    expect(layout).not.toContain('ServiceWorkerRegistration');
    const shell = fs.readFileSync(path.join(repoRoot, 'apps/web/src/components/AppShell.tsx'), 'utf8');
    expect(shell).toContain('AppStatusBanners');
    expect(shell).not.toContain('PwaInstallBanner');
  });

  it('ships improved offline shell without caching private APIs', () => {
    const offline = fs.readFileSync(path.join(repoRoot, 'apps/web/public/offline.html'), 'utf8');
    expect(offline.toLowerCase()).toContain('offline');
    expect(offline).toContain('safe-area-inset-bottom');
    expect(offline).toContain('/today');
    const sw = fs.readFileSync(path.join(repoRoot, 'apps/web/public/sw.js'), 'utf8');
    expect(sw).toMatch(/daynori-static-v6/);
    expect(sw).toContain("path.startsWith('/api/')");
    expect(sw).toContain('/offline.html');
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
  });
});

describe('Session refresh single-flight module', () => {
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
    expect(refreshRoute).toContain('refreshSingleFlight');
    // AuthContext must not wipe session on generic network failure
    const auth = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/components/AuthContext.tsx'),
      'utf8'
    );
    expect(auth).toContain('session check deferred');
    expect(auth).toContain('401 || res.status === 403');
  });
});
