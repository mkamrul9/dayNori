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
  readonly code: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'DriveProviderUnavailableError';
    this.code = code ?? message;
  }
}

const MAX_DRIVE_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const PROVIDER_FETCH_TIMEOUT_MS = 30_000;

async function fetchDrive(
  url: string,
  init: RequestInit & { maxBytes?: number } = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function classifyGoogleHttpError(status: number, bodyText: string): DriveProviderUnavailableError {
  const lower = bodyText.toLowerCase();
  if (status === 401 || lower.includes('invalid_grant') || lower.includes('invalid credentials')) {
    return new DriveProviderUnavailableError('invalid_grant', 'invalid_grant');
  }
  if (status === 429 || lower.includes('userratelimitexceeded') || lower.includes('ratelimitexceeded')) {
    return new DriveProviderUnavailableError('rate_limited', 'rate_limited');
  }
  if (status === 403) {
    if (
      lower.includes('storagequotaexceeded') ||
      lower.includes('storagequota') ||
      (lower.includes('quotaexceeded') && lower.includes('storage'))
    ) {
      return new DriveProviderUnavailableError('drive_quota_exceeded', 'drive_quota_exceeded');
    }
    if (lower.includes('ratelimit') || lower.includes('rate limit')) {
      return new DriveProviderUnavailableError('rate_limited', 'rate_limited');
    }
    if (
      lower.includes('permission') ||
      lower.includes('insufficientpermissions') ||
      lower.includes('accessnotconfigured') ||
      lower.includes('forbidden')
    ) {
      return new DriveProviderUnavailableError('permission_denied', 'permission_denied');
    }
    // Do not assume every 403 is quota exhaustion.
    return new DriveProviderUnavailableError('forbidden', 'forbidden');
  }
  if (status === 404) return new DriveProviderUnavailableError('not_found', 'not_found');
  return new DriveProviderUnavailableError(`http_${status}`, `http_${status}`);
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
      throw new DriveProviderUnavailableError('unauthorized', 'unauthorized');
    }
    if (this.deniedFileIds.has(fileId)) {
      throw new DriveProviderUnavailableError('permission_denied', 'permission_denied');
    }
    let row = this.files.get(fileId);
    // Labeled harness IDs may be selected before an explicit seed in UI tests.
    if (!row && fileId.startsWith('fake-harness-')) {
      this.seedAuthorizedFile(
        {
          id: fileId,
          name: 'Harness selected file',
          mimeType: 'text/plain',
          md5Checksum: 'harness',
          version: '1',
          trashed: false,
          isShortcut: false,
          isSharedDrive: false,
          shortcutTargetId: null,
        },
        Buffer.from('harness-bytes')
      );
      row = this.files.get(fileId);
    }
    if (!row) throw new DriveProviderUnavailableError('not_found', 'not_found');
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
    const res = await fetchDrive(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${fields}&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw classifyGoogleHttpError(res.status, text);
    }
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
        throw new DriveProviderUnavailableError('export_mime_required', 'export_mime_required');
      }
      const res = await fetchDrive(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(opts.exportMimeType)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw classifyGoogleHttpError(res.status, text);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_DRIVE_DOWNLOAD_BYTES) {
        throw new DriveProviderUnavailableError('download_too_large', 'bytes_too_large');
      }
      return {
        bytes: buf,
        mimeType: opts.exportMimeType,
        exportUsed: true,
      };
    }
    const res = await fetchDrive(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw classifyGoogleHttpError(res.status, text);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_DRIVE_DOWNLOAD_BYTES) {
      throw new DriveProviderUnavailableError('download_too_large', 'bytes_too_large');
    }
    return {
      bytes: buf,
      mimeType: meta.mimeType,
      exportUsed: false,
    };
  }

  async uploadAppFile(
    accessToken: string,
    input: { name: string; mimeType: string; bytes: Buffer; idempotencyKey: string }
  ): Promise<DriveProviderFileMeta> {
    // Reconcile prior upload by appProperties before creating a duplicate.
    const q = encodeURIComponent(
      `appProperties has { key='daynori_op' and value='${input.idempotencyKey.replace(/'/g, "\\'")}' } and trashed=false`
    );
    const existingRes = await fetchDrive(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,md5Checksum,version,trashed)&pageSize=1`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (existingRes.ok) {
      const existingJson = (await existingRes.json()) as {
        files?: Array<{
          id: string;
          name: string;
          mimeType: string;
          md5Checksum?: string;
          version?: string;
          trashed?: boolean;
        }>;
      };
      const hit = existingJson.files?.[0];
      if (hit) {
        return {
          id: hit.id,
          name: hit.name,
          mimeType: hit.mimeType,
          md5Checksum: hit.md5Checksum ?? null,
          version: hit.version ?? null,
          trashed: Boolean(hit.trashed),
          isShortcut: false,
          isSharedDrive: false,
          shortcutTargetId: null,
        };
      }
    }

    const boundary = `daynori_${randomBytes(8).toString('hex')}`;
    const meta = JSON.stringify({
      name: input.name,
      mimeType: input.mimeType,
      appProperties: { daynori_op: input.idempotencyKey },
    });
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`
      ),
      Buffer.from(`--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`),
      input.bytes,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const res = await fetchDrive(
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
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw classifyGoogleHttpError(res.status, text);
    }
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

  /**
   * Identity via Drive About API — compatible with drive.file without expanding to OpenID scopes.
   */
  private async tokenInfo(accessToken: string): Promise<{ sub: string; email: string }> {
    const res = await fetchDrive(
      'https://www.googleapis.com/drive/v3/about?fields=user',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw classifyGoogleHttpError(res.status, text);
    }
    const json = (await res.json()) as {
      user?: { permissionId?: string; emailAddress?: string; displayName?: string };
    };
    const sub = json.user?.permissionId;
    const email = json.user?.emailAddress;
    if (!sub || !email) {
      throw new DriveProviderUnavailableError('drive_about_user_incomplete', 'identity_incomplete');
    }
    return { sub, email };
  }
}

const DRIVE_PROVIDER_INJECTION_KEY = '__daynoriDriveProviderInjection';
const DRIVE_FAKE_SINGLETON_KEY = '__daynoriDriveFakeSingleton';

type DriveGlobal = typeof globalThis & {
  [DRIVE_PROVIDER_INJECTION_KEY]?: DriveProvider | null;
  [DRIVE_FAKE_SINGLETON_KEY]?: FakeGoogleDriveProvider | null;
};

function driveGlobal(): DriveGlobal {
  return globalThis as DriveGlobal;
}

function allowTestProviderInjection(): boolean {
  return (
    process.env['NODE_ENV'] === 'test' ||
    process.env['DAYNORI_ALLOW_DRIVE_TEST_INJECTION'] === 'true'
  );
}

export function setDriveProviderForTests(provider: DriveProvider | null): void {
  if (provider && !allowTestProviderInjection()) {
    throw new DriveProviderUnavailableError(
      'Drive test provider injection is confined to test/development execution.',
      'test_injection_forbidden'
    );
  }
  // Process-global so worker dynamic imports share the same injected provider as API tests.
  driveGlobal()[DRIVE_PROVIDER_INJECTION_KEY] = provider;
}

function unconfiguredStub(): DriveProvider {
  return {
    kind: 'unconfigured',
    buildAuthorizationUrl() {
      throw new DriveProviderUnavailableError(
        'Drive provider unconfigured. Set DAYNORI_DRIVE_PROVIDER=fake for non-production harness or configure production OAuth.',
        'provider_unconfigured'
      );
    },
    async exchangeAuthorizationCode() {
      throw new DriveProviderUnavailableError('Drive provider unconfigured', 'provider_unconfigured');
    },
    async refreshAccessToken() {
      throw new DriveProviderUnavailableError('Drive provider unconfigured', 'provider_unconfigured');
    },
    async revoke() {
      throw new DriveProviderUnavailableError('Drive provider unconfigured', 'provider_unconfigured');
    },
    async getFileMeta() {
      throw new DriveProviderUnavailableError('Drive provider unconfigured', 'provider_unconfigured');
    },
    async downloadFile() {
      throw new DriveProviderUnavailableError('Drive provider unconfigured', 'provider_unconfigured');
    },
    async uploadAppFile() {
      throw new DriveProviderUnavailableError('Drive provider unconfigured', 'provider_unconfigured');
    },
  };
}

/**
 * Resolve provider: test injection (test only) → fake harness (never in production) →
 * production Google when configured → otherwise unconfigured fail-closed stub.
 */
export function getDriveProvider(): DriveProvider {
  const injectedProvider = driveGlobal()[DRIVE_PROVIDER_INJECTION_KEY] ?? null;
  if (injectedProvider) {
    if (!allowTestProviderInjection()) {
      throw new DriveProviderUnavailableError(
        'Drive test provider injection is confined to test/development execution.',
        'test_injection_forbidden'
      );
    }
    return injectedProvider;
  }

  const mode = process.env['DAYNORI_DRIVE_PROVIDER']?.trim();
  const isProductionRuntime =
    process.env['NODE_ENV'] === 'production' ||
    process.env['DAYNORI_RUNTIME_ENV'] === 'production';

  if (mode === 'fake') {
    if (isProductionRuntime) {
      throw new DriveProviderUnavailableError(
        'Fake Drive provider is rejected in production runtimes.',
        'fake_provider_forbidden_in_production'
      );
    }
    const g = driveGlobal();
    if (!g[DRIVE_FAKE_SINGLETON_KEY]) {
      g[DRIVE_FAKE_SINGLETON_KEY] = new FakeGoogleDriveProvider();
    }
    return g[DRIVE_FAKE_SINGLETON_KEY]!;
  }

  try {
    return new GoogleDriveProvider();
  } catch (err) {
    if (err instanceof DriveProviderUnavailableError && err.code === 'fake_provider_forbidden_in_production') {
      throw err;
    }
    return unconfiguredStub();
  }
}

export { classifyGoogleHttpError, MAX_DRIVE_DOWNLOAD_BYTES, fetchDrive };
