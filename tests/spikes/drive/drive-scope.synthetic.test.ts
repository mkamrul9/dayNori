/**
 * Phase 48 — synthetic Drive scope matrix + validation (no live Google account required).
 */
import { describe, it, expect } from 'vitest';
import {
  DRIVE_FILE_SCOPE,
  tokenizeScopes,
  validateRequestedDriveScopes,
  validateGrantedDriveScopes,
  assertNarrowScope,
} from '@daynori/domain';
import { EXPERIMENT_CASES } from './src/scopes.js';
import { expectedMatrixForCase } from './src/mockDriveModel.js';
import { loadDriveSpikeConfig } from './src/config.js';

describe('Phase 48 Drive scope spike (synthetic / documentation matrix)', () => {
  it('tokenizes scopes and rejects lookalikes / broader combinations', () => {
    expect(tokenizeScopes(`  ${DRIVE_FILE_SCOPE}  ${DRIVE_FILE_SCOPE} `)).toEqual([
      DRIVE_FILE_SCOPE,
    ]);
    expect(validateRequestedDriveScopes(DRIVE_FILE_SCOPE).ok).toBe(true);
    expect(
      validateRequestedDriveScopes(
        `${DRIVE_FILE_SCOPE} https://www.googleapis.com/auth/drive`
      ).ok
    ).toBe(false);
    expect(
      validateRequestedDriveScopes(
        `https://www.googleapis.com/auth/drive ${DRIVE_FILE_SCOPE}`
      ).ok
    ).toBe(false);
    expect(
      validateRequestedDriveScopes('https://evil.example/drive.file').ok
    ).toBe(false);
    expect(validateRequestedDriveScopes('https://www.googleapis.com/auth/drive').ok).toBe(false);
    expect(() => assertNarrowScope(DRIVE_FILE_SCOPE)).not.toThrow();
    expect(() =>
      assertNarrowScope(`${DRIVE_FILE_SCOPE} https://www.googleapis.com/auth/drive`)
    ).toThrow();
  });

  it('rejects broader granted scopes even when drive.file is also present', () => {
    const bad = validateGrantedDriveScopes(
      `${DRIVE_FILE_SCOPE} https://www.googleapis.com/auth/drive`,
      { allowOpenIdExtras: true }
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('broader_than_approved');

    const ok = validateGrantedDriveScopes(`${DRIVE_FILE_SCOPE} openid email`, {
      allowOpenIdExtras: true,
    });
    expect(ok.ok).toBe(true);
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

  it('keeps unmeasured folder-child behavior unverified (not a mock Google denial)', () => {
    const children = EXPERIMENT_CASES.find((c) => c.id === 'existing-children-of-selected-folder')!;
    const matrix = expectedMatrixForCase(children);
    expect(matrix.evidenceLane).toBe('synthetic_assumption');
    expect(matrix.oauthAuthorization).toBe('unverified');
    expect(matrix.capabilities.enumerate).toBe('unverified');
    expect(matrix.notes).toMatch(/not treat mock denial as an observed/i);
  });

  it('separates OAuth authorization from mutating provider capabilities', () => {
    const picked = expectedMatrixForCase(
      EXPERIMENT_CASES.find((c) => c.id === 'picker-selected-file')!
    );
    expect(picked.oauthAuthorization).toBe('authorized');
    expect(picked.capabilities.update_move_trash).toBe('unverified');
  });

  it('inspects OAuth config without requiring credentials', () => {
    const cfg = loadDriveSpikeConfig();
    expect(typeof cfg.clientIdSet).toBe('boolean');
    expect(JSON.stringify(cfg)).not.toMatch(/GOCSPX-|ya29\./);
  });
});
