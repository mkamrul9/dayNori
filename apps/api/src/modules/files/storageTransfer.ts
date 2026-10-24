import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { getDefaultStorageProvider, type StorageProviderContract } from './storageAdapter.js';

export interface StorageTransferOptions {
  storageProvider?: StorageProviderContract;
}

/**
 * Storage Transfer plugin providing real HTTP PUT upload and GET download transports
 * for signed capability URLs.
 */
export const storageTransferPlugin: FastifyPluginAsync<StorageTransferOptions> = async (
  app: FastifyInstance,
  options: StorageTransferOptions = {}
): Promise<void> => {
  // Use raw buffer parser for all storage uploads within this encapsulated plugin
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && origin === process.env['DAYNORI_WEB_ORIGIN']) {
      reply
        .header('Access-Control-Allow-Origin', origin)
        .header('Vary', 'Origin')
        .header('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
        .header('Access-Control-Allow-Headers', 'Content-Type, X-Storage-Token');
    }
  });
  app.options('/v1/storage/*', async (_request, reply) => reply.status(204).send());

  // PUT /v1/storage/upload/:bucket/*
  app.put(
    '/v1/storage/upload/:bucket/*',
    { bodyLimit: 52428800 },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const provider = options.storageProvider ?? getDefaultStorageProvider();
      const params = request.params as { bucket: string; '*': string };
      const bucket = params.bucket;
      const objectPath = params['*'];

      const query = request.query as { token?: string; expires?: string };
      const token = query.token || (request.headers['x-storage-token'] as string);
      const expires = query.expires ? Number(query.expires) : undefined;

      if (!token) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Missing signed upload token',
        });
      }

      if (expires && Date.now() > expires) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Signed upload capability has expired',
        });
      }

      // Check with provider if capability is valid / not revoked
      if (typeof provider.validateUploadToken !== 'function') {
        return reply.status(503).send({ error: 'Storage capability validation unavailable' });
      }
      {
        const validation = await provider.validateUploadToken(token, bucket, objectPath);
        if (!validation.isValid) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: validation.reason ?? 'Upload capability is invalid or revoked',
          });
        }

        // Enforce maxByteLimit
        const bytes = (request.body as Buffer) || Buffer.alloc(0);
        if (validation.maxByteLimit && bytes.length > validation.maxByteLimit) {
          return reply.status(413).send({
            error: 'Payload Too Large',
            message: `Uploaded payload (${bytes.length} bytes) exceeds capability limit of ${validation.maxByteLimit} bytes`,
          });
        }

        // Enforce overwrite restriction (upsert: false)
        if (validation.upsert === false) {
          const existing = await provider.headObject(bucket, objectPath);
          if (existing) {
            return reply.status(409).send({
              error: 'Conflict',
              message: `Object '${bucket}/${objectPath}' already exists and overwrite is disabled`,
            });
          }
        }
      }

      const bytes = (request.body as Buffer) || Buffer.alloc(0);
      const contentType = request.headers['content-type'] || 'application/octet-stream';

      if (provider.storeAuthorizedUpload) {
        const result = await provider.storeAuthorizedUpload(
          token,
          bucket,
          objectPath,
          bytes,
          contentType
        );
        if (result === 'invalid')
          return reply.status(403).send({ error: 'Upload capability is no longer valid' });
        if (result === 'too_large')
          return reply.status(413).send({ error: 'Upload exceeds capability byte limit' });
      } else {
        await provider.putObject(bucket, objectPath, bytes, { contentType, upsert: false });
      }

      return reply.status(200).send({
        success: true,
        byteSize: bytes.length,
        bucket,
        objectPath,
      });
    }
  );

  // GET /v1/storage/download/:bucket/*
  app.get(
    '/v1/storage/download/:bucket/*',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const provider = options.storageProvider ?? getDefaultStorageProvider();
      const params = request.params as { bucket: string; '*': string };
      const bucket = params.bucket;
      const objectPath = params['*'];

      const query = request.query as { token?: string; expires?: string };
      const token = query.token || (request.headers['x-storage-token'] as string);
      const expires = query.expires ? Number(query.expires) : undefined;

      if (!token) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Missing signed download token',
        });
      }

      if (expires && Date.now() > expires) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Signed download capability has expired',
        });
      }

      if (typeof provider.validateDownloadToken !== 'function') {
        return reply.status(503).send({ error: 'Storage capability validation unavailable' });
      }
      {
        const validation = await provider.validateDownloadToken(token, bucket, objectPath);
        if (!validation.isValid) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: validation.reason ?? 'Download capability is invalid or revoked',
          });
        }
      }

      const meta = await provider.headObject(bucket, objectPath);
      if (!meta) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Storage object '${bucket}/${objectPath}' was not found`,
        });
      }

      const bytes = await provider.getObject(bucket, objectPath);
      if (!bytes) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Storage object '${bucket}/${objectPath}' was not found`,
        });
      }

      return reply
        .status(200)
        .header('Content-Type', meta.contentType || 'application/octet-stream')
        .header('Content-Length', bytes.length)
        .header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .send(bytes);
    }
  );
};
