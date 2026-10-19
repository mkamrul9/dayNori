import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DRIVE_FILE_SCOPE } from './scopes.js';

const here = dirname(fileURLToPath(import.meta.url));
const spikeRoot = join(here, '..');

export interface DriveSpikeConfig {
  present: boolean;
  clientIdSet: boolean;
  clientSecretSet: boolean;
  redirectUri: string;
  requestedScope: string;
  loginHintSet: boolean;
  /** Path only — never include secret values. */
  configPath: string | null;
}

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    out[key] = value;
  }
  return out;
}

/** Inspect configuration without printing credentials. */
export function loadDriveSpikeConfig(): DriveSpikeConfig {
  const localPath = join(spikeRoot, 'config.local.env');
  const fromFile = existsSync(localPath) ? parseEnvFile(localPath) : {};
  const clientId =
    process.env['DAYNORI_DRIVE_CLIENT_ID'] || fromFile['DAYNORI_DRIVE_CLIENT_ID'] || '';
  const clientSecret =
    process.env['DAYNORI_DRIVE_CLIENT_SECRET'] || fromFile['DAYNORI_DRIVE_CLIENT_SECRET'] || '';
  const redirectUri =
    process.env['DAYNORI_DRIVE_REDIRECT_URI'] ||
    fromFile['DAYNORI_DRIVE_REDIRECT_URI'] ||
    'http://127.0.0.1:8765/oauth2callback';
  const requestedScope =
    process.env['DAYNORI_DRIVE_REQUESTED_SCOPE'] ||
    fromFile['DAYNORI_DRIVE_REQUESTED_SCOPE'] ||
    DRIVE_FILE_SCOPE;
  const loginHint =
    process.env['DAYNORI_DRIVE_LOGIN_HINT'] || fromFile['DAYNORI_DRIVE_LOGIN_HINT'] || '';

  return {
    present: Boolean(clientId),
    clientIdSet: Boolean(clientId),
    clientSecretSet: Boolean(clientSecret),
    redirectUri,
    requestedScope,
    loginHintSet: Boolean(loginHint),
    configPath: existsSync(localPath) ? localPath : null,
  };
}

export function assertNarrowScope(requestedScope: string): void {
  if (requestedScope !== DRIVE_FILE_SCOPE && !requestedScope.includes('drive.file')) {
    throw new Error(
      `Spike refuses non-narrow requested scope. Got redacted length=${requestedScope.length}`
    );
  }
  if (/\/auth\/drive$|drive\.readonly|drive\.metadata/.test(requestedScope)) {
    throw new Error('Spike refuses restricted/broader Drive scopes.');
  }
}
