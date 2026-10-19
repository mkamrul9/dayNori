/**
 * Phase 48 — synthetic Drive scope matrix (no live Google account required).
 */
import { describe, it, expect } from 'vitest';
import {
  DRIVE_FILE_SCOPE,
  EXPERIMENT_CASES,
  RESTRICTED_DRIVE_SCOPES,
} from './src/scopes.js';
import { expectedMatrixForCase } from './src/mockDriveModel.js';
import { assertNarrowScope, loadDriveSpikeConfig } from './src/config.js';

describe('Phase 48 Drive scope spike (synthetic / documentation matrix)', () => {
  it('requests only the narrow drive.file scope by default', () => {
    expect(DRIVE_FILE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
    assertNarrowScope(DRIVE_FILE_SCOPE);
    for (const s of RESTRICTED_DRIVE_SCOPES) {
      expect(() => assertNarrowScope(s)).toThrow(/refuses/i);
    }
  });

  it('covers the required experiment inventory ids', () => {
    const ids = new Set(EXPERIMENT_CASES.map((c) => c.id));
    for (const required of [
      'app-created-file',
      'picker-selected-file',
      'never-selected-file',
      'picker-selected-folder',
      'existing-children-of-selected-folder',
      'external-child-after-folder-selection',
      'app-created-child-in-authorized-location',
      'independently-selected-child',
      'file-move',
      'trash-restore',
      'permission-loss',
      'grant-revocation',
      'reauth-incremental',
    ]) {
      expect(ids.has(required)).toBe(true);
    }
  });

  it('does not assume folder selection authorizes existing children', () => {
    const children = EXPERIMENT_CASES.find((c) => c.id === 'existing-children-of-selected-folder');
    expect(children).toBeTruthy();
    const matrix = expectedMatrixForCase(children!);
    expect(matrix.capabilities.enumerate).toBe('denied');
    expect(matrix.capabilities.download_or_export).toBe('denied');
    expect(matrix.notes).toMatch(/Do not assume folder selection/i);
  });

  it('marks never-selected and externally added children as denied', () => {
    for (const id of ['never-selected-file', 'external-child-after-folder-selection']) {
      const c = EXPERIMENT_CASES.find((x) => x.id === id)!;
      const m = expectedMatrixForCase(c);
      expect(m.capabilities.metadata).toBe('denied');
      expect(m.capabilities.download_or_export).toBe('denied');
    }
  });

  it('allows app-created and picker-selected files in the documentation matrix', () => {
    for (const id of ['app-created-file', 'picker-selected-file']) {
      const c = EXPERIMENT_CASES.find((x) => x.id === id)!;
      const m = expectedMatrixForCase(c);
      expect(m.capabilities.metadata).toBe('allowed');
      expect(m.capabilities.download_or_export).toBe('allowed');
    }
  });

  it('inspects OAuth config without requiring credentials', () => {
    const cfg = loadDriveSpikeConfig();
    expect(typeof cfg.clientIdSet).toBe('boolean');
    expect(typeof cfg.clientSecretSet).toBe('boolean');
    // Secrets must never appear in the config inspection object.
    expect(JSON.stringify(cfg)).not.toMatch(/GOCSPX-|ya29\.|1\//);
  });

  it('keeps vault exclusion as an explicit spike invariant', () => {
    const notes = EXPERIMENT_CASES.map((c) => expectedMatrixForCase(c).notes).join(' ');
    expect(notes.toLowerCase()).not.toMatch(/vault plaintext|decrypt vault/);
  });
});
