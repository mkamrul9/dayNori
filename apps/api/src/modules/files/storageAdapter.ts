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
    options?: {
      expiresInSeconds?: number;
      upsert?: boolean;
      contentType?: string;
      maxByteLimit?: number;
    }
  ): Promise<{
    signedUrl: string;
    expiresInSeconds: number;
    method: 'PUT';
    headers: Record<string, string>;
  }>;

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

  revokeUploadCapability(tokenOrObjectPath: string): Promise<void>;

  isConfigured(): boolean;

  validateUploadToken?(
    token: string,
    bucket: string,
    objectPath: string
  ): { isValid: boolean; reason?: string; maxByteLimit?: number; upsert?: boolean };

  validateDownloadToken?(
    token: string,
    bucket: string,
    objectPath: string
  ): { isValid: boolean; reason?: string };
}

/**
 * Thrown when storage provider is required but not configured or available.
 */
export class StorageUnavailableError extends Error {
  constructor(message = 'Storage provider is not configured or unavailable') {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

/**
 * Storage provider returned when external credentials or transport is unconfigured.
 * Returns honest 503 unavailable status rather than fictional URLs.
 */
export class UnavailableStorageProvider implements StorageProviderContract {
  isConfigured(): boolean {
    return false;
  }

  async createSignedUploadUrl(): Promise<never> {
    throw new StorageUnavailableError();
  }

  async createSignedDownloadUrl(): Promise<never> {
    throw new StorageUnavailableError();
  }

  async getObject(): Promise<never> {
    throw new StorageUnavailableError();
  }

  async putObject(): Promise<never> {
    throw new StorageUnavailableError();
  }

  async deleteObject(): Promise<never> {
    throw new StorageUnavailableError();
  }

  async headObject(): Promise<never> {
    throw new StorageUnavailableError();
  }

  async revokeUploadCapability(): Promise<void> {
    // no-op
  }
}

interface UploadTokenRecord {
  token: string;
  bucket: string;
  objectPath: string;
  expiresAt: Date;
  upsert: boolean;
  maxByteLimit?: number;
  revoked: boolean;
}

interface DownloadTokenRecord {
  token: string;
  bucket: string;
  objectPath: string;
  expiresAt: Date;
  revoked: boolean;
}

/**
 * Real in-memory and local HTTP transfer storage provider for test environments
 * and local development fixtures.
 */
export class MemoryStorageProvider implements StorageProviderContract {
  private objects = new Map<string, { bytes: Buffer; contentType: string; updatedAt: Date }>();
  private signedUploadTokens = new Map<string, UploadTokenRecord>();
  private signedDownloadTokens = new Map<string, DownloadTokenRecord>();
  private baseUrl = process.env['STORAGE_BASE_URL'] ?? 'http://127.0.0.1:3000';

  constructor(baseUrl?: string) {
    if (baseUrl) {
      this.baseUrl = baseUrl.replace(/\/+$/, '');
    }
  }

  isConfigured(): boolean {
    return true;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private makeKey(bucket: string, objectPath: string): string {
    return `${bucket}:::${objectPath}`;
  }

  async createSignedUploadUrl(
    bucket: string,
    objectPath: string,
    options?: {
      expiresInSeconds?: number;
      upsert?: boolean;
      contentType?: string;
      maxByteLimit?: number;
    }
  ): Promise<{
    signedUrl: string;
    expiresInSeconds: number;
    method: 'PUT';
    headers: Record<string, string>;
  }> {
    const expiresIn = options?.expiresInSeconds ?? 7200; // 2 hours default
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const record: UploadTokenRecord = {
      token,
      bucket,
      objectPath,
      expiresAt,
      upsert: options?.upsert ?? false,
      maxByteLimit: options?.maxByteLimit,
      revoked: false,
    };

    this.signedUploadTokens.set(token, record);

    const signedUrl = `${this.baseUrl}/v1/storage/upload/${bucket}/${objectPath}?token=${token}&expires=${expiresAt.getTime()}`;

    const headers: Record<string, string> = {
      'Content-Type': options?.contentType ?? 'application/octet-stream',
    };

    return { signedUrl, expiresInSeconds: expiresIn, method: 'PUT', headers };
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

    this.signedDownloadTokens.set(token, {
      token,
      bucket,
      objectPath,
      expiresAt,
      revoked: false,
    });

    const signedUrl = `${this.baseUrl}/v1/storage/download/${bucket}/${objectPath}?token=${token}&expires=${expiresAt.getTime()}`;

    return { signedUrl, expiresInSeconds: expiresIn };
  }

  async revokeUploadCapability(tokenOrObjectPath: string): Promise<void> {
    // Revoke by token or by matching objectPath
    for (const record of this.signedUploadTokens.values()) {
      if (record.token === tokenOrObjectPath || record.objectPath === tokenOrObjectPath) {
        record.revoked = true;
      }
    }
  }

  validateUploadToken(
    token: string,
    bucket: string,
    objectPath: string
  ): { isValid: boolean; reason?: string; maxByteLimit?: number; upsert?: boolean } {
    const record = this.signedUploadTokens.get(token);
    if (!record) {
      return { isValid: false, reason: 'Invalid or unknown upload token' };
    }
    if (record.revoked) {
      return { isValid: false, reason: 'Upload capability has been revoked or cancelled' };
    }
    if (record.expiresAt.getTime() < Date.now()) {
      return { isValid: false, reason: 'Upload capability has expired' };
    }
    if (record.bucket !== bucket || record.objectPath !== objectPath) {
      return { isValid: false, reason: 'Upload capability path mismatch' };
    }

    return {
      isValid: true,
      maxByteLimit: record.maxByteLimit,
      upsert: record.upsert,
    };
  }

  validateDownloadToken(
    token: string,
    bucket: string,
    objectPath: string
  ): { isValid: boolean; reason?: string } {
    const record = this.signedDownloadTokens.get(token);
    if (!record) {
      return { isValid: false, reason: 'Invalid or unknown download token' };
    }
    if (record.revoked) {
      return { isValid: false, reason: 'Download capability has been revoked' };
    }
    if (record.expiresAt.getTime() < Date.now()) {
      return { isValid: false, reason: 'Download capability has expired' };
    }
    if (record.bucket !== bucket || record.objectPath !== objectPath) {
      return { isValid: false, reason: 'Download capability path mismatch' };
    }

    return { isValid: true };
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
    this.signedDownloadTokens.clear();
  }
}

// Global default storage provider
let defaultStorageProvider: StorageProviderContract = new MemoryStorageProvider();

export function getDefaultStorageProvider(): StorageProviderContract {
  return defaultStorageProvider;
}

export function setDefaultStorageProvider(provider: StorageProviderContract): void {
  defaultStorageProvider = provider;
}
