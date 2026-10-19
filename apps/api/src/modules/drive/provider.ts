/**
 * Google Drive provider adapter — production fails closed without OAuth config.
 * Fake provider is for tests / explicitly labeled development harnesses only.
 */

import { createHash, randomBytes } from 'node:crypto';
import {
  DRIVE_FILE_SCOPE,
  validateGrantedDriveScopes,
  validateRequestedDriveScopes,
} from '@daynori/domain';

export type DriveProviderKind = 'unconfigured' | 'fake' | 'google_production';

export interface DriveTokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string;
  providerSubject: string;
  providerAccountEmail: string;
}

export interface DriveProviderFileMeta {
  id: string;
  name: string;
  mimeType: string;
  md5Checksum: string | null;
  version: string | null;
  trashed: boolean;
  isShortcut: boolean;
  isSharedDrive: boolean;
  shortcutTargetId: string | null;
}

export interface DriveProvider {
  kind: DriveProviderKind;
  buildAuthorizationUrl(input: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
    loginHint?: string;
  }): string;
  exchangeAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<DriveTokenSet>;
  refreshAccessToken(refreshToken: string): Promise<DriveTokenSet>;
  revoke(refreshToken: string): Promise<void>;
  getFileMeta(accessToken: string, fileId: string): Promise<DriveProviderFileMeta>;
  downloadFile(
    accessToken: string,
    fileId: string,
    opts?: { exportMimeType?: string | null }
  ): Promise<{ bytes: Buffer; mimeType: string; exportUsed: boolean }>;
  uploadAppFile(
    accessToken: string,
    input: { name: string; mimeType: string; bytes: Buffer; idempotencyKey: string }
  ): Promise<DriveProviderFileMeta>;
}

export class DriveProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriveProviderUnavailableError';
  }
}

/** Deterministic fake Google provider for tests / labeled harness. Never a real connection. */
export class FakeGoogleDriveProvider implements DriveProvider {
  readonly kind: DriveProviderKind = 'fake';
  private refreshToAccess = new Map<string, DriveTokenSet>();
  private files = new Map<string, { meta: DriveProviderFileMeta; bytes: Buffer }>();
  private uploadKeys = new Map<string, string>(); // idempotency -> file id
  deniedFileIds = new Set<string>();
  quotaExceeded = false;

  buildAuthorizationUrl(input: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string {
    const u = new URL('https://fake-google.daynori.test/o/oauth2/v2/auth');
    u.searchParams.set('client_id', 'fake-client');
    u.searchParams.set('redirect_uri', input.redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', DRIVE_FILE_SCOPE);
    u.searchParams.set('state', input.state);
    u.searchParams.set('code_challenge', input.codeChallenge);
    u.searchParams.set('code_challenge_method', 'S256');
    u.searchParams.set('access_type', 'offline');
    u.searchParams.set('prompt', 'consent');
    return u.toString();
  }

  async exchangeAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<DriveTokenSet> {
    void input.redirectUri;
    if (input.code === 'denied') {
      throw new DriveProviderUnavailableError('access_denied');
    }
    if (input.code.startsWith('broad-scope:')) {
      throw new DriveProviderUnavailableError('granted_scope_broader_than_approved');
    }
    // PKCE binding: code must equal sha256(verifier) prefix for fake harness
    const expected = createHash('sha256').update(input.codeVerifier).digest('hex').slice(0, 16);
    if (input.code !== `fake-ok-${expected}` && input.code !== 'fake-ok') {
      throw new DriveProviderUnavailableError('invalid_grant');
    }
    const refresh = `fake-refresh-${randomBytes(8).toString('hex')}`;
    const tokens: DriveTokenSet = {
      accessToken: `fake-access-${randomBytes(8).toString('hex')}`,
      refreshToken: refresh,
      expiresAt: new Date(Date.now() + 3600_000),
      scope: DRIVE_FILE_SCOPE,
      providerSubject: 'fake-subject-001',
      providerAccountEmail: 'drive-fixture@daynori.test',
    };
    this.refreshToAccess.set(refresh, tokens);
    return tokens;
  }

  async refreshAccessToken(refreshToken: string): Promise<DriveTokenSet> {
    const prev = this.refreshToAccess.get(refreshToken);
    if (!prev) throw new DriveProviderUnavailableError('invalid_grant');
    const next: DriveTokenSet = {
      ...prev,
      accessToken: `fake-access-${randomBytes(8).toString('hex')}`,
      // Simulate Google sometimes omitting refresh_token on refresh
      refreshToken: null,
      expiresAt: new Date(Date.now() + 3600_000),
    };
    this.refreshToAccess.set(refreshToken, { ...next, refreshToken });
    return next;
  }

  async revoke(refreshToken: string): Promise<void> {
    this.refreshToAccess.delete(refreshToken);
  }

  seedAuthorizedFile(meta: DriveProviderFileMeta, bytes: Buffer): void {
    this.files.set(meta.id, { meta, bytes });
  }

  async getFileMeta(accessToken: string, fileId: string): Promise<DriveProviderFileMeta> {
    if (!accessToken.startsWith('fake-access-')) {
      throw new DriveProviderUnavailableError('unauthorized');
    }
    if (this.deniedFileIds.has(fileId)) {
      throw new DriveProviderUnavailableError('permission_denied');
    }
    const row = this.files.get(fileId);
    if (!row) throw new DriveProviderUnavailableError('not_found');
    return row.meta;
  }

  async downloadFile(
    accessToken: string,
    fileId: string,
    opts?: { exportMimeType?: string | null }
  ): Promise<{ bytes: Buffer; mimeType: string; exportUsed: boolean }> {
    const meta = await this.getFileMeta(accessToken, fileId);
    const row = this.files.get(fileId)!;
    if (meta.mimeType.startsWith('application/vnd.google-apps.')) {
      if (!opts?.exportMimeType) {
        throw new DriveProviderUnavailableError('export_mime_required');
      }
      return { bytes: row.bytes, mimeType: opts.exportMimeType, exportUsed: true };
    }
    return { bytes: row.bytes, mimeType: meta.mimeType, exportUsed: false };
  }

  async uploadAppFile(
    accessToken: string,
    input: { name: string; mimeType: string; bytes: Buffer; idempotencyKey: string }
  ): Promise<DriveProviderFileMeta> {
    if (!accessToken.startsWith('fake-access-')) {
      throw new DriveProviderUnavailableError('unauthorized');
    }
    if (this.quotaExceeded) {
      throw new DriveProviderUnavailableError('drive_quota_exceeded');
    }
    const existing = this.uploadKeys.get(input.idempotencyKey);
    if (existing) {
      return this.files.get(existing)!.meta;
    }
    const id = `fake-file-${randomBytes(6).toString('hex')}`;
    const meta: DriveProviderFileMeta = {
      id,
      name: input.name,
      mimeType: input.mimeType,
      md5Checksum: createHash('md5').update(input.bytes).digest('hex'),
      version: '1',
      trashed: false,
      isShortcut: false,
      isSharedDrive: false,
      shortcutTargetId: null,
    };
    this.files.set(id, { meta, bytes: input.bytes });
    this.uploadKeys.set(input.idempotencyKey, id);
    return meta;
  }
}

/** Production Google provider — fails closed when OAuth client env is missing. */
export class GoogleDriveProvider implements DriveProvider {
  readonly kind: DriveProviderKind = 'google_production';

  private clientId: string;
  private clientSecret: string;

  constructor() {
    const clientId = process.env['DAYNORI_DRIVE_OAUTH_CLIENT_ID']?.trim();
    const clientSecret = process.env['DAYNORI_DRIVE_OAUTH_CLIENT_SECRET']?.trim();
    if (!clientId || !clientSecret) {
      throw new DriveProviderUnavailableError(
        'Google Drive production provider is unconfigured (DAYNORI_DRIVE_OAUTH_CLIENT_ID/SECRET).'
      );
    }
    // Acceptance prerequisites (verification / live scope proof) also gate enablement.
    if (process.env['DAYNORI_DRIVE_PRODUCTION_ENABLED'] !== 'true') {
      throw new DriveProviderUnavailableError(
        'Google Drive production provider disabled until DAYNORI_DRIVE_PRODUCTION_ENABLED=true and acceptance prerequisites are met.'
      );
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  buildAuthorizationUrl(input: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
    loginHint?: string;
  }): string {
    const requested = DRIVE_FILE_SCOPE;
    const v = validateRequestedDriveScopes(requested);
    if (!v.ok) throw new Error(v.message);
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.searchParams.set('client_id', this.clientId);
    u.searchParams.set('redirect_uri', input.redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', requested);
    u.searchParams.set('state', input.state);
    u.searchParams.set('code_challenge', input.codeChallenge);
    u.searchParams.set('code_challenge_method', 'S256');
    u.searchParams.set('access_type', 'offline');
    u.searchParams.set('prompt', 'consent');
    u.searchParams.set('include_granted_scopes', 'false');
    if (input.loginHint) u.searchParams.set('login_hint', input.loginHint);
    return u.toString();
  }

  async exchangeAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<DriveTokenSet> {
    const body = new URLSearchParams({
      code: input.code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: input.codeVerifier,
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new DriveProviderUnavailableError(`token_exchange_${res.status}`);
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!json.access_token || !json.refresh_token) {
      throw new DriveProviderUnavailableError('token_response_incomplete');
    }
    const grant = validateGrantedDriveScopes(json.scope ?? '', { allowOpenIdExtras: true });
    if (!grant.ok) throw new DriveProviderUnavailableError(grant.message);
    const info = await this.tokenInfo(json.access_token);
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000),
      scope: json.scope ?? DRIVE_FILE_SCOPE,
      providerSubject: info.sub,
      providerAccountEmail: info.email,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<DriveTokenSet> {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new DriveProviderUnavailableError(`refresh_${res.status}`);
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!json.access_token) throw new DriveProviderUnavailableError('refresh_incomplete');
    if (json.scope) {
      const grant = validateGrantedDriveScopes(json.scope, { allowOpenIdExtras: true });
      if (!grant.ok) throw new DriveProviderUnavailableError(grant.message);
    }
    const info = await this.tokenInfo(json.access_token);
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000),
      scope: json.scope ?? DRIVE_FILE_SCOPE,
      providerSubject: info.sub,
      providerAccountEmail: info.email,
    };
  }

  async revoke(refreshToken: string): Promise<void> {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  }

  async getFileMeta(accessToken: string, fileId: string): Promise<DriveProviderFileMeta> {
    const fields =
      'id,name,mimeType,md5Checksum,version,trashed,shortcutDetails,driveId';
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${fields}&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new DriveProviderUnavailableError(`meta_${res.status}`);
    const json = (await res.json()) as {
      id: string;
      name: string;
      mimeType: string;
      md5Checksum?: string;
      version?: string;
      trashed?: boolean;
      shortcutDetails?: { targetId?: string };
      driveId?: string;
    };
    return {
      id: json.id,
      name: json.name,
      mimeType: json.mimeType,
      md5Checksum: json.md5Checksum ?? null,
      version: json.version ?? null,
      trashed: Boolean(json.trashed),
      isShortcut: json.mimeType === 'application/vnd.google-apps.shortcut',
      isSharedDrive: Boolean(json.driveId),
      shortcutTargetId: json.shortcutDetails?.targetId ?? null,
    };
  }

  async downloadFile(
    accessToken: string,
    fileId: string,
    opts?: { exportMimeType?: string | null }
  ): Promise<{ bytes: Buffer; mimeType: string; exportUsed: boolean }> {
    const meta = await this.getFileMeta(accessToken, fileId);
    if (meta.mimeType.startsWith('application/vnd.google-apps.')) {
      if (!opts?.exportMimeType) {
        throw new DriveProviderUnavailableError('export_mime_required');
      }
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(opts.exportMimeType)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new DriveProviderUnavailableError(`export_${res.status}`);
      return {
        bytes: Buffer.from(await res.arrayBuffer()),
        mimeType: opts.exportMimeType,
        exportUsed: true,
      };
    }
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new DriveProviderUnavailableError(`download_${res.status}`);
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      mimeType: meta.mimeType,
      exportUsed: false,
    };
  }

  async uploadAppFile(
    accessToken: string,
    input: { name: string; mimeType: string; bytes: Buffer; idempotencyKey: string }
  ): Promise<DriveProviderFileMeta> {
    // Multipart upload with idempotency via custom property checked by caller persistence.
    void input.idempotencyKey;
    const boundary = `daynori_${randomBytes(8).toString('hex')}`;
    const meta = JSON.stringify({ name: input.name, mimeType: input.mimeType });
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`
      ),
      Buffer.from(`--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`),
      input.bytes,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,md5Checksum,version,trashed',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );
    if (res.status === 403) throw new DriveProviderUnavailableError('drive_quota_exceeded');
    if (!res.ok) throw new DriveProviderUnavailableError(`upload_${res.status}`);
    const json = (await res.json()) as DriveProviderFileMeta & {
      md5Checksum?: string;
      version?: string;
      trashed?: boolean;
    };
    return {
      id: json.id,
      name: json.name,
      mimeType: json.mimeType,
      md5Checksum: json.md5Checksum ?? null,
      version: json.version ?? null,
      trashed: Boolean(json.trashed),
      isShortcut: false,
      isSharedDrive: false,
      shortcutTargetId: null,
    };
  }

  private async tokenInfo(accessToken: string): Promise<{ sub: string; email: string }> {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/userinfo`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new DriveProviderUnavailableError(`userinfo_${res.status}`);
    const json = (await res.json()) as { sub?: string; email?: string };
    if (!json.sub || !json.email) throw new DriveProviderUnavailableError('userinfo_incomplete');
    return { sub: json.sub, email: json.email };
  }
}

let injectedProvider: DriveProvider | null = null;

export function setDriveProviderForTests(provider: DriveProvider | null): void {
  injectedProvider = provider;
}

/**
 * Resolve provider: explicit test injection → fake when DAYNORI_DRIVE_PROVIDER=fake →
 * production Google when configured → otherwise unconfigured fail-closed stub.
 */
export function getDriveProvider(): DriveProvider {
  if (injectedProvider) return injectedProvider;
  const mode = process.env['DAYNORI_DRIVE_PROVIDER']?.trim();
  if (mode === 'fake') {
    return new FakeGoogleDriveProvider();
  }
  try {
    return new GoogleDriveProvider();
  } catch {
    return {
      kind: 'unconfigured',
      buildAuthorizationUrl() {
        throw new DriveProviderUnavailableError(
          'Drive provider unconfigured. Set DAYNORI_DRIVE_PROVIDER=fake for harness or configure production OAuth.'
        );
      },
      async exchangeAuthorizationCode() {
        throw new DriveProviderUnavailableError('Drive provider unconfigured');
      },
      async refreshAccessToken() {
        throw new DriveProviderUnavailableError('Drive provider unconfigured');
      },
      async revoke() {
        throw new DriveProviderUnavailableError('Drive provider unconfigured');
      },
      async getFileMeta() {
        throw new DriveProviderUnavailableError('Drive provider unconfigured');
      },
      async downloadFile() {
        throw new DriveProviderUnavailableError('Drive provider unconfigured');
      },
      async uploadAppFile() {
        throw new DriveProviderUnavailableError('Drive provider unconfigured');
      },
    };
  }
}
