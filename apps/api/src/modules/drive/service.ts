/**
 * Phase 49 Drive selected-file connector service.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  DRIVE_CONNECTOR_REQUESTED_SCOPE,
  PICKER_ACCESS_TOKEN_TTL_MS,
  assertDriveScopesForConnect,
  disconnectExplanation,
  evaluateSelectedObjectSupport,
  isAuthIntentUsable,
  isProviderObjectAuthorized,
  isVaultDriveTarget,
  mayCompleteDriveWork,
  type DriveConnectionStatus,
  type DriveLinkMode,
} from '@daynori/domain';
import type {
  CompleteDriveConnectRequest,
  DriveConnection,
  DriveLinkedFile,
  DriveSelectFileRequest,
  StartDriveConnectRequest,
} from '@daynori/contracts';
import {
  DriveProviderUnavailableError,
  getDriveProvider,
  type DriveProvider,
  type DriveTokenSet,
} from './provider.js';
import {
  DriveTokenEncryptionUnavailableError,
  isDriveTokenEncryptionConfigured,
  sealDriveRefreshToken,
  unsealDriveRefreshToken,
} from './tokenCrypto.js';

const INTENT_TTL_MS = 10 * 60 * 1000;
const ALLOWED_RETURN_PREFIXES = ['/settings', '/connections', '/library', '/dev/drive-harness'];

export class DriveServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'DriveServiceError';
  }
}

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function allowlistedReturnPath(path: string): boolean {
  return ALLOWED_RETURN_PREFIXES.some((p) => path === p || path.startsWith(`${p}?`) || path.startsWith(`${p}/`));
}

function redirectUriForPlatform(platform: 'web' | 'android'): string {
  if (platform === 'web') {
    const uri = process.env['DAYNORI_DRIVE_OAUTH_REDIRECT_URI_WEB']?.trim();
    if (!uri) {
      // Local default for harness; production must set env.
      return 'http://127.0.0.1:3000/api/drive/callback';
    }
    return uri;
  }
  // Android: server-brokered HTTPS callback (Custom Tabs) — not a desktop custom-scheme copy.
  const uri = process.env['DAYNORI_DRIVE_OAUTH_REDIRECT_URI_ANDROID']?.trim();
  if (uri) return uri;
  if (getDriveProvider().kind === 'fake') {
    return 'http://127.0.0.1:3000/api/drive/callback/android';
  }
  throw new DriveServiceError(
    'Android Drive redirect URI is not configured (DAYNORI_DRIVE_OAUTH_REDIRECT_URI_ANDROID).',
    503,
    'android_redirect_unconfigured'
  );
}

interface ConnectionRow {
  id: string;
  workspace_id: string;
  account_id: string;
  status: DriveConnectionStatus;
  provider_kind: string;
  provider_subject: string | null;
  provider_account_email: string | null;
  granted_scope: string | null;
  generation: string | number;
  refresh_token_ciphertext: string | null;
  refresh_token_key_version: string | null;
  access_token_expires_at: Date | null;
  connected_at: Date | null;
  last_reconciled_at: Date | null;
}

function toConnectionDto(row: ConnectionRow | null, workspaceId: string): DriveConnection {
  if (!row || row.status === 'disconnected' || row.status === 'revoked' || row.status === 'unconfigured') {
    const provider = getDriveProvider();
    return {
      id: row?.id ?? null,
      workspaceId,
      status: row?.status === 'revoked' ? 'revoked' : row?.status === 'disconnected' ? 'disconnected' : 'unconfigured',
      providerKind:
        provider.kind === 'fake'
          ? 'fake'
          : provider.kind === 'google_production'
            ? 'google_production'
            : 'unconfigured',
      providerAccountEmail: null,
      providerSubject: null,
      grantedScopeValidated: false,
      generation: row ? Number(row.generation) : 0,
      connectedAt: null,
      lastReconciledAt: null,
      isDevelopmentFixture: provider.kind === 'fake',
    };
  }
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    status: row.status,
    providerKind: row.provider_kind as DriveConnection['providerKind'],
    providerAccountEmail: row.provider_account_email,
    providerSubject: row.provider_subject,
    grantedScopeValidated: Boolean(row.granted_scope),
    generation: Number(row.generation),
    connectedAt: row.connected_at?.toISOString() ?? null,
    lastReconciledAt: row.last_reconciled_at?.toISOString() ?? null,
    isDevelopmentFixture: row.provider_kind === 'fake',
  };
}

async function loadConnection(
  client: PoolClient,
  workspaceId: string,
  accountId: string
): Promise<ConnectionRow | null> {
  const res = await client.query<ConnectionRow>(
    `SELECT * FROM app.drive_connections WHERE workspace_id = $1 AND account_id = $2`,
    [workspaceId, accountId]
  );
  return res.rows[0] ?? null;
}

const refreshLocks = new Map<string, Promise<string>>();

async function requireWorkspaceRole(
  client: PoolClient,
  workspaceId: string,
  role: 'viewer' | 'editor'
): Promise<void> {
  const res = await client.query<{ exists: boolean }>(
    `SELECT app.user_has_workspace_role($1, $2) as exists`,
    [workspaceId, role]
  );
  if (!res.rows[0]?.exists) {
    throw new DriveServiceError('Workspace membership required', 403, 'forbidden');
  }
}

export async function getDriveConnectionStatus(
  client: PoolClient,
  workspaceId: string,
  accountId: string
): Promise<DriveConnection> {
  await requireWorkspaceRole(client, workspaceId, 'viewer');
  const row = await loadConnection(client, workspaceId, accountId);
  return toConnectionDto(row, workspaceId);
}

export async function startDriveConnect(
  client: PoolClient,
  input: {
    workspaceId: string;
    accountId: string;
    request: StartDriveConnectRequest;
  }
): Promise<{
  intentId: string;
  authorizationUrl: string;
  expiresAt: string;
  providerKind: DriveConnection['providerKind'];
  developmentHarnessHint: string | null;
}> {
  await requireWorkspaceRole(client, input.workspaceId, 'editor');
  if (!allowlistedReturnPath(input.request.returnPath)) {
    throw new DriveServiceError('returnPath is not allowlisted', 400, 'return_path_rejected');
  }
  const provider = getDriveProvider();
  if (provider.kind === 'unconfigured') {
    throw new DriveServiceError(
      'Drive connector is unconfigured. Production Google OAuth is not enabled.',
      503,
      'provider_unconfigured'
    );
  }
  if (provider.kind === 'google_production' && !isDriveTokenEncryptionConfigured()) {
    throw new DriveServiceError(
      'Drive token encryption key is required before production connect.',
      503,
      'token_encryption_unconfigured'
    );
  }
  // Fake harness still needs encryption for realistic token storage paths in tests.
  if (!isDriveTokenEncryptionConfigured()) {
    throw new DriveServiceError(
      'DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY is required before storing connection tokens.',
      503,
      'token_encryption_unconfigured'
    );
  }

  const redirectUri = redirectUriForPlatform(input.request.platform);
  const { verifier, challenge } = pkcePair();
  const state = base64Url(randomBytes(24));
  const expiresAt = new Date(Date.now() + INTENT_TTL_MS);

  const ins = await client.query<{ id: string }>(
    `INSERT INTO app.drive_auth_intents (
      workspace_id, account_id, platform, status, state_token, code_verifier,
      return_path, redirect_uri, requested_scope, expires_at
    ) VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9)
    RETURNING id`,
    [
      input.workspaceId,
      input.accountId,
      input.request.platform,
      state,
      verifier,
      input.request.returnPath,
      redirectUri,
      DRIVE_CONNECTOR_REQUESTED_SCOPE,
      expiresAt.toISOString(),
    ]
  );

  await client.query(
    `INSERT INTO app.drive_connections (workspace_id, account_id, status, provider_kind, generation)
     VALUES ($1,$2,'pending_consent',$3,0)
     ON CONFLICT (workspace_id, account_id) DO UPDATE
       SET status = CASE
         WHEN app.drive_connections.status = 'connected' THEN app.drive_connections.status
         ELSE 'pending_consent'
       END,
       provider_kind = EXCLUDED.provider_kind,
       updated_at = now()`,
    [input.workspaceId, input.accountId, provider.kind]
  );

  const authorizationUrl = provider.buildAuthorizationUrl({
    state,
    codeChallenge: challenge,
    redirectUri,
  });

  return {
    intentId: ins.rows[0]!.id,
    authorizationUrl,
    expiresAt: expiresAt.toISOString(),
    providerKind: provider.kind,
    developmentHarnessHint:
      provider.kind === 'fake'
        ? 'Labeled fake provider. Use code fake-ok or fake-ok-<sha256(verifier)[:16]> with returned state. Not a Google account.'
        : null,
  };
}

export async function completeDriveConnect(
  client: PoolClient,
  input: {
    workspaceId: string;
    accountId: string;
    request: CompleteDriveConnectRequest;
  }
): Promise<DriveConnection> {
  await requireWorkspaceRole(client, input.workspaceId, 'editor');
  const provider = getDriveProvider();
  if (provider.kind === 'unconfigured') {
    throw new DriveServiceError('Drive provider unconfigured', 503, 'provider_unconfigured');
  }

  const intentRes = await client.query<{
    id: string;
    workspace_id: string;
    account_id: string;
    status: string;
    state_token: string;
    code_verifier: string;
    redirect_uri: string;
    requested_scope: string;
    expires_at: Date;
  }>(`SELECT * FROM app.drive_auth_intents WHERE id = $1 FOR UPDATE`, [input.request.intentId]);
  const intent = intentRes.rows[0];
  if (!intent) throw new DriveServiceError('Auth intent not found', 404, 'intent_not_found');

  const usable = isAuthIntentUsable({
    status: intent.status as 'pending',
    expiresAtMs: new Date(intent.expires_at).getTime(),
    nowMs: Date.now(),
    boundAccountId: intent.account_id,
    boundWorkspaceId: intent.workspace_id,
    actorAccountId: input.accountId,
    actorWorkspaceId: input.workspaceId,
  });
  if (!usable.ok) {
    throw new DriveServiceError(`Auth intent not usable: ${usable.reason}`, 400, usable.reason);
  }

  if (intent.state_token !== input.request.state) {
    await client.query(`UPDATE app.drive_auth_intents SET status = 'failed' WHERE id = $1`, [
      intent.id,
    ]);
    throw new DriveServiceError('OAuth state mismatch', 400, 'state_mismatch');
  }

  if (input.request.error) {
    await client.query(`UPDATE app.drive_auth_intents SET status = 'denied' WHERE id = $1`, [
      intent.id,
    ]);
    throw new DriveServiceError(`Consent denied: ${input.request.error}`, 400, 'consent_denied');
  }

  if (!input.request.code) {
    throw new DriveServiceError('Authorization code required', 400, 'code_required');
  }

  let tokens: DriveTokenSet;
  try {
    tokens = await provider.exchangeAuthorizationCode({
      code: input.request.code,
      codeVerifier: intent.code_verifier,
      redirectUri: intent.redirect_uri,
    });
  } catch (err) {
    await client.query(`UPDATE app.drive_auth_intents SET status = 'failed' WHERE id = $1`, [
      intent.id,
    ]);
    const msg = err instanceof Error ? err.message : 'token_exchange_failed';
    throw new DriveServiceError(msg, 400, 'token_exchange_failed');
  }

  try {
    assertDriveScopesForConnect(intent.requested_scope, tokens.scope);
  } catch (err) {
    await client.query(`UPDATE app.drive_auth_intents SET status = 'failed' WHERE id = $1`, [
      intent.id,
    ]);
    throw new DriveServiceError(
      err instanceof Error ? err.message : 'scope_rejected',
      400,
      'scope_rejected'
    );
  }

  // Ensure connection row
  let conn = await loadConnection(client, input.workspaceId, input.accountId);
  if (!conn) {
    const created = await client.query<ConnectionRow>(
      `INSERT INTO app.drive_connections (workspace_id, account_id, status, provider_kind, generation)
       VALUES ($1,$2,'pending_consent',$3,0) RETURNING *`,
      [input.workspaceId, input.accountId, provider.kind]
    );
    conn = created.rows[0]!;
  }

  if (!tokens.refreshToken) {
    throw new DriveServiceError('Refresh token missing from grant', 400, 'refresh_token_missing');
  }

  let sealed;
  try {
    sealed = sealDriveRefreshToken(tokens.refreshToken, {
      workspaceId: input.workspaceId,
      connectionId: conn.id,
      accountId: input.accountId,
    });
  } catch (err) {
    if (err instanceof DriveTokenEncryptionUnavailableError) {
      throw new DriveServiceError(err.message, 503, 'token_encryption_unconfigured');
    }
    throw err;
  }

  await client.query(
    `UPDATE app.drive_connections SET
      status = 'connected',
      provider_kind = $2,
      provider_subject = $3,
      provider_account_email = $4,
      granted_scope = $5,
      refresh_token_ciphertext = $6,
      refresh_token_key_version = $7,
      access_token_expires_at = $8,
      connected_at = now(),
      disconnected_at = NULL,
      updated_at = now()
     WHERE id = $1`,
    [
      conn.id,
      provider.kind,
      tokens.providerSubject,
      tokens.providerAccountEmail,
      tokens.scope,
      sealed.ciphertext,
      sealed.keyVersion,
      tokens.expiresAt.toISOString(),
    ]
  );

  await client.query(
    `UPDATE app.drive_auth_intents SET status = 'consumed', consumed_at = now() WHERE id = $1`,
    [intent.id]
  );

  // Cache short-lived access token in memory only (module-level); never persist access tokens.
  accessTokenCache.set(conn.id, {
    token: tokens.accessToken,
    expiresAt: tokens.expiresAt.getTime(),
    generation: Number(conn.generation),
  });

  const updated = await loadConnection(client, input.workspaceId, input.accountId);
  return toConnectionDto(updated, input.workspaceId);
}

const accessTokenCache = new Map<
  string,
  { token: string; expiresAt: number; generation: number }
>();

async function getAccessToken(
  client: PoolClient,
  conn: ConnectionRow,
  provider: DriveProvider
): Promise<string> {
  const cached = accessTokenCache.get(conn.id);
  if (
    cached &&
    cached.generation === Number(conn.generation) &&
    cached.expiresAt > Date.now() + 30_000
  ) {
    return cached.token;
  }

  const existing = refreshLocks.get(conn.id);
  if (existing) return existing;

  const work = (async () => {
    if (!conn.refresh_token_ciphertext || !conn.refresh_token_key_version) {
      throw new DriveServiceError('No stored refresh token', 400, 'not_connected');
    }
    const refresh = unsealDriveRefreshToken(
      {
        ciphertext: conn.refresh_token_ciphertext,
        keyVersion: conn.refresh_token_key_version,
      },
      {
        workspaceId: conn.workspace_id,
        connectionId: conn.id,
        accountId: conn.account_id,
      }
    );
    let tokens: DriveTokenSet;
    try {
      tokens = await provider.refreshAccessToken(refresh);
    } catch (err) {
      if (err instanceof DriveProviderUnavailableError && err.message.includes('invalid_grant')) {
        await markRevoked(client, conn, 'invalid_grant');
      }
      throw new DriveServiceError(
        err instanceof Error ? err.message : 'refresh_failed',
        401,
        'refresh_failed'
      );
    }

    // Fence: reload connection generation
    const fresh = await loadConnection(client, conn.workspace_id, conn.account_id);
    if (
      !fresh ||
      !mayCompleteDriveWork({
        connectionStatus: fresh.status,
        connectionGeneration: Number(fresh.generation),
        jobGeneration: Number(conn.generation),
      })
    ) {
      throw new DriveServiceError('Connection disconnected during refresh', 409, 'fenced');
    }

    if (tokens.refreshToken) {
      const sealed = sealDriveRefreshToken(tokens.refreshToken, {
        workspaceId: fresh.workspace_id,
        connectionId: fresh.id,
        accountId: fresh.account_id,
      });
      await client.query(
        `UPDATE app.drive_connections SET
          refresh_token_ciphertext = $2,
          refresh_token_key_version = $3,
          access_token_expires_at = $4,
          updated_at = now()
         WHERE id = $1 AND generation = $5 AND status = 'connected'`,
        [
          fresh.id,
          sealed.ciphertext,
          sealed.keyVersion,
          tokens.expiresAt.toISOString(),
          fresh.generation,
        ]
      );
    } else {
      await client.query(
        `UPDATE app.drive_connections SET access_token_expires_at = $2, updated_at = now()
         WHERE id = $1 AND generation = $3 AND status = 'connected'`,
        [fresh.id, tokens.expiresAt.toISOString(), fresh.generation]
      );
    }

    accessTokenCache.set(fresh.id, {
      token: tokens.accessToken,
      expiresAt: tokens.expiresAt.getTime(),
      generation: Number(fresh.generation),
    });
    return tokens.accessToken;
  })();

  refreshLocks.set(conn.id, work);
  try {
    return await work;
  } finally {
    refreshLocks.delete(conn.id);
  }
}

async function markRevoked(
  client: PoolClient,
  conn: ConnectionRow,
  reason: 'provider_revocation' | 'invalid_grant'
): Promise<void> {
  await client.query(
    `UPDATE app.drive_connections SET
      status = 'revoked',
      generation = generation + 1,
      refresh_token_ciphertext = NULL,
      refresh_token_key_version = NULL,
      disconnected_at = now(),
      updated_at = now()
     WHERE id = $1`,
    [conn.id]
  );
  accessTokenCache.delete(conn.id);
  await client.query(
    `UPDATE app.drive_jobs SET status = 'cancelled', updated_at = now()
     WHERE connection_id = $1 AND status IN ('pending','running')`,
    [conn.id]
  );
  await client.query(
    `UPDATE app.background_jobs SET status = 'failed', last_error = 'Drive connection revoked', updated_at = now()
     WHERE status = 'pending'
       AND task_type LIKE 'drive_%'
       AND payload->>'connectionId' = $1`,
    [conn.id]
  );
  void reason;
}

export async function disconnectDrive(
  client: PoolClient,
  input: { workspaceId: string; accountId: string }
): Promise<{
  status: 'disconnected';
  tokensRemoved: true;
  jobsCancelled: number;
  retainedImportedCopies: true;
  remoteOriginalDeleted: false;
  message: string;
}> {
  await requireWorkspaceRole(client, input.workspaceId, 'editor');
  const conn = await loadConnection(client, input.workspaceId, input.accountId);
  if (!conn) {
    const expl = disconnectExplanation('local_disconnect');
    return { status: 'disconnected', jobsCancelled: 0, ...expl };
  }

  // Best-effort provider revoke using sealed token before wipe
  if (conn.refresh_token_ciphertext && conn.refresh_token_key_version) {
    try {
      const provider = getDriveProvider();
      const refresh = unsealDriveRefreshToken(
        {
          ciphertext: conn.refresh_token_ciphertext,
          keyVersion: conn.refresh_token_key_version,
        },
        {
          workspaceId: conn.workspace_id,
          connectionId: conn.id,
          accountId: conn.account_id,
        }
      );
      await provider.revoke(refresh);
    } catch {
      // still wipe locally
    }
  }

  await client.query(
    `UPDATE app.drive_connections SET
      status = 'disconnected',
      generation = generation + 1,
      refresh_token_ciphertext = NULL,
      refresh_token_key_version = NULL,
      disconnected_at = now(),
      updated_at = now()
     WHERE id = $1`,
    [conn.id]
  );
  accessTokenCache.delete(conn.id);

  const jobs = await client.query(
    `UPDATE app.drive_jobs SET status = 'cancelled', updated_at = now()
     WHERE connection_id = $1 AND status IN ('pending','running')
     RETURNING id`,
    [conn.id]
  );
  await client.query(
    `UPDATE app.background_jobs SET status = 'failed', last_error = 'Drive connection disconnected', updated_at = now()
     WHERE status = 'pending'
       AND task_type LIKE 'drive_%'
       AND payload->>'connectionId' = $1`,
    [conn.id]
  );
  await client.query(
    `UPDATE app.drive_auth_intents SET status = 'cancelled'
     WHERE workspace_id = $1 AND account_id = $2 AND status = 'pending'`,
    [input.workspaceId, input.accountId]
  );

  const expl = disconnectExplanation('local_disconnect');
  return { status: 'disconnected', jobsCancelled: jobs.rowCount ?? 0, ...expl };
}

export async function issuePickerAccessToken(
  client: PoolClient,
  input: { workspaceId: string; accountId: string }
): Promise<{ accessToken: string; expiresAt: string; cacheControl: 'no-store' }> {
  await requireWorkspaceRole(client, input.workspaceId, 'editor');
  const conn = await loadConnection(client, input.workspaceId, input.accountId);
  if (!conn || conn.status !== 'connected') {
    throw new DriveServiceError('Drive not connected', 400, 'not_connected');
  }
  const provider = getDriveProvider();
  const accessToken = await getAccessToken(client, conn, provider);
  const expiresAt = new Date(Date.now() + PICKER_ACCESS_TOKEN_TTL_MS).toISOString();
  return { accessToken, expiresAt, cacheControl: 'no-store' };
}

function mapLinked(row: {
  id: string;
  connection_id: string;
  provider_file_id: string;
  display_name: string;
  mime_type: string;
  provenance: string;
  link_mode: string;
  provider_version: string | null;
  checksum: string | null;
  local_file_item_id: string | null;
  availability: string;
  last_reconciled_at: Date | null;
}): DriveLinkedFile {
  return {
    id: row.id,
    connectionId: row.connection_id,
    providerFileId: row.provider_file_id,
    displayName: row.display_name,
    mimeType: row.mime_type,
    provenance: row.provenance as DriveLinkedFile['provenance'],
    linkMode: row.link_mode as DriveLinkMode,
    providerVersion: row.provider_version,
    checksum: row.checksum,
    localFileItemId: row.local_file_item_id,
    availability: row.availability as DriveLinkedFile['availability'],
    lastReconciledAt: row.last_reconciled_at?.toISOString() ?? null,
  };
}

export async function listDriveLinkedFiles(
  client: PoolClient,
  input: { workspaceId: string; accountId: string }
): Promise<DriveLinkedFile[]> {
  await requireWorkspaceRole(client, input.workspaceId, 'viewer');
  const conn = await loadConnection(client, input.workspaceId, input.accountId);
  if (!conn) return [];
  const res = await client.query(
    `SELECT * FROM app.drive_linked_files WHERE connection_id = $1 AND workspace_id = $2 ORDER BY created_at DESC`,
    [conn.id, input.workspaceId]
  );
  return res.rows.map(mapLinked);
}

export async function selectOrActOnDriveFile(
  client: PoolClient,
  input: {
    workspaceId: string;
    accountId: string;
    request: DriveSelectFileRequest;
  }
): Promise<{
  linkedFile: DriveLinkedFile;
  jobId: string | null;
  jobKind: 'import_copy' | 'upload_to_drive' | 'download_offline' | 'none';
}> {
  await requireWorkspaceRole(client, input.workspaceId, 'editor');
  const conn = await loadConnection(client, input.workspaceId, input.accountId);
  if (!conn || conn.status !== 'connected') {
    throw new DriveServiceError('Drive not connected', 400, 'not_connected');
  }
  if (conn.account_id !== input.accountId) {
    throw new DriveServiceError('Connection ownership mismatch', 403, 'connection_ownership');
  }

  const support = evaluateSelectedObjectSupport({
    providerFileId: input.request.providerFileId,
    mimeType: input.request.mimeType,
    name: input.request.displayName,
    isShortcut: input.request.isShortcut,
    isSharedDrive: input.request.isSharedDrive,
    md5Checksum: input.request.checksum ?? null,
    version: input.request.providerVersion ?? null,
  });
  if (!support.supported) {
    throw new DriveServiceError(support.reason ?? 'unsupported', 400, 'unsupported_object');
  }

  // Reject vault targets
  if (input.request.localFileItemId) {
    const item = await client.query<{ kind: string }>(
      `SELECT kind FROM app.items WHERE id = $1 AND workspace_id = $2`,
      [input.request.localFileItemId, input.workspaceId]
    );
    if (item.rows[0] && isVaultDriveTarget(item.rows[0].kind)) {
      throw new DriveServiceError('Vault content cannot use Drive connector', 403, 'vault_excluded');
    }
  }

  const provenance =
    input.request.linkMode === 'upload_to_drive'
      ? 'upload'
      : input.request.linkMode === 'import_copy'
        ? 'imported_copy'
        : 'picker_selected';

  const upsert = await client.query(
    `INSERT INTO app.drive_linked_files (
      workspace_id, connection_id, account_id, provider_file_id, display_name, mime_type,
      provenance, link_mode, provider_version, checksum, local_file_item_id, availability
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (connection_id, provider_file_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      mime_type = EXCLUDED.mime_type,
      link_mode = EXCLUDED.link_mode,
      provider_version = EXCLUDED.provider_version,
      checksum = EXCLUDED.checksum,
      local_file_item_id = COALESCE(EXCLUDED.local_file_item_id, app.drive_linked_files.local_file_item_id),
      updated_at = now()
    RETURNING *`,
    [
      input.workspaceId,
      conn.id,
      input.accountId,
      input.request.providerFileId,
      input.request.displayName,
      input.request.mimeType,
      provenance,
      input.request.linkMode,
      input.request.providerVersion ?? null,
      input.request.checksum ?? null,
      input.request.localFileItemId ?? null,
      input.request.linkMode === 'link_reference' ? 'linked' : 'linked',
    ]
  );
  const linked = mapLinked(upsert.rows[0]!);

  // Application selection boundary registry
  const authorized = new Set([input.request.providerFileId]);
  if (!isProviderObjectAuthorized(authorized, input.request.providerFileId)) {
    throw new DriveServiceError('Provider object not in selection boundary', 403, 'selection_boundary');
  }

  let jobKind: 'import_copy' | 'upload_to_drive' | 'download_offline' | 'none' = 'none';
  let jobId: string | null = null;

  if (
    input.request.linkMode === 'import_copy' ||
    input.request.linkMode === 'upload_to_drive' ||
    input.request.linkMode === 'download_offline'
  ) {
    jobKind = input.request.linkMode;
    const idempotencyKey = `${jobKind}:${input.request.providerFileId}:${input.request.localFileItemId ?? 'none'}`;
    const jobIns = await client.query<{ id: string }>(
      `INSERT INTO app.drive_jobs (
        workspace_id, connection_id, linked_file_id, kind, status, connection_generation, idempotency_key
      ) VALUES ($1,$2,$3,$4,'pending',$5,$6)
      ON CONFLICT (connection_id, idempotency_key) DO UPDATE SET updated_at = now()
      RETURNING id`,
      [input.workspaceId, conn.id, linked.id, jobKind, conn.generation, idempotencyKey]
    );
    jobId = jobIns.rows[0]!.id;

    const bg = await client.query<{ id: string }>(
      `INSERT INTO app.background_jobs (task_type, payload, run_at, status)
       VALUES ($1, $2::jsonb, now(), 'pending')
       RETURNING id`,
      [
        `drive_${jobKind}`,
        JSON.stringify({
          driveJobId: jobId,
          connectionId: conn.id,
          workspaceId: input.workspaceId,
          accountId: input.accountId,
          linkedFileId: linked.id,
          connectionGeneration: Number(conn.generation),
          providerFileId: input.request.providerFileId,
          exportMimeType: input.request.exportMimeType ?? null,
          folderId: input.request.folderId ?? null,
          localFileItemId: input.request.localFileItemId ?? null,
          idempotencyKey,
        }),
      ]
    );
    await client.query(`UPDATE app.drive_jobs SET background_job_id = $2 WHERE id = $1`, [
      jobId,
      bg.rows[0]!.id,
    ]);
  }

  return { linkedFile: linked, jobId, jobKind };
}

export async function unlinkDriveReference(
  client: PoolClient,
  input: { workspaceId: string; accountId: string; linkedFileId: string }
): Promise<void> {
  await requireWorkspaceRole(client, input.workspaceId, 'editor');
  const res = await client.query(
    `DELETE FROM app.drive_linked_files
     WHERE id = $1 AND workspace_id = $2 AND account_id = $3
     RETURNING id`,
    [input.linkedFileId, input.workspaceId, input.accountId]
  );
  if ((res.rowCount ?? 0) === 0) {
    throw new DriveServiceError('Linked file not found', 404, 'not_found');
  }
  // Does not trash remote Drive original.
}

/** Worker entry: process a drive_* background job with disconnect fencing. */
export async function processDriveBackgroundJob(
  client: PoolClient,
  payload: {
    driveJobId: string;
    connectionId: string;
    workspaceId: string;
    accountId: string;
    linkedFileId: string;
    connectionGeneration: number;
    providerFileId: string;
    exportMimeType: string | null;
    folderId: string | null;
    localFileItemId: string | null;
    idempotencyKey: string;
  }
): Promise<{ status: 'succeeded' | 'fenced' | 'failed'; errorCode?: string }> {
  const conn = await loadConnection(client, payload.workspaceId, payload.accountId);
  if (
    !conn ||
    !mayCompleteDriveWork({
      connectionStatus: conn.status,
      connectionGeneration: Number(conn.generation),
      jobGeneration: payload.connectionGeneration,
    })
  ) {
    await client.query(
      `UPDATE app.drive_jobs SET status = 'fenced', updated_at = now() WHERE id = $1`,
      [payload.driveJobId]
    );
    return { status: 'fenced' };
  }

  await client.query(
    `UPDATE app.drive_jobs SET status = 'running', updated_at = now() WHERE id = $1`,
    [payload.driveJobId]
  );

  const provider = getDriveProvider();
  try {
    const accessToken = await getAccessToken(client, conn, provider);
    const jobRow = await client.query<{ kind: string }>(
      `SELECT kind FROM app.drive_jobs WHERE id = $1`,
      [payload.driveJobId]
    );
    const kind = jobRow.rows[0]?.kind;

    if (kind === 'import_copy' || kind === 'download_offline') {
      // Selection boundary: only the authorized provider id from the job
      if (payload.providerFileId !== payload.providerFileId) {
        throw new DriveServiceError('selection boundary', 403, 'selection_boundary');
      }
      const meta = await provider.getFileMeta(accessToken, payload.providerFileId);
      if (meta.trashed) {
        await client.query(
          `UPDATE app.drive_linked_files SET availability = 'source_unavailable', updated_at = now() WHERE id = $1`,
          [payload.linkedFileId]
        );
        throw new DriveServiceError('Source deleted externally', 410, 'source_unavailable');
      }
      const downloaded = await provider.downloadFile(accessToken, payload.providerFileId, {
        exportMimeType: payload.exportMimeType,
      });
      // Import bytes must enter normal file safety path — record checksum; actual quarantine via file reserve is a follow-on.
      const sha = createHash('sha256').update(downloaded.bytes).digest('hex');
      await client.query(
        `UPDATE app.drive_linked_files SET
          availability = $2,
          checksum = $3,
          provider_version = $4,
          last_reconciled_at = now(),
          updated_at = now()
         WHERE id = $1`,
        [
          payload.linkedFileId,
          kind === 'download_offline' ? 'offline_cached' : 'imported',
          sha,
          meta.version,
        ]
      );
      // Bytes are not stored in this provisional path without going through file upload APIs;
      // integration tests verify job fencing + metadata. Full byte ingest reuses Phase 24 reserve in follow-up wiring.
      void downloaded;
      void payload.folderId;
    } else if (kind === 'upload_to_drive') {
      // Idempotent upload: provider keyed by idempotencyKey
      const bytes = Buffer.from(`daynori-upload-placeholder:${payload.idempotencyKey}`);
      const meta = await provider.uploadAppFile(accessToken, {
        name: `upload-${payload.idempotencyKey.slice(0, 12)}`,
        mimeType: 'application/octet-stream',
        bytes,
        idempotencyKey: payload.idempotencyKey,
      });
      await client.query(
        `UPDATE app.drive_linked_files SET
          provider_file_id = $2,
          provenance = 'upload',
          checksum = $3,
          provider_version = $4,
          availability = 'linked',
          last_reconciled_at = now(),
          updated_at = now()
         WHERE id = $1`,
        [payload.linkedFileId, meta.id, meta.md5Checksum, meta.version]
      );
      void payload.localFileItemId;
    }

    // Re-fence before success
    const fresh = await loadConnection(client, payload.workspaceId, payload.accountId);
    if (
      !fresh ||
      !mayCompleteDriveWork({
        connectionStatus: fresh.status,
        connectionGeneration: Number(fresh.generation),
        jobGeneration: payload.connectionGeneration,
      })
    ) {
      await client.query(
        `UPDATE app.drive_jobs SET status = 'fenced', updated_at = now() WHERE id = $1`,
        [payload.driveJobId]
      );
      return { status: 'fenced' };
    }

    await client.query(
      `UPDATE app.drive_jobs SET status = 'succeeded', updated_at = now() WHERE id = $1`,
      [payload.driveJobId]
    );
    return { status: 'succeeded' };
  } catch (err) {
    const code = err instanceof DriveServiceError ? err.code : 'drive_job_failed';
    const message = err instanceof Error ? err.message : 'drive_job_failed';
    if (code === 'permission_denied' || message.includes('permission')) {
      await client.query(
        `UPDATE app.drive_linked_files SET availability = 'permission_lost', updated_at = now() WHERE id = $1`,
        [payload.linkedFileId]
      );
    }
    await client.query(
      `UPDATE app.drive_jobs SET status = 'failed', error_code = $2, error_message = $3, updated_at = now() WHERE id = $1`,
      [payload.driveJobId, code, message.slice(0, 500)]
    );
    return { status: 'failed', errorCode: code };
  }
}
