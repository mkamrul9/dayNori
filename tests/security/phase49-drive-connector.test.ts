/**
 * Phase 49 — Drive selected-file connector (domain + token crypto + fake provider).
 * Live Google account verification is separate and unexecuted without owner OAuth.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  DRIVE_FILE_SCOPE,
  assertDriveScopesForConnect,
  disconnectExplanation,
  evaluateSelectedObjectSupport,
  isAuthIntentUsable,
  isProviderObjectAuthorized,
  isVaultDriveTarget,
  mayCompleteDriveWork,
  validateRequestedDriveScopes,
  validateGrantedDriveScopes,
} from '@daynori/domain';
import {
  sealDriveRefreshToken,
  unsealDriveRefreshToken,
  DriveTokenEncryptionUnavailableError,
  isDriveTokenEncryptionConfigured,
} from '../../apps/api/src/modules/drive/tokenCrypto.js';
import {
  FakeGoogleDriveProvider,
  GoogleDriveProvider,
  classifyGoogleHttpError,
  setDriveProviderForTests,
  getDriveProvider,
} from '../../apps/api/src/modules/drive/provider.js';

describe('Phase 49 Drive connector domain', () => {
  it('rejects broader scopes and lookalike URIs', () => {
    expect(validateRequestedDriveScopes(DRIVE_FILE_SCOPE).ok).toBe(true);
    expect(
      validateRequestedDriveScopes(
        `${DRIVE_FILE_SCOPE} https://www.googleapis.com/auth/drive`
      ).ok
    ).toBe(false);
    expect(validateGrantedDriveScopes(`${DRIVE_FILE_SCOPE} https://www.googleapis.com/auth/drive`).ok).toBe(
      false
    );
    expect(() =>
      assertDriveScopesForConnect(DRIVE_FILE_SCOPE, `${DRIVE_FILE_SCOPE} openid`)
    ).not.toThrow();
  });

  it('fences disconnect generations and vault exclusion', () => {
    expect(
      mayCompleteDriveWork({
        connectionStatus: 'disconnected',
        connectionGeneration: 2,
        jobGeneration: 1,
      })
    ).toBe(false);
    expect(
      mayCompleteDriveWork({
        connectionStatus: 'connected',
        connectionGeneration: 3,
        jobGeneration: 3,
      })
    ).toBe(true);
    expect(isVaultDriveTarget('vault_item')).toBe(true);
    expect(isProviderObjectAuthorized(new Set(['a']), 'b')).toBe(false);
    expect(evaluateSelectedObjectSupport({
      providerFileId: 'x',
      mimeType: 'application/vnd.google-apps.shortcut',
      name: 's',
      isShortcut: true,
      isSharedDrive: false,
      md5Checksum: null,
      version: null,
    }).supported).toBe(false);
  });

  it('rejects replayed/expired auth intents', () => {
    const base = {
      boundAccountId: 'a',
      boundWorkspaceId: 'w',
      actorAccountId: 'a',
      actorWorkspaceId: 'w',
      expiresAtMs: Date.now() + 60_000,
      nowMs: Date.now(),
      status: 'pending' as const,
    };
    expect(isAuthIntentUsable(base).ok).toBe(true);
    expect(isAuthIntentUsable({ ...base, status: 'consumed' }).ok).toBe(false);
    expect(isAuthIntentUsable({ ...base, nowMs: Date.now() + 120_000 }).ok).toBe(false);
    expect(isAuthIntentUsable({ ...base, actorWorkspaceId: 'other' }).ok).toBe(false);
  });

  it('explains retained copies on disconnect', () => {
    const expl = disconnectExplanation('local_disconnect');
    expect(expl.tokensRemoved).toBe(true);
    expect(expl.remoteOriginalDeleted).toBe(false);
    expect(expl.retainedImportedCopies).toBe(true);
    expect(expl.message.length).toBeGreaterThan(20);
  });
});

describe('Phase 49 Drive token encryption', () => {
  const prevKey = process.env['DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY'];
  const prevVer = process.env['DAYNORI_DRIVE_TOKEN_KEY_VERSION'];

  beforeEach(() => {
    process.env['DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY'] = randomBytes(32).toString('base64');
    process.env['DAYNORI_DRIVE_TOKEN_KEY_VERSION'] = 'v1-test';
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env['DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY'];
    else process.env['DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY'] = prevKey;
    if (prevVer === undefined) delete process.env['DAYNORI_DRIVE_TOKEN_KEY_VERSION'];
    else process.env['DAYNORI_DRIVE_TOKEN_KEY_VERSION'] = prevVer;
  });

  it('seals with tenant binding and refuses missing config', () => {
    expect(isDriveTokenEncryptionConfigured()).toBe(true);
    const sealed = sealDriveRefreshToken('refresh-secret', {
      workspaceId: 'ws',
      connectionId: 'conn',
      accountId: 'acct',
    });
    expect(sealed.ciphertext).not.toContain('refresh-secret');
    const plain = unsealDriveRefreshToken(sealed, {
      workspaceId: 'ws',
      connectionId: 'conn',
      accountId: 'acct',
    });
    expect(plain).toBe('refresh-secret');
    expect(() =>
      unsealDriveRefreshToken(sealed, {
        workspaceId: 'other',
        connectionId: 'conn',
        accountId: 'acct',
      })
    ).toThrow();

    delete process.env['DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY'];
    expect(() =>
      sealDriveRefreshToken('x', { workspaceId: 'ws', connectionId: 'c', accountId: 'a' })
    ).toThrow(DriveTokenEncryptionUnavailableError);
  });
});

describe('Phase 49 fake Google provider', () => {
  afterEach(() => {
    setDriveProviderForTests(null);
  });

  it('supports PKCE exchange, refresh without replacement token, and idempotent upload', async () => {
    const fake = new FakeGoogleDriveProvider();
    setDriveProviderForTests(fake);
    const tokens = await fake.exchangeAuthorizationCode({
      code: 'fake-ok',
      codeVerifier: 'verifier',
      redirectUri: 'http://127.0.0.1/callback',
    });
    expect(tokens.scope).toBe(DRIVE_FILE_SCOPE);
    expect(tokens.refreshToken).toBeTruthy();

    const refreshed = await fake.refreshAccessToken(tokens.refreshToken!);
    expect(refreshed.accessToken).toBeTruthy();
    expect(refreshed.refreshToken).toBeNull();

    fake.seedAuthorizedFile(
      {
        id: 'file-1',
        name: 'a.txt',
        mimeType: 'text/plain',
        md5Checksum: 'abc',
        version: '1',
        trashed: false,
        isShortcut: false,
        isSharedDrive: false,
        shortcutTargetId: null,
      },
      Buffer.from('hello')
    );
    const dl = await fake.downloadFile(tokens.accessToken, 'file-1');
    expect(dl.bytes.toString()).toBe('hello');

    const up1 = await fake.uploadAppFile(tokens.accessToken, {
      name: 'u.txt',
      mimeType: 'text/plain',
      bytes: Buffer.from('x'),
      idempotencyKey: 'idem-1',
    });
    const up2 = await fake.uploadAppFile(tokens.accessToken, {
      name: 'u.txt',
      mimeType: 'text/plain',
      bytes: Buffer.from('x'),
      idempotencyKey: 'idem-1',
    });
    expect(up1.id).toBe(up2.id);

    fake.quotaExceeded = true;
    await expect(
      fake.uploadAppFile(tokens.accessToken, {
        name: 'q.txt',
        mimeType: 'text/plain',
        bytes: Buffer.from('q'),
        idempotencyKey: 'idem-q',
      })
    ).rejects.toThrow(/drive_quota_exceeded/);
  });
});

describe('Phase 49 Google HTTP error classification', () => {
  it('does not treat every 403 as quota exhaustion', () => {
    expect(classifyGoogleHttpError(403, 'storageQuotaExceeded').code).toBe('drive_quota_exceeded');
    expect(classifyGoogleHttpError(403, 'Insufficient Permissions').code).toBe('permission_denied');
    expect(classifyGoogleHttpError(403, 'userRateLimitExceeded').code).toBe('rate_limited');
    expect(classifyGoogleHttpError(403, 'mysterious').code).toBe('forbidden');
    expect(classifyGoogleHttpError(401, 'invalid_grant').code).toBe('invalid_grant');
    expect(classifyGoogleHttpError(429, 'slow down').code).toBe('rate_limited');
  });

  it('rejects fake provider selection in production', () => {
    setDriveProviderForTests(null);
    const prevNode = process.env['NODE_ENV'];
    const prevInject = process.env['DAYNORI_ALLOW_DRIVE_TEST_INJECTION'];
    const prevMode = process.env['DAYNORI_DRIVE_PROVIDER'];
    process.env['NODE_ENV'] = 'production';
    delete process.env['DAYNORI_ALLOW_DRIVE_TEST_INJECTION'];
    process.env['DAYNORI_DRIVE_PROVIDER'] = 'fake';
    expect(() => getDriveProvider()).toThrow(/Fake Drive provider is rejected/);
    process.env['NODE_ENV'] = prevNode;
    if (prevInject === undefined) delete process.env['DAYNORI_ALLOW_DRIVE_TEST_INJECTION'];
    else process.env['DAYNORI_ALLOW_DRIVE_TEST_INJECTION'] = prevInject;
    process.env['DAYNORI_DRIVE_PROVIDER'] = prevMode;
  });
});

describe('Phase 49 Google adapter (transport-mocked)', () => {
  const prevFetch = globalThis.fetch;
  const prevEnabled = process.env['DAYNORI_DRIVE_PRODUCTION_ENABLED'];
  const prevId = process.env['DAYNORI_DRIVE_OAUTH_CLIENT_ID'];
  const prevSecret = process.env['DAYNORI_DRIVE_OAUTH_CLIENT_SECRET'];

  beforeEach(() => {
    process.env['DAYNORI_DRIVE_PRODUCTION_ENABLED'] = 'true';
    process.env['DAYNORI_DRIVE_OAUTH_CLIENT_ID'] = 'test-client';
    process.env['DAYNORI_DRIVE_OAUTH_CLIENT_SECRET'] = 'test-secret';
  });

  afterEach(() => {
    globalThis.fetch = prevFetch;
    if (prevEnabled === undefined) delete process.env['DAYNORI_DRIVE_PRODUCTION_ENABLED'];
    else process.env['DAYNORI_DRIVE_PRODUCTION_ENABLED'] = prevEnabled;
    if (prevId === undefined) delete process.env['DAYNORI_DRIVE_OAUTH_CLIENT_ID'];
    else process.env['DAYNORI_DRIVE_OAUTH_CLIENT_ID'] = prevId;
    if (prevSecret === undefined) delete process.env['DAYNORI_DRIVE_OAUTH_CLIENT_SECRET'];
    else process.env['DAYNORI_DRIVE_OAUTH_CLIENT_SECRET'] = prevSecret;
  });

  it('reconciles prior upload by appProperties instead of duplicating', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/drive/v3/files?q=')) {
        return new Response(
          JSON.stringify({
            files: [
              {
                id: 'existing-op',
                name: 'prior.txt',
                mimeType: 'text/plain',
                md5Checksum: 'abc',
                version: '2',
                trashed: false,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('unexpected', { status: 500 });
    }) as typeof fetch;

    const provider = new GoogleDriveProvider();
    const meta = await provider.uploadAppFile('ya29.test', {
      name: 'prior.txt',
      mimeType: 'text/plain',
      bytes: Buffer.from('x'),
      idempotencyKey: 'op-key-1',
    });
    expect(meta.id).toBe('existing-op');
    expect(calls.some((c) => c.includes('upload/drive'))).toBe(false);
  });

  it('classifies permission failures on metadata fetch', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'Insufficient Permissions' } }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;
    const provider = new GoogleDriveProvider();
    await expect(provider.getFileMeta('ya29.test', 'file-1')).rejects.toMatchObject({
      code: 'permission_denied',
    });
  });
});
