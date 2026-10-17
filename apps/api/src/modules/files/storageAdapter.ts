import crypto from 'node:crypto';

export interface StorageObjectMetadata {
  contentLength: number;
  contentType: string;
  eTag?: string;
  lastModified?: Date;
}

export interface StorageProviderContract {
  createSignedUploadUrl(
    bucket: string,
    objectPath: string,
    options?: { expiresInSeconds?: number; upsert?: boolean; contentType?: string }
  ): Promise<{ signedUrl: string; expiresInSeconds: number }>;

  createSignedDownloadUrl(
    bucket: string,
    objectPath: string,
    options?: { expiresInSeconds?: number }
  ): Promise<{ signedUrl: string; expiresInSeconds: number }>;

  getObject(bucket: string, objectPath: string): Promise<Buffer | null>;

  putObject(
    bucket: string,
    objectPath: string,
    bytes: Buffer,
    options?: { contentType?: string; upsert?: boolean }
  ): Promise<void>;

  deleteObject(bucket: string, objectPath: string): Promise<void>;

  headObject(bucket: string, objectPath: string): Promise<StorageObjectMetadata | null>;
}

/**
 * In-memory storage provider for isolated tests and environments where
 * cloud storage credentials are not provided.
 */
export class MemoryStorageProvider implements StorageProviderContract {
  private objects = new Map<string, { bytes: Buffer; contentType: string; updatedAt: Date }>();
  private signedUploadTokens = new Map<
    string,
    { bucket: string; objectPath: string; expiresAt: Date; upsert: boolean }
  >();

  private makeKey(bucket: string, objectPath: string): string {
    return `${bucket}:::${objectPath}`;
  }

  async createSignedUploadUrl(
    bucket: string,
    objectPath: string,
    options?: { expiresInSeconds?: number; upsert?: boolean }
  ): Promise<{ signedUrl: string; expiresInSeconds: number }> {
    const expiresIn = options?.expiresInSeconds ?? 7200; // 2 hours default
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    this.signedUploadTokens.set(token, {
      bucket,
      objectPath,
      expiresAt,
      upsert: options?.upsert ?? false,
    });

    const baseUrl = process.env['STORAGE_BASE_URL'] ?? 'https://storage.daynori.local';
    const signedUrl = `${baseUrl}/upload/${bucket}/${objectPath}?token=${token}&expires=${expiresAt.getTime()}`;

    return { signedUrl, expiresInSeconds: expiresIn };
  }

  async createSignedDownloadUrl(
    bucket: string,
    objectPath: string,
    options?: { expiresInSeconds?: number }
  ): Promise<{ signedUrl: string; expiresInSeconds: number }> {
    const key = this.makeKey(bucket, objectPath);
    if (!this.objects.has(key)) {
      throw new Error(`Object not found: ${bucket}/${objectPath}`);
    }

    const expiresIn = options?.expiresInSeconds ?? 300; // 5 minutes default
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const baseUrl = process.env['STORAGE_BASE_URL'] ?? 'https://storage.daynori.local';
    const signedUrl = `${baseUrl}/download/${bucket}/${objectPath}?token=${token}&expires=${expiresAt.getTime()}`;

    return { signedUrl, expiresInSeconds: expiresIn };
  }

  async getObject(bucket: string, objectPath: string): Promise<Buffer | null> {
    const key = this.makeKey(bucket, objectPath);
    const item = this.objects.get(key);
    return item ? Buffer.from(item.bytes) : null;
  }

  async putObject(
    bucket: string,
    objectPath: string,
    bytes: Buffer,
    options?: { contentType?: string; upsert?: boolean }
  ): Promise<void> {
    const key = this.makeKey(bucket, objectPath);
    const existing = this.objects.has(key);

    if (existing && options?.upsert === false) {
      throw new Error(`Object already exists and upsert is disabled: ${bucket}/${objectPath}`);
    }

    this.objects.set(key, {
      bytes: Buffer.from(bytes),
      contentType: options?.contentType ?? 'application/octet-stream',
      updatedAt: new Date(),
    });
  }

  async deleteObject(bucket: string, objectPath: string): Promise<void> {
    const key = this.makeKey(bucket, objectPath);
    this.objects.delete(key);
  }

  async headObject(bucket: string, objectPath: string): Promise<StorageObjectMetadata | null> {
    const key = this.makeKey(bucket, objectPath);
    const item = this.objects.get(key);
    if (!item) return null;
    return {
      contentLength: item.bytes.length,
      contentType: item.contentType,
      lastModified: item.updatedAt,
    };
  }

  clear(): void {
    this.objects.clear();
    this.signedUploadTokens.clear();
  }
}

// Global singleton instance for runtime/test lifecycle
let defaultStorageProvider: StorageProviderContract = new MemoryStorageProvider();

export function getDefaultStorageProvider(): StorageProviderContract {
  return defaultStorageProvider;
}

export function setDefaultStorageProvider(provider: StorageProviderContract): void {
  defaultStorageProvider = provider;
}
