import { describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { SupabaseObjectStore } from './supabaseStorage.js';
import { SupabaseStorageProvider } from '../modules/files/supabaseProvider.js';

const config = {
  url: 'https://storage.example.test',
  serviceRoleKey: 'server-only-test-credential',
  apiOrigin: 'https://api.example.test',
  signingSecret: crypto.randomBytes(32).toString('hex'),
};
const actorId = '00000000-0000-4000-8000-000000000001';
const path = `${actorId}/00000000-0000-4000-8000-000000000002/1/abc123`;

describe('private Supabase object transport', () => {
  it('uses server credentials and disallows redirects and overwrites', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    const store = new SupabaseObjectStore(config, transport);
    await store.putObject('private_assets', path, Buffer.from('test'), {
      contentType: 'text/plain',
      upsert: false,
    });
    expect(transport).toHaveBeenCalledWith(
      `${config.url}/storage/v1/object/private_assets/${path}`,
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({
          'x-upsert': 'false',
          Authorization: `Bearer ${config.serviceRoleKey}`,
        }),
      })
    );
  });
  it('distinguishes absent objects from failed provider reads and never exposes provider errors', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response('private-provider-detail', { status: 503 }))
      .mockRejectedValueOnce(new Error('secret URL and credential'));
    const store = new SupabaseObjectStore(config, transport);
    expect(await store.getObject('private_assets', path)).toBeNull();
    await expect(store.getObject('private_assets', path)).rejects.toThrow(
      'Private object read failed (503)'
    );
    await expect(store.getObject('private_assets', path)).rejects.toThrow(
      'Private object transport unavailable'
    );
  });
  it('rejects traversal and oversized provider metadata', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { headers: { 'content-length': '52428801' } }));
    const store = new SupabaseObjectStore(config, transport);
    await expect(store.getObject('private_assets', '../other')).rejects.toThrow(
      'Invalid private object location'
    );
    expect(transport).not.toHaveBeenCalled();
    await expect(store.headObject('private_assets', path)).rejects.toThrow(
      'Invalid private object size'
    );
  });
});

describe('durable scoped storage capabilities', () => {
  it('survives a replica restart and rechecks authorization and cancellation every time', async () => {
    const authorize = vi.fn().mockResolvedValue(true);
    const first = new SupabaseStorageProvider(config, authorize);
    const link = await first.createSignedUploadUrl('private_assets', path, {
      actorId,
      maxByteLimit: 100,
    });
    const token = new URL(link.signedUrl).searchParams.get('token')!;
    const replica = new SupabaseStorageProvider(config, authorize);
    expect(await replica.validateUploadToken(token, 'private_assets', path)).toEqual({
      isValid: true,
      maxByteLimit: 100,
      upsert: false,
    });
    authorize.mockResolvedValue(false);
    expect((await replica.validateUploadToken(token, 'private_assets', path)).isValid).toBe(false);
  });
  it('rejects modified tokens, another workspace, another operation and expired links before provider I/O', async () => {
    const authorize = vi.fn().mockResolvedValue(true);
    const provider = new SupabaseStorageProvider(config, authorize);
    const link = await provider.createSignedUploadUrl('private_assets', path, {
      actorId,
      maxByteLimit: 100,
      expiresInSeconds: -1,
    });
    const token = new URL(link.signedUrl).searchParams.get('token')!;
    expect((await provider.validateUploadToken(token, 'private_assets', path)).isValid).toBe(false);
    const valid = await provider.createSignedUploadUrl('private_assets', path, {
      actorId,
      maxByteLimit: 100,
    });
    const validToken = new URL(valid.signedUrl).searchParams.get('token')!;
    expect(
      (await provider.validateUploadToken(`x${validToken}`, 'private_assets', path)).isValid
    ).toBe(false);
    expect(
      (await provider.validateUploadToken(validToken, 'private_assets', `${actorId}/another`))
        .isValid
    ).toBe(false);
    expect((await provider.validateDownloadToken(validToken, 'private_assets', path)).isValid).toBe(
      false
    );
    expect(authorize).not.toHaveBeenCalled();
  });
});
