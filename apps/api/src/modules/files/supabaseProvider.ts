import crypto from 'node:crypto';
import { z } from 'zod';
import type { Pool } from 'pg';
import { withTenantContext } from '../../db/client.js';
import { SupabaseObjectStore } from '../../providers/supabaseStorage.js';
import type { StorageProviderContract } from './storageAdapter.js';

const CapabilitySchema = z.object({
  version: z.literal(1),
  operation: z.enum(['upload', 'download']),
  bucket: z.literal('private_assets'),
  objectPath: z.string().max(1024),
  actorId: z.string().uuid(),
  expiresAt: z.number().int().positive(),
  maxByteLimit: z.number().int().positive().max(52_428_800),
});
export type StorageCapability = z.infer<typeof CapabilitySchema>;

/** HMAC capabilities survive replicas/restarts; database state owns revocation. */
export class SupabaseStorageProvider
  extends SupabaseObjectStore
  implements StorageProviderContract
{
  private readonly apiOrigin: string;
  constructor(
    config: { url: string; serviceRoleKey: string; apiOrigin: string; signingSecret: string },
    private readonly authorize: (
      capability: StorageCapability,
      transfer?: () => Promise<void>
    ) => Promise<boolean>,
    transport?: typeof fetch
  ) {
    super(config, transport);
    const origin = new URL(config.apiOrigin);
    if (
      origin.protocol !== 'https:' ||
      origin.origin !== config.apiOrigin ||
      config.signingSecret.length < 32
    ) {
      throw new Error(
        'Storage capabilities require an HTTPS API origin and a strong signing secret'
      );
    }
    this.apiOrigin = origin.origin;
    this.signingSecret = config.signingSecret;
  }
  private readonly signingSecret: string;
  isConfigured(): boolean {
    return true;
  }

  private sign(claim: StorageCapability): string {
    const payload = Buffer.from(JSON.stringify(CapabilitySchema.parse(claim))).toString(
      'base64url'
    );
    return `${payload}.${crypto.createHmac('sha256', this.signingSecret).update(payload).digest('base64url')}`;
  }

  private async validate(
    token: string,
    bucket: string,
    objectPath: string,
    operation: StorageCapability['operation']
  ): Promise<StorageCapability | null> {
    if (token.length > 4096) return null;
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const signature = crypto.createHmac('sha256', this.signingSecret).update(parts[0]).digest();
    const supplied = Buffer.from(parts[1], 'base64url');
    if (signature.length !== supplied.length || !crypto.timingSafeEqual(signature, supplied))
      return null;
    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    const result = CapabilitySchema.safeParse(decoded);
    if (!result.success) return null;
    const claim = result.data;
    if (
      claim.expiresAt <= Date.now() ||
      claim.bucket !== bucket ||
      claim.objectPath !== objectPath ||
      claim.operation !== operation
    )
      return null;
    return (await this.authorize(claim)) ? claim : null;
  }

  async createSignedUploadUrl(
    bucket: string,
    objectPath: string,
    options?: Parameters<StorageProviderContract['createSignedUploadUrl']>[2]
  ) {
    const expiresInSeconds = Math.min(options?.expiresInSeconds ?? 7200, 7200);
    const token = this.sign({
      version: 1,
      operation: 'upload',
      bucket: z.literal('private_assets').parse(bucket),
      objectPath,
      actorId: z.string().uuid().parse(options?.actorId),
      expiresAt: Date.now() + expiresInSeconds * 1000,
      maxByteLimit: options?.maxByteLimit ?? 52_428_800,
    });
    return {
      signedUrl: `${this.apiOrigin}/v1/storage/upload/${bucket}/${objectPath}?token=${token}`,
      expiresInSeconds,
      method: 'PUT' as const,
      headers: { 'Content-Type': options?.contentType ?? 'application/octet-stream' },
    };
  }

  async createSignedDownloadUrl(
    bucket: string,
    objectPath: string,
    options?: { expiresInSeconds?: number; actorId?: string }
  ) {
    const expiresInSeconds = Math.min(options?.expiresInSeconds ?? 300, 300);
    const token = this.sign({
      version: 1,
      operation: 'download',
      bucket: z.literal('private_assets').parse(bucket),
      objectPath,
      actorId: z.string().uuid().parse(options?.actorId),
      expiresAt: Date.now() + expiresInSeconds * 1000,
      maxByteLimit: 52_428_800,
    });
    return {
      signedUrl: `${this.apiOrigin}/v1/storage/download/${bucket}/${objectPath}?token=${token}`,
      expiresInSeconds,
    };
  }

  async validateUploadToken(token: string, bucket: string, objectPath: string) {
    const claim = await this.validate(token, bucket, objectPath, 'upload');
    return claim
      ? { isValid: true, maxByteLimit: claim.maxByteLimit, upsert: false }
      : { isValid: false };
  }
  async validateDownloadToken(token: string, bucket: string, objectPath: string) {
    return { isValid: Boolean(await this.validate(token, bucket, objectPath, 'download')) };
  }
  async storeAuthorizedUpload(
    token: string,
    bucket: string,
    objectPath: string,
    bytes: Buffer,
    contentType: string
  ): Promise<'stored' | 'invalid' | 'too_large'> {
    const claim = await this.validate(token, bucket, objectPath, 'upload');
    if (!claim) return 'invalid';
    if (bytes.length > claim.maxByteLimit) return 'too_large';
    const stored = await this.authorize(claim, () =>
      this.putObject(bucket, objectPath, bytes, { contentType, upsert: false })
    );
    return stored ? 'stored' : 'invalid';
  }
  async revokeUploadCapability(): Promise<void> {
    // Cancellation/rejection is persisted by the service transaction. Validation
    // rechecks that state on every request, including on another API replica.
  }
}

export function createConfiguredStorageProvider(
  pool: Pool,
  env: NodeJS.ProcessEnv = process.env,
  transport?: typeof fetch
): SupabaseStorageProvider | undefined {
  if (!env['SUPABASE_URL'] && !env['SUPABASE_SERVICE_ROLE_KEY']) return undefined;
  return new SupabaseStorageProvider(
    {
      url: env['SUPABASE_URL'] ?? '',
      serviceRoleKey: env['SUPABASE_SERVICE_ROLE_KEY'] ?? '',
      apiOrigin: env['DAYNORI_API_ORIGIN'] ?? '',
      signingSecret: env['STORAGE_CAPABILITY_SECRET'] ?? '',
    },
    async (claim, transfer) => {
      const workspaceId = z.string().uuid().safeParse(claim.objectPath.split('/')[0]);
      if (!workspaceId.success) return false;
      return withTenantContext(
        pool,
        { userId: claim.actorId, workspaceId: workspaceId.data },
        async (client) => {
          // The reservation lock fences cancellation/rejection against a late
          // provider write. The bounded provider request finishes before commit.
          if (transfer)
            await client.query(
              'SELECT id FROM app.upload_reservations WHERE workspace_id = $1 AND object_path = $2 FOR UPDATE',
              [workspaceId.data, claim.objectPath]
            );
          if (claim.expiresAt <= Date.now()) return false;
          const state = await client.query<{ allowed: boolean }>(
            `SELECT
        NOT EXISTS (SELECT 1 FROM app.deletion_suppression_ledger WHERE entity_type = 'account' AND entity_id = $1::uuid)
        AND app.user_has_workspace_role($2::uuid, $3)
        AND EXISTS (SELECT 1 FROM app.get_workspace_sync_access($2::uuid, $1::uuid) s
          WHERE s.user_role IS NOT NULL AND (s.kind <> 'room' OR s.status = 'active')) AND
        CASE WHEN $4 = 'upload' THEN EXISTS (
          SELECT 1 FROM app.upload_reservations WHERE workspace_id = $2::uuid AND object_path = $5
          AND created_by = $1::uuid AND status = 'reserved' AND NOT reconciled AND expires_at > now()
          AND declared_bytes = $6)
        ELSE EXISTS (
          SELECT 1 FROM app.file_items f JOIN app.items i ON i.workspace_id = f.workspace_id AND i.id = f.id
          WHERE f.workspace_id = $2::uuid AND f.object_path = $5 AND f.quarantine_status = 'verified' AND i.deleted_at IS NULL)
        END AS allowed`,
            [
              claim.actorId,
              workspaceId.data,
              claim.operation === 'upload' ? 'editor' : 'viewer',
              claim.operation,
              claim.objectPath,
              claim.maxByteLimit,
            ]
          );
          const allowed = state.rows[0]?.allowed === true;
          if (allowed && transfer) await transfer();
          return allowed;
        }
      );
    },
    transport
  );
}
