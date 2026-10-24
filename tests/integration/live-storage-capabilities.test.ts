import crypto from 'node:crypto';
import { buildServer } from '../../apps/api/src/server.js';
import { SafeLogger } from '../../apps/api/src/plugins/logger.js';
import { DaynoriWorker } from '../../apps/worker/src/worker.js';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import {
  createAdminPool,
  createRuntimePool,
  withTenantContext,
} from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createConfiguredStorageProvider } from '../../apps/api/src/modules/files/supabaseProvider.js';
import { setDefaultStorageProvider } from '../../apps/api/src/modules/files/storageAdapter.js';
import {
  PolicyMalwareScanner,
  setDefaultMalwareScanner,
} from '../../apps/api/src/modules/files/scanner.js';
import {
  reserveFileUpload,
  cancelUploadReservation,
  finalizeFileUpload,
  getFileDownloadCapability,
  deleteFileItem,
} from '../../apps/api/src/modules/files/service.js';

const admin = createAdminPool();
const runtime = createRuntimePool();
const userId = crypto.randomUUID();
const workspaceId = crypto.randomUUID();
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII=',
  'base64'
);
const objects = new Map<string, Buffer>();
let writeStarted: (() => void) | undefined;
let finishWrite: Promise<void> | undefined;
const transport = vi.fn<typeof fetch>(async (input, init) => {
  const path = new URL(String(input)).pathname.replace('/authenticated/', '/');
  const object = objects.get(path);
  if (init?.method === 'POST') {
    writeStarted?.();
    if (finishWrite) await finishWrite;
    if (objects.has(path)) return new Response(null, { status: 409 });
    objects.set(path, Buffer.from(init.body as Uint8Array));
    return Response.json({ Key: path });
  }
  if (init?.method === 'DELETE') {
    objects.delete(path);
    return Response.json({ message: 'deleted' });
  }
  if (!object) return new Response(null, { status: 404 });
  if (init?.method === 'HEAD')
    return new Response(null, {
      headers: { 'content-length': String(object.length), 'content-type': 'image/png' },
    });
  return new Response(new Uint8Array(object), { headers: { 'content-type': 'image/png' } });
});
const provider = createConfiguredStorageProvider(
  runtime,
  {
    SUPABASE_URL: 'https://storage.example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-server-credential',
    DAYNORI_API_ORIGIN: 'https://api.example.test',
    STORAGE_CAPABILITY_SECRET: crypto.randomBytes(32).toString('hex'),
  },
  transport
)!;
const app = buildServer({
  runtimePool: runtime,
  allowUnauthenticatedStartup: true,
  logger: new SafeLogger(() => {}),
});
const tenant = <T>(fn: Parameters<typeof withTenantContext<T>>[2]) =>
  withTenantContext(runtime, { userId, workspaceId }, fn);
const reserve = () =>
  tenant((client) =>
    reserveFileUpload(client, {
      workspaceId,
      actorId: userId,
      request: {
        fileName: 'synthetic.png',
        declaredMimeType: 'image/png',
        declaredBytes: bytes.length,
      },
    })
  );
const pathAndQuery = (url: string) => {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
};

beforeAll(async () => {
  const migrator = new Migrator();
  try {
    await migrator.migrate();
  } finally {
    await migrator.close();
  }
  await admin.query('INSERT INTO app.profiles (id, display_name) VALUES ($1, $2)', [
    userId,
    'Synthetic Storage Test',
  ]);
  await admin.query(
    "INSERT INTO app.workspaces (id, name, kind, owner_id) VALUES ($1, 'Synthetic Storage Test', 'personal', $2)",
    [workspaceId, userId]
  );
  await admin.query(
    "INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
    [workspaceId, userId]
  );
  setDefaultStorageProvider(provider);
  setDefaultMalwareScanner(new PolicyMalwareScanner());
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await runtime.end();
  await admin.end();
});

it('performs upload, inspection, scan and download with durable DB-authorized capabilities', async () => {
  const reservation = await reserve();
  const oversized = await app.inject({
    method: 'PUT',
    url: pathAndQuery(reservation.uploadUrl),
    headers: { 'content-type': 'image/png' },
    payload: Buffer.alloc(bytes.length + 1),
  });
  expect(oversized.statusCode).toBe(413);
  expect(objects.size).toBe(0);
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: pathAndQuery(reservation.uploadUrl),
        headers: { 'content-type': 'image/png' },
        payload: bytes,
      })
    ).statusCode
  ).toBe(200);
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: pathAndQuery(reservation.uploadUrl),
        headers: { 'content-type': 'image/png' },
        payload: bytes,
      })
    ).statusCode
  ).toBe(409);
  const finalized = await tenant((client) =>
    finalizeFileUpload(client, {
      workspaceId,
      actorId: userId,
      reservationId: reservation.reservationId,
    })
  );
  expect(finalized.status).toBe('verified');
  const capability = await tenant((client) =>
    getFileDownloadCapability(client, workspaceId, reservation.fileId)
  );
  const download = await app.inject({ method: 'GET', url: pathAndQuery(capability.downloadUrl) });
  expect(download.statusCode).toBe(200);
  expect(download.rawPayload).toEqual(bytes);
  expect(download.headers['cache-control']).toContain('no-store');
  await admin.query('UPDATE app.items SET deleted_at = now() WHERE workspace_id = $1 AND id = $2', [
    workspaceId,
    reservation.fileId,
  ]);
  expect(
    (await app.inject({ method: 'GET', url: pathAndQuery(capability.downloadUrl) })).statusCode
  ).toBe(403);
});

it('serializes cancellation against an upload already writing to the provider', async () => {
  const reservation = await reserve();
  let releaseWrite: (() => void) | undefined;
  finishWrite = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  const started = new Promise<void>((resolve) => {
    writeStarted = resolve;
  });
  const uploading = app.inject({
    method: 'PUT',
    url: pathAndQuery(reservation.uploadUrl),
    headers: { 'content-type': 'image/png' },
    payload: bytes,
  });
  // Fastify's injection is lazy; awaiting the thenable starts the request.
  const uploaded = Promise.resolve(uploading);
  await started;
  const cancelled = tenant((client) =>
    cancelUploadReservation(client, workspaceId, userId, reservation.reservationId)
  );
  releaseWrite?.();
  expect((await uploaded).statusCode).toBe(200);
  expect((await cancelled).status).toBe('cancelled');
  finishWrite = undefined;
  writeStarted = undefined;
  expect(await provider.headObject('private_assets', reservation.objectPath)).toBeNull();
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: pathAndQuery(reservation.uploadUrl),
        headers: { 'content-type': 'image/png' },
        payload: bytes,
      })
    ).statusCode
  ).toBe(403);
});

it('allows binary transfer preflight only from the configured web origin', async () => {
  vi.stubEnv('DAYNORI_WEB_ORIGIN', 'https://web.example.test');
  try {
    const allowed = await app.inject({
      method: 'OPTIONS',
      url: '/v1/storage/upload/private_assets/probe',
      headers: { origin: 'https://web.example.test' },
    });
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://web.example.test');
    const denied = await app.inject({
      method: 'OPTIONS',
      url: '/v1/storage/upload/private_assets/probe',
      headers: { origin: 'https://untrusted.example.test' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
  }
});

it('preserves object bytes on deletion rollback and does not debit quota again on cleanup retries', async () => {
  const reservation = await reserve();
  await app.inject({
    method: 'PUT',
    url: pathAndQuery(reservation.uploadUrl),
    headers: { 'content-type': 'image/png' },
    payload: bytes,
  });
  await tenant((client) =>
    finalizeFileUpload(client, {
      workspaceId,
      actorId: userId,
      reservationId: reservation.reservationId,
    })
  );
  await expect(
    tenant(async (client) => {
      await deleteFileItem(client, workspaceId, userId, reservation.fileId);
      throw new Error('synthetic transaction failure');
    })
  ).rejects.toThrow('synthetic transaction failure');
  expect(await provider.getObject('private_assets', reservation.objectPath)).toEqual(bytes);
  const capability = await tenant((client) =>
    getFileDownloadCapability(client, workspaceId, reservation.fileId)
  );
  expect(
    (await app.inject({ method: 'GET', url: pathAndQuery(capability.downloadUrl) })).statusCode
  ).toBe(200);
  await tenant((client) => deleteFileItem(client, workspaceId, userId, reservation.fileId));
  expect(await provider.getObject('private_assets', reservation.objectPath)).toEqual(bytes);
  const usage = await admin.query(
    'SELECT stored_bytes FROM app.workspace_storage_usage WHERE workspace_id = $1',
    [workspaceId]
  );
  const worker = new DaynoriWorker(undefined, { storageService: provider });
  worker.start();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(
        (
          await worker.processJob(`synthetic-delete-${attempt}`, 'file_deletion', {
            workspaceId,
            fileId: reservation.fileId,
            objectPath: reservation.objectPath,
            byteSize: bytes.length,
          })
        ).status
      ).toBe('completed');
    }
  } finally {
    worker.stop();
  }
  expect(await provider.getObject('private_assets', reservation.objectPath)).toBeNull();
  const after = await admin.query(
    'SELECT stored_bytes FROM app.workspace_storage_usage WHERE workspace_id = $1',
    [workspaceId]
  );
  expect(after.rows[0].stored_bytes).toBe(usage.rows[0].stored_bytes);
});
