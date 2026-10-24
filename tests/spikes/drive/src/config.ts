import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DRIVE_FILE_SCOPE,
  assertNarrowScope,
  validateRequestedDriveScopes,
} from '@daynori/domain';

const here = dirname(fileURLToPath(import.meta.url));
const spikeRoot = join(here, '..');

export type DriveOAuthClientType = 'web' | 'installed' | 'unset';

export interface DriveSpikeConfig {
  present: boolean;
  clientIdSet: boolean;
  clientSecretSet: boolean;
  /** web clients require a secret for code exchange; installed may use PKCE-only. */
  clientType: DriveOAuthClientType;
  redirectUri: string;
  requestedScope: string;
  loginHintSet: boolean;
  apiKeySet: boolean;
  pickerApiEnabledHint: boolean;
  configPath: string | null;
  /** Optional fixture IDs for live probes (never secrets). */
  neverSelectedFileId: string | null;
  selectedFolderId: string | null;
  selectedFileId: string | null;
}

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function envOr(file: Record<string, string>, key: string): string {
  return process.env[key] || file[key] || '';
}

/** Inspect configuration without printing credentials. */
export function loadDriveSpikeConfig(): DriveSpikeConfig {
  const localPath = join(spikeRoot, 'config.local.env');
  const fromFile = existsSync(localPath) ? parseEnvFile(localPath) : {};
  const clientId = envOr(fromFile, 'DAYNORI_DRIVE_CLIENT_ID');
  const clientSecret = envOr(fromFile, 'DAYNORI_DRIVE_CLIENT_SECRET');
  const clientTypeRaw = envOr(fromFile, 'DAYNORI_DRIVE_CLIENT_TYPE') || (clientId ? 'web' : 'unset');
  const clientType: DriveOAuthClientType =
    clientTypeRaw === 'web' || clientTypeRaw === 'installed' ? clientTypeRaw : 'unset';
  const redirectUri =
    envOr(fromFile, 'DAYNORI_DRIVE_REDIRECT_URI') || 'http://127.0.0.1:8765/oauth2callback';
  const requestedScope = envOr(fromFile, 'DAYNORI_DRIVE_REQUESTED_SCOPE') || DRIVE_FILE_SCOPE;
  const loginHint = envOr(fromFile, 'DAYNORI_DRIVE_LOGIN_HINT');
  const apiKey = envOr(fromFile, 'DAYNORI_DRIVE_API_KEY');

  return {
    present: Boolean(clientId),
    clientIdSet: Boolean(clientId),
    clientSecretSet: Boolean(clientSecret),
    clientType: clientId ? clientType : 'unset',
    redirectUri,
    requestedScope,
    loginHintSet: Boolean(loginHint),
    apiKeySet: Boolean(apiKey),
    pickerApiEnabledHint: envOr(fromFile, 'DAYNORI_DRIVE_PICKER_ENABLED') === 'true',
    configPath: existsSync(localPath) ? localPath : null,
    neverSelectedFileId: envOr(fromFile, 'DAYNORI_DRIVE_NEVER_SELECTED_FILE_ID') || null,
    selectedFolderId: envOr(fromFile, 'DAYNORI_DRIVE_SELECTED_FOLDER_ID') || null,
    selectedFileId: envOr(fromFile, 'DAYNORI_DRIVE_SELECTED_FILE_ID') || null,
  };
}

/** Secrets for the live runner only — never log these. */
export function loadDriveSpikeSecrets(): {
  clientId: string;
  clientSecret: string;
  apiKey: string;
  loginHint: string;
} {
  const localPath = join(spikeRoot, 'config.local.env');
  const fromFile = existsSync(localPath) ? parseEnvFile(localPath) : {};
  return {
    clientId: envOr(fromFile, 'DAYNORI_DRIVE_CLIENT_ID'),
    clientSecret: envOr(fromFile, 'DAYNORI_DRIVE_CLIENT_SECRET'),
    apiKey: envOr(fromFile, 'DAYNORI_DRIVE_API_KEY'),
    loginHint: envOr(fromFile, 'DAYNORI_DRIVE_LOGIN_HINT'),
  };
}

export function assertNarrowScopeConfig(requestedScope: string): void {
  const v = validateRequestedDriveScopes(requestedScope);
  if (!v.ok) throw new Error(v.message);
  assertNarrowScope(requestedScope);
}

export { assertNarrowScope };
