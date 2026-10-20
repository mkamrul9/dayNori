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
  type DriveTokenSet,
} from './provider.js';

export { processDriveBackgroundJob, executeDriveBackgroundJob } from './jobExecutor.js';
import {
  DriveTokenEncryptionUnavailableError,
  isDriveTokenEncryptionConfigured,
  sealDriveRefreshToken,
  unsealDriveRefreshToken,
} from './tokenCrypto.js';

const INTENT_TTL_MS = 10 * 60 * 1000;
const ALLOWED_RETURN_PREFIXES = ['/settings', '/connections', '/library', '/dev/drive-harness'];

import {
  DriveServiceError,
  loadConnectionRow,
  getAccessTokenForConnection,
  cacheDriveAccessToken,
  clearDriveAccessTokenCache,
  type ConnectionRow,
} from './serviceInternals.js';

export {
  DriveServiceError,
  loadConnectionRow,
  getAccessTokenForConnection,
  type ConnectionRow,
};

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
  return loadConnectionRow(client, workspaceId, accountId);
}

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

  // Cache short-lived access token in memory only; never persist access tokens.
  cacheDriveAccessToken(
    conn.id,
    tokens.accessToken,
    tokens.expiresAt.getTime(),
    Number(conn.generation)
  );

  const updated = await loadConnection(client, input.workspaceId, input.accountId);
  return toConnectionDto(updated, input.workspaceId);
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

  // Fence and wipe locally FIRST so late refresh/jobs cannot resurrect, then best-effort revoke.
  let refreshForRevoke: string | null = null;
  if (conn.refresh_token_ciphertext && conn.refresh_token_key_version) {
    try {
      refreshForRevoke = unsealDriveRefreshToken(
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
    } catch {
      refreshForRevoke = null;
    }
  }

  await client.query(
    `UPDATE app.drive_connections SET
      status = 'disconnected',
      generation = generation + 1,
      refresh_token_ciphertext = NULL,
      refresh_token_key_version = NULL,
      disconnected_at = now(),
      provider_revoke_status = 'pending',
      updated_at = now()
     WHERE id = $1`,
    [conn.id]
  );
  clearDriveAccessTokenCache(conn.id);

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

  // Bounded best-effort provider revoke AFTER local fence; local success does not require confirmed revoke.
  if (refreshForRevoke) {
    try {
      const revokeTimeout = new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), 5_000)
      );
      const revokeResult = await Promise.race([
        getDriveProvider()
          .revoke(refreshForRevoke)
          .then(() => 'ok' as const)
          .catch(() => 'failed' as const),
        revokeTimeout,
      ]);
      await client.query(
        `UPDATE app.drive_connections SET provider_revoke_status = $2, updated_at = now() WHERE id = $1`,
        [
          conn.id,
          revokeResult === 'ok' ? 'confirmed' : revokeResult === 'timeout' ? 'failed' : 'failed',
        ]
      );
    } catch {
      await client.query(
        `UPDATE app.drive_connections SET provider_revoke_status = 'failed', updated_at = now() WHERE id = $1`,
        [conn.id]
      );
    }
  } else {
    await client.query(
      `UPDATE app.drive_connections SET provider_revoke_status = 'skipped', updated_at = now() WHERE id = $1`,
      [conn.id]
    );
  }

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
  const accessToken = await getAccessTokenForConnection(client, conn, provider);
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

  // Reject vault targets before provider I/O
  if (input.request.localFileItemId) {
    const item = await client.query<{ kind: string }>(
      `SELECT kind FROM app.items WHERE id = $1 AND workspace_id = $2`,
      [input.request.localFileItemId, input.workspaceId]
    );
    if (item.rows[0] && isVaultDriveTarget(item.rows[0].kind)) {
      throw new DriveServiceError('Vault content cannot use Drive connector', 403, 'vault_excluded');
    }
  }

  // Authoritative provider metadata — do not trust client MIME/shortcut/shared-drive flags alone.
  const provider = getDriveProvider();
  const accessToken = await getAccessTokenForConnection(client, conn, provider);
  let authoritative;
  try {
    authoritative = await provider.getFileMeta(accessToken, input.request.providerFileId);
  } catch (err) {
    const code = err instanceof DriveProviderUnavailableError ? err.code : 'provider_meta_failed';
    throw new DriveServiceError(
      err instanceof Error ? err.message : 'provider_meta_failed',
      400,
      code
    );
  }

  const support = evaluateSelectedObjectSupport({
    providerFileId: authoritative.id,
    mimeType: authoritative.mimeType,
    name: authoritative.name,
    isShortcut: authoritative.isShortcut,
    isSharedDrive: authoritative.isSharedDrive,
    md5Checksum: authoritative.md5Checksum,
    version: authoritative.version,
  });
  if (!support.supported) {
    throw new DriveServiceError(support.reason ?? 'unsupported', 400, 'unsupported_object');
  }
  if (authoritative.trashed) {
    throw new DriveServiceError('Selected source is trashed', 410, 'source_unavailable');
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
      authoritative.id,
      authoritative.name,
      authoritative.mimeType,
      provenance,
      input.request.linkMode,
      authoritative.version,
      authoritative.md5Checksum,
      input.request.localFileItemId ?? null,
      'linked',
    ]
  );
  const linked = mapLinked(upsert.rows[0]!);

  if (!isProviderObjectAuthorized(new Set([authoritative.id]), linked.providerFileId)) {
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

/**
 * Complete OAuth by state token (server callback path). Intent is looked up by state —
 * authorization codes are not copied into general application URLs.
 */
export async function completeDriveConnectByState(
  client: PoolClient,
  input: {
    workspaceId: string;
    accountId: string;
    state: string;
    code?: string;
    error?: string;
  }
): Promise<DriveConnection> {
  const intentRes = await client.query<{ id: string }>(
    `SELECT id FROM app.drive_auth_intents
     WHERE state_token = $1 AND workspace_id = $2 AND account_id = $3`,
    [input.state, input.workspaceId, input.accountId]
  );
  const intent = intentRes.rows[0];
  if (!intent) {
    throw new DriveServiceError('Auth intent not found for state', 404, 'intent_not_found');
  }
  return completeDriveConnect(client, {
    workspaceId: input.workspaceId,
    accountId: input.accountId,
    request: {
      intentId: intent.id,
      state: input.state,
      code: input.code,
      error: input.error,
    },
  });
}

/**
 * Client acknowledges durable offline cache of an imported Drive file.
 * Server download alone never sets offline_cached.
 */
export async function acknowledgeDriveOfflineCache(
  client: PoolClient,
  input: { workspaceId: string; accountId: string; linkedFileId: string }
): Promise<DriveLinkedFile> {
  await requireWorkspaceRole(client, input.workspaceId, 'editor');
  const res = await client.query(
    `UPDATE app.drive_linked_files SET
       availability = 'offline_cached',
       last_reconciled_at = now(),
       updated_at = now()
     WHERE id = $1 AND workspace_id = $2 AND account_id = $3
       AND availability = 'pending_offline'
       AND local_file_item_id IS NOT NULL
     RETURNING *`,
    [input.linkedFileId, input.workspaceId, input.accountId]
  );
  if (!res.rows[0]) {
    throw new DriveServiceError(
      'Linked file is not awaiting offline acknowledgment',
      400,
      'offline_ack_invalid'
    );
  }
  return mapLinked(res.rows[0]);
}
