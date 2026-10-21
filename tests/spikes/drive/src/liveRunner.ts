/**
 * Phase 48 — genuine live Google OAuth + Drive API experiment runner.
 * Interactive; never logs tokens, codes, or secrets.
 *
 * Required config (config.local.env):
 * - DAYNORI_DRIVE_CLIENT_ID
 * - DAYNORI_DRIVE_CLIENT_TYPE=web|installed
 * - DAYNORI_DRIVE_CLIENT_SECRET (required for web client code exchange)
 * - DAYNORI_DRIVE_REDIRECT_URI (must match Cloud Console; default http://127.0.0.1:8765/oauth2callback)
 * - DAYNORI_DRIVE_API_KEY (required for Google Picker page)
 * Enable APIs: Google Drive API, Google Picker API
 *
 * Optional probe IDs:
 * - DAYNORI_DRIVE_NEVER_SELECTED_FILE_ID
 * - DAYNORI_DRIVE_SELECTED_FOLDER_ID
 * - DAYNORI_DRIVE_SELECTED_FILE_ID (skip in-page Picker if already known)
 */

import { createServer, type IncomingMessage } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  DRIVE_FILE_SCOPE,
  assertCleanNarrowGrant,
  validateRequestedDriveScopes,
} from '@daynori/domain';
import { loadDriveSpikeConfig, loadDriveSpikeSecrets } from './config.js';
import { EXPERIMENT_CASES } from './scopes.js';
import { expectedMatrixForCase } from './mockDriveModel.js';

const here = dirname(fileURLToPath(import.meta.url));
const spikeRoot = join(here, '..');

type CapMap = Record<
  'metadata' | 'enumerate' | 'download_or_export' | 'create_upload' | 'update_move_trash',
  'allowed' | 'denied' | 'unverified' | 'error' | 'n/a'
>;

interface LiveCaseResult {
  caseId: string;
  evidenceLane: 'live_observation' | 'blocked_unexecuted';
  status: 'observed' | 'blocked' | 'error';
  reason: string;
  requestedScope: string;
  grantedScopeValidated: boolean;
  grantedScopeCount: number;
  httpStatus: number | null;
  oauthAuthorization: 'authorized' | 'unauthorized' | 'unverified' | null;
  capabilities: CapMap | null;
}

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function openBrowser(url: string): void {
  const platform = process.platform;
  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  } else if (platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function waitForOAuthCode(opts: {
  redirectUri: string;
  expectedState: string;
  timeoutMs: number;
}): Promise<{ code: string } | { error: string }> {
  const u = new URL(opts.redirectUri);
  const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
  const path = u.pathname || '/';

  return new Promise((resolve) => {
    let settled = false;
    const server = createServer(async (req, res) => {
      if (settled) {
        res.writeHead(409);
        res.end('already settled');
        return;
      }
      const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
      if (reqUrl.pathname !== path) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      const err = reqUrl.searchParams.get('error');
      const code = reqUrl.searchParams.get('code');
      const state = reqUrl.searchParams.get('state');
      if (err) {
        settled = true;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>Authorization denied. You can close this window.</body></html>');
        server.close();
        resolve({ error: err });
        return;
      }
      if (!code || state !== opts.expectedState) {
        settled = true;
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body>State mismatch or missing code. Close this window.</body></html>');
        server.close();
        resolve({ error: 'state_mismatch_or_missing_code' });
        return;
      }
      settled = true;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<html><body>Authorization received. Return to the terminal. You can close this window.</body></html>'
      );
      server.close();
      resolve({ code });
    });
    server.listen(port, '127.0.0.1');
    setTimeout(() => {
      if (!settled) {
        settled = true;
        server.close();
        resolve({ error: 'timeout' });
      }
    }, opts.timeoutMs);
  });
}

async function exchangeCode(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  verifier: string;
  clientType: 'web' | 'installed';
}): Promise<{ accessToken: string; refreshTokenPresent: boolean; scope: string }> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: opts.verifier,
  });
  if (opts.clientType === 'web' || opts.clientSecret) {
    body.set('client_secret', opts.clientSecret);
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`token_exchange_failed status=${res.status}`);
  }
  return {
    accessToken: json.access_token,
    refreshTokenPresent: Boolean(json.refresh_token),
    scope: json.scope || '',
  };
}

async function driveJson(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  });
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function blocked(caseId: string, reason: string, requestedScope: string): LiveCaseResult {
  return {
    caseId,
    evidenceLane: 'blocked_unexecuted',
    status: 'blocked',
    reason,
    requestedScope,
    grantedScopeValidated: false,
    grantedScopeCount: 0,
    httpStatus: null,
    oauthAuthorization: null,
    capabilities: null,
  };
}

async function runPickerSelection(opts: {
  accessToken: string;
  apiKey: string;
  clientId: string;
  port: number;
}): Promise<{ fileId: string | null; folderId: string | null; error?: string }> {
  const html = `<!DOCTYPE html>
<html><head><title>Daynori Drive spike Picker</title>
<script src="https://apis.google.com/js/api.js"></script>
</head><body>
<p>Select a synthetic test file or folder, then return to the terminal.</p>
<button id="pick">Open Google Picker</button>
<pre id="out"></pre>
<script>
const ACCESS_TOKEN = ${JSON.stringify(opts.accessToken)};
const API_KEY = ${JSON.stringify(opts.apiKey)};
const CLIENT_ID = ${JSON.stringify(opts.clientId)};
function onPick() {
  gapi.load('picker', () => {
    const view = new google.picker.DocsView()
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true);
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(ACCESS_TOKEN)
      .setDeveloperKey(API_KEY)
      .setAppId(CLIENT_ID.split('-')[0])
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs[0];
          fetch('/picker-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: doc.id,
              mimeType: doc.mimeType || '',
              name: '[redacted]'
            })
          }).then(() => {
            document.getElementById('out').textContent = 'Selection recorded. You can close this window.';
          });
        } else if (data.action === google.picker.Action.CANCEL) {
          fetch('/picker-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cancelled: true })
          });
          document.getElementById('out').textContent = 'Cancelled.';
        }
      })
      .build();
    picker.setVisible(true);
  });
}
document.getElementById('pick').onclick = onPick;
</script>
</body></html>`;

  return new Promise((resolve) => {
    let settled = false;
    const server = createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${opts.port}`);
      if (url.pathname === '/' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(html);
        return;
      }
      if (url.pathname === '/picker-result' && req.method === 'POST') {
        const raw = await readBody(req);
        settled = true;
        res.writeHead(200);
        res.end('ok');
        server.close();
        try {
          const body = JSON.parse(raw) as {
            id?: string;
            mimeType?: string;
            cancelled?: boolean;
          };
          if (body.cancelled) {
            resolve({ fileId: null, folderId: null, error: 'picker_cancelled' });
            return;
          }
          const isFolder = body.mimeType === 'application/vnd.google-apps.folder';
          resolve({
            fileId: isFolder ? null : body.id || null,
            folderId: isFolder ? body.id || null : null,
          });
        } catch {
          resolve({ fileId: null, folderId: null, error: 'picker_parse_error' });
        }
        return;
      }
      res.writeHead(404);
      res.end('not found');
    });
    server.listen(opts.port, '127.0.0.1', () => {
      openBrowser(`http://127.0.0.1:${opts.port}/`);
    });
    setTimeout(() => {
      if (!settled) {
        settled = true;
        server.close();
        resolve({ fileId: null, folderId: null, error: 'picker_timeout' });
      }
    }, 300_000);
  });
}

export async function runLiveDriveExperiments(): Promise<{
  outcome: 'live_verified_partial' | 'blocked' | 'error';
  results: LiveCaseResult[];
}> {
  const config = loadDriveSpikeConfig();
  const secrets = loadDriveSpikeSecrets();
  const requestedCheck = validateRequestedDriveScopes(config.requestedScope);
  if (!requestedCheck.ok) {
    return {
      outcome: 'blocked',
      results: EXPERIMENT_CASES.map((c) =>
        blocked(c.id, `invalid_requested_scope:${requestedCheck.reason}`, config.requestedScope)
      ),
    };
  }
  if (!config.clientIdSet || config.clientType === 'unset') {
    return {
      outcome: 'blocked',
      results: EXPERIMENT_CASES.map((c) =>
        blocked(
          c.id,
          'missing_oauth_config: set DAYNORI_DRIVE_CLIENT_ID and DAYNORI_DRIVE_CLIENT_TYPE=web|installed',
          DRIVE_FILE_SCOPE
        )
      ),
    };
  }
  if (config.clientType === 'web' && !config.clientSecretSet) {
    return {
      outcome: 'blocked',
      results: EXPERIMENT_CASES.map((c) =>
        blocked(
          c.id,
          'web_client_requires_DAYNORI_DRIVE_CLIENT_SECRET for authorization code exchange',
          DRIVE_FILE_SCOPE
        )
      ),
    };
  }

  const { verifier, challenge } = pkcePair();
  const state = base64Url(randomBytes(16));
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set('client_id', secrets.clientId);
  auth.searchParams.set('redirect_uri', config.redirectUri);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', DRIVE_FILE_SCOPE);
  auth.searchParams.set('access_type', 'offline');
  auth.searchParams.set('prompt', 'consent select_account');
  auth.searchParams.set('code_challenge', challenge);
  auth.searchParams.set('code_challenge_method', 'S256');
  auth.searchParams.set('state', state);
  if (secrets.loginHint) auth.searchParams.set('login_hint', secrets.loginHint);

  console.log('Opening browser for Google consent (drive.file only). Use a clean test account.');
  openBrowser(auth.toString());

  const codeResult = await waitForOAuthCode({
    redirectUri: config.redirectUri,
    expectedState: state,
    timeoutMs: 300_000,
  });
  if ('error' in codeResult) {
    return {
      outcome: 'blocked',
      results: EXPERIMENT_CASES.map((c) =>
        blocked(c.id, `oauth_callback:${codeResult.error}`, DRIVE_FILE_SCOPE)
      ),
    };
  }

  let tokens: { accessToken: string; refreshTokenPresent: boolean; scope: string };
  try {
    tokens = await exchangeCode({
      code: codeResult.code,
      clientId: secrets.clientId,
      clientSecret: secrets.clientSecret,
      redirectUri: config.redirectUri,
      verifier,
      clientType: config.clientType === 'installed' ? 'installed' : 'web',
    });
  } catch (e) {
    return {
      outcome: 'error',
      results: EXPERIMENT_CASES.map((c) =>
        blocked(
          c.id,
          e instanceof Error ? e.message : 'token_exchange_failed',
          DRIVE_FILE_SCOPE
        )
      ),
    };
  }

  let grantOk = false;
  try {
    assertCleanNarrowGrant(tokens.scope);
    grantOk = true;
  } catch (e) {
    return {
      outcome: 'blocked',
      results: EXPERIMENT_CASES.map((c) =>
        blocked(
          c.id,
          `granted_scope_not_clean_narrow:${e instanceof Error ? e.message : 'fail'}`,
          DRIVE_FILE_SCOPE
        )
      ),
    };
  }

  const results: LiveCaseResult[] = [];
  const accessToken = tokens.accessToken;

  // App-created file
  const createRes = await driveJson(accessToken, '/files?fields=id,name,capabilities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `daynori-spike-${Date.now()}.txt`,
      mimeType: 'text/plain',
    }),
  });
  const createdId = (createRes.json?.['id'] as string | undefined) || null;
  const createdCaps = (createRes.json?.['capabilities'] as Record<string, boolean> | undefined) || {};
  results.push({
    caseId: 'app-created-file',
    evidenceLane: 'live_observation',
    status: createRes.status >= 200 && createRes.status < 300 ? 'observed' : 'error',
    reason: createdId ? 'created_synthetic_file' : `create_status_${createRes.status}`,
    requestedScope: DRIVE_FILE_SCOPE,
    grantedScopeValidated: grantOk,
    grantedScopeCount: tokens.scope.split(/\s+/).filter(Boolean).length,
    httpStatus: createRes.status,
    oauthAuthorization: createdId ? 'authorized' : 'unauthorized',
    capabilities: {
      metadata: createdId ? 'allowed' : 'denied',
      enumerate: createdId ? 'allowed' : 'denied',
      download_or_export: 'unverified',
      create_upload: createRes.status < 300 ? 'allowed' : 'denied',
      update_move_trash: createdCaps['canEdit'] ? 'allowed' : 'unverified',
    },
  });

  // Never-selected file
  const neverId = config.neverSelectedFileId;
  if (!neverId) {
    results.push(
      blocked(
        'never-selected-file',
        'set DAYNORI_DRIVE_NEVER_SELECTED_FILE_ID to a file the app did not create or pick',
        DRIVE_FILE_SCOPE
      )
    );
  } else {
    const neverRes = await driveJson(accessToken, `/files/${encodeURIComponent(neverId)}?fields=id`);
    results.push({
      caseId: 'never-selected-file',
      evidenceLane: 'live_observation',
      status: 'observed',
      reason:
        neverRes.status === 404 || neverRes.status === 403
          ? 'denied_as_expected_for_unselected'
          : `unexpected_status_${neverRes.status}`,
      requestedScope: DRIVE_FILE_SCOPE,
      grantedScopeValidated: grantOk,
      grantedScopeCount: tokens.scope.split(/\s+/).filter(Boolean).length,
      httpStatus: neverRes.status,
      oauthAuthorization: neverRes.status === 200 ? 'authorized' : 'unauthorized',
      capabilities: {
        metadata: neverRes.status === 200 ? 'allowed' : 'denied',
        enumerate: 'denied',
        download_or_export: 'denied',
        create_upload: 'denied',
        update_move_trash: 'denied',
      },
    });
  }

  // Picker / selected file & folder
  let selectedFileId = config.selectedFileId;
  let selectedFolderId = config.selectedFolderId;
  if ((!selectedFileId && !selectedFolderId) && config.apiKeySet) {
    const pick = await runPickerSelection({
      accessToken,
      apiKey: secrets.apiKey,
      clientId: secrets.clientId,
      port: 8766,
    });
    if (pick.error) {
      results.push(blocked('picker-selected-file', `picker:${pick.error}`, DRIVE_FILE_SCOPE));
      results.push(blocked('picker-selected-folder', `picker:${pick.error}`, DRIVE_FILE_SCOPE));
    } else {
      selectedFileId = pick.fileId;
      selectedFolderId = pick.folderId;
    }
  } else if (!selectedFileId && !selectedFolderId) {
    results.push(
      blocked(
        'picker-selected-file',
        'set DAYNORI_DRIVE_API_KEY + Picker API, or DAYNORI_DRIVE_SELECTED_FILE_ID',
        DRIVE_FILE_SCOPE
      )
    );
    results.push(
      blocked(
        'picker-selected-folder',
        'set DAYNORI_DRIVE_SELECTED_FOLDER_ID or use Picker',
        DRIVE_FILE_SCOPE
      )
    );
  }

  if (selectedFileId) {
    const meta = await driveJson(
      accessToken,
      `/files/${encodeURIComponent(selectedFileId)}?fields=id,capabilities`
    );
    const caps = (meta.json?.['capabilities'] as Record<string, boolean> | undefined) || {};
    results.push({
      caseId: 'picker-selected-file',
      evidenceLane: 'live_observation',
      status: 'observed',
      reason: 'selected_file_metadata',
      requestedScope: DRIVE_FILE_SCOPE,
      grantedScopeValidated: grantOk,
      grantedScopeCount: tokens.scope.split(/\s+/).filter(Boolean).length,
      httpStatus: meta.status,
      oauthAuthorization: meta.status === 200 ? 'authorized' : 'unauthorized',
      capabilities: {
        metadata: meta.status === 200 ? 'allowed' : 'denied',
        enumerate: meta.status === 200 ? 'allowed' : 'denied',
        download_or_export: 'unverified',
        create_upload: 'n/a',
        update_move_trash: caps['canEdit'] || caps['canTrash'] ? 'allowed' : 'unverified',
      },
    });
  }

  if (selectedFolderId) {
    const folderMeta = await driveJson(
      accessToken,
      `/files/${encodeURIComponent(selectedFolderId)}?fields=id`
    );
    results.push({
      caseId: 'picker-selected-folder',
      evidenceLane: 'live_observation',
      status: 'observed',
      reason: 'selected_folder_metadata',
      requestedScope: DRIVE_FILE_SCOPE,
      grantedScopeValidated: grantOk,
      grantedScopeCount: tokens.scope.split(/\s+/).filter(Boolean).length,
      httpStatus: folderMeta.status,
      oauthAuthorization: folderMeta.status === 200 ? 'authorized' : 'unauthorized',
      capabilities: {
        metadata: folderMeta.status === 200 ? 'allowed' : 'denied',
        enumerate: 'unverified',
        download_or_export: 'n/a',
        create_upload: 'unverified',
        update_move_trash: 'unverified',
      },
    });

    const q = encodeURIComponent(`'${selectedFolderId}' in parents and trashed=false`);
    const list = await driveJson(accessToken, `/files?q=${q}&fields=files(id)&pageSize=5`);
    const files = (list.json?.['files'] as unknown[] | undefined) || [];
    results.push({
      caseId: 'existing-children-of-selected-folder',
      evidenceLane: 'live_observation',
      status: 'observed',
      reason:
        list.status === 200
          ? `list_status_200_count_${files.length}_not_proof_of_content_access`
          : `list_status_${list.status}`,
      requestedScope: DRIVE_FILE_SCOPE,
      grantedScopeValidated: grantOk,
      grantedScopeCount: tokens.scope.split(/\s+/).filter(Boolean).length,
      httpStatus: list.status,
      oauthAuthorization: list.status === 200 ? 'unverified' : 'unauthorized',
      capabilities: {
        metadata: list.status === 200 ? 'unverified' : 'denied',
        enumerate: list.status === 200 ? 'allowed' : 'denied',
        download_or_export: 'unverified',
        create_upload: 'unverified',
        update_move_trash: 'unverified',
      },
    });
  } else if (!results.some((r) => r.caseId === 'existing-children-of-selected-folder')) {
    results.push(
      blocked(
        'existing-children-of-selected-folder',
        'requires selected folder id from Picker or DAYNORI_DRIVE_SELECTED_FOLDER_ID',
        DRIVE_FILE_SCOPE
      )
    );
  }

  // Remaining cases: blocked unless we implemented them
  const done = new Set(results.map((r) => r.caseId));
  for (const c of EXPERIMENT_CASES) {
    if (done.has(c.id)) continue;
    results.push(
      blocked(
        c.id,
        'not_automated_in_this_live_pass; complete manually or extend runner',
        DRIVE_FILE_SCOPE
      )
    );
  }

  // Cleanup: trash app-created file if possible
  if (createdId) {
    await driveJson(accessToken, `/files/${encodeURIComponent(createdId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    });
  }

  // Wipe token from memory as best-effort
  (tokens as { accessToken: string }).accessToken = '';

  const observed = results.filter((r) => r.status === 'observed').length;
  return {
    outcome: observed > 0 ? 'live_verified_partial' : 'blocked',
    results,
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const config = loadDriveSpikeConfig();
  const { outcome, results } = await runLiveDriveExperiments();
  const report = {
    phase: 48,
    mode: 'live',
    startedAt,
    endedAt: new Date().toISOString(),
    outcome,
    configInspection: {
      clientIdSet: config.clientIdSet,
      clientSecretSet: config.clientSecretSet,
      clientType: config.clientType,
      apiKeySet: config.apiKeySet,
      redirectUri: config.redirectUri,
      requestedScope: config.requestedScope,
    },
    documentationExpectations: EXPERIMENT_CASES.map((c) => ({
      caseId: c.id,
      lane: 'documentation_expectation_or_synthetic',
      matrix: expectedMatrixForCase(c),
    })),
    liveObservations: results,
    note: 'documentationExpectations are not live observations. blocked_unexecuted ≠ successful verification.',
  };
  const outDir = join(spikeRoot, 'results');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `live-${outcome}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`outcome=${outcome} observed=${results.filter((r) => r.status === 'observed').length}`);
  console.log(`written=${outPath}`);
  process.exitCode = outcome === 'error' ? 1 : 0;
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url).replace(/\\/g, '/').endsWith(
    String(process.argv[1]).replace(/\\/g, '/').split(/[/\\]/).slice(-2).join('/')
  );
if (isMain || process.env['DAYNORI_DRIVE_LIVE_MAIN'] === '1') {
  void main();
}
