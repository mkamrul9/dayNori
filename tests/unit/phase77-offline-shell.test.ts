import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 77 public offline shell and SW policy', () => {
  const sw = fs.readFileSync(path.join(repoRoot, 'apps/web/public/sw.js'), 'utf8');
  const shellJs = fs.readFileSync(path.join(repoRoot, 'apps/web/public/offline-shell.js'), 'utf8');
  const shellHtml = fs.readFileSync(
    path.join(repoRoot, 'apps/web/public/offline-shell.html'),
    'utf8'
  );
  const adr = fs.readFileSync(
    path.join(repoRoot, 'docs/decisions/0077-trusted-device-offline-boot-and-session.md'),
    'utf8'
  );

  it('documents trusted-device boot boundaries in ADR 0077', () => {
    expect(adr).toContain('Public executable shell');
    expect(adr).toContain('localStorage');
    expect(adr).toContain('supersedes');
    expect(adr).toContain('0066');
    expect(adr).toContain('revalidate');
  });

  it('keeps shell public with no embedded account identifiers', () => {
    expect(shellHtml).not.toMatch(/usr_|ws_[0-9a-f-]{8}/i);
    expect(shellJs).toContain('hasTrustedConsent');
    expect(shellJs).toContain('offline_boot');
    expect(shellJs).toContain('showFallback');
    expect(shellJs).not.toContain('localStorage.setItem');
  });

  it('prefers offline-shell then offline.html for navigate fallback', () => {
    expect(sw).toContain("caches.match('/offline-shell.html')");
    expect(sw).toContain("caches.match('/offline.html')");
    expect(sw).toContain('REQUIRED_SHELL_ASSETS');
    expect(sw).toContain('response.redirected');
  });

  it('excludes private routes and capability query params from Cache Storage allowlist', () => {
    expect(sw).toContain("path.startsWith('/v1/')");
    expect(sw).toContain("path.startsWith('/api/')");
    expect(sw).toContain("path.startsWith('/auth/')");
    expect(sw).toContain("parsed.searchParams.has('token')");
    expect(sw).toContain("parsed.searchParams.has('_rsc')");
  });
});
