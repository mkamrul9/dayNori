/**
 * AES-256-GCM authenticated encryption for Drive refresh tokens at rest.
 * Key material comes from DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY (base64 32 bytes)
 * and DAYNORI_DRIVE_TOKEN_KEY_VERSION. Missing config fails closed — never plaintext.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

export class DriveTokenEncryptionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriveTokenEncryptionUnavailableError';
  }
}

export interface SealedDriveToken {
  keyVersion: string;
  ciphertext: string; // base64(iv || tag || ciphertext)
}

function loadKeyMaterial(): { key: Buffer; version: string } {
  const version = process.env['DAYNORI_DRIVE_TOKEN_KEY_VERSION']?.trim();
  const raw = process.env['DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY']?.trim();
  if (!version || !raw) {
    throw new DriveTokenEncryptionUnavailableError(
      'Drive token encryption is not configured (DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY / DAYNORI_DRIVE_TOKEN_KEY_VERSION). Refusing plaintext storage.'
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new DriveTokenEncryptionUnavailableError(
      'DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY must be 32 bytes base64-encoded.'
    );
  }
  return { key, version };
}

/**
 * AAD binds ciphertext to tenant/connection so stolen blobs cannot be swapped across rows.
 */
export function sealDriveRefreshToken(
  plaintext: string,
  binding: { workspaceId: string; connectionId: string; accountId: string }
): SealedDriveToken {
  const { key, version } = loadKeyMaterial();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const aad = Buffer.from(
    `${binding.workspaceId}|${binding.connectionId}|${binding.accountId}|${version}`,
    'utf8'
  );
  cipher.setAAD(aad);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    keyVersion: version,
    ciphertext: Buffer.concat([iv, tag, enc]).toString('base64'),
  };
}

export function unsealDriveRefreshToken(
  sealed: SealedDriveToken,
  binding: { workspaceId: string; connectionId: string; accountId: string }
): string {
  const { key, version } = loadKeyMaterial();
  if (sealed.keyVersion !== version) {
    // Rotation: try current key only; document re-encrypt on reconnect for older versions.
    throw new DriveTokenEncryptionUnavailableError(
      `Drive token key version mismatch (stored=${sealed.keyVersion}, current=${version}). Reconnect required after rotation.`
    );
  }
  const buf = Buffer.from(sealed.ciphertext, 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new DriveTokenEncryptionUnavailableError('Drive token ciphertext malformed.');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  const aad = Buffer.from(
    `${binding.workspaceId}|${binding.connectionId}|${binding.accountId}|${version}`,
    'utf8'
  );
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function isDriveTokenEncryptionConfigured(): boolean {
  try {
    loadKeyMaterial();
    return true;
  } catch {
    return false;
  }
}
