/**
 * Shared Drive service internals (avoids circular imports between service and jobExecutor).
 */

import type { PoolClient } from 'pg';
import {
  mayCompleteDriveWork,
  type DriveConnectionStatus,
} from '@daynori/domain';
import {
  DriveProviderUnavailableError,
  type DriveProvider,
  type DriveTokenSet,
} from './provider.js';
import {
  sealDriveRefreshToken,
  unsealDriveRefreshToken,
} from './tokenCrypto.js';

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

export interface ConnectionRow {
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

const accessTokenCache = new Map<
  string,
  { token: string; expiresAt: number; generation: number }
>();
const refreshLocks = new Map<string, Promise<string>>();

export function clearDriveAccessTokenCache(connectionId?: string): void {
  if (connectionId) accessTokenCache.delete(connectionId);
  else accessTokenCache.clear();
}

export function cacheDriveAccessToken(
  connectionId: string,
  token: string,
  expiresAtMs: number,
  generation: number
): void {
  accessTokenCache.set(connectionId, { token, expiresAt: expiresAtMs, generation });
}

export async function loadConnectionRow(
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

async function markRevoked(
  client: PoolClient,
  conn: ConnectionRow,
  _reason: 'provider_revocation' | 'invalid_grant'
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
}

export async function getAccessTokenForConnection(
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
      if (
        err instanceof DriveProviderUnavailableError &&
        (err.code === 'invalid_grant' || err.message.includes('invalid_grant'))
      ) {
        await markRevoked(client, conn, 'invalid_grant');
      }
      throw new DriveServiceError(
        err instanceof Error ? err.message : 'refresh_failed',
        401,
        'refresh_failed'
      );
    }

    const fresh = await loadConnectionRow(client, conn.workspace_id, conn.account_id);
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
