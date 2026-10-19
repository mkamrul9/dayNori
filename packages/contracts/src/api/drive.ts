import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

export const DriveConnectionStatusSchema = z.enum([
  'unconfigured',
  'pending_consent',
  'connected',
  'degraded',
  'disconnected',
  'revoked',
]);

export const DriveLinkModeSchema = z.enum([
  'link_reference',
  'import_copy',
  'upload_to_drive',
  'download_offline',
]);

export const DriveProviderKindSchema = z.enum(['unconfigured', 'fake', 'google_production']);

export const DriveConnectionSchema = z
  .object({
    id: z.string().uuid().nullable(),
    workspaceId: z.string().uuid(),
    status: DriveConnectionStatusSchema,
    providerKind: DriveProviderKindSchema,
    providerAccountEmail: z.string().email().nullable(),
    providerSubject: z.string().nullable(),
    grantedScopeValidated: z.boolean(),
    generation: z.number().int().nonnegative(),
    connectedAt: z.string().datetime().nullable(),
    lastReconciledAt: z.string().datetime().nullable(),
    /** True when UI/fixtures use the labeled fake provider (never a real Google account). */
    isDevelopmentFixture: z.boolean(),
  })
  .strict();

export type DriveConnection = z.infer<typeof DriveConnectionSchema>;

export const DriveConnectionStatusResponseSchema = z.object({
  data: DriveConnectionSchema,
  meta: ResponseMetaSchema,
});
export type DriveConnectionStatusResponse = z.infer<typeof DriveConnectionStatusResponseSchema>;

export const StartDriveConnectRequestSchema = z
  .object({
    platform: z.enum(['web', 'android']),
    returnPath: z
      .string()
      .min(1)
      .max(512)
      .refine((p) => p.startsWith('/') && !p.startsWith('//'), 'returnPath must be a relative path'),
  })
  .strict();

export type StartDriveConnectRequest = z.infer<typeof StartDriveConnectRequestSchema>;

export const StartDriveConnectResponseSchema = z.object({
  data: z.object({
    intentId: z.string().uuid(),
    authorizationUrl: z.string().url(),
    expiresAt: z.string().datetime(),
    providerKind: DriveProviderKindSchema,
    /** Fake provider only — never present for production Google. */
    developmentHarnessHint: z.string().nullable(),
  }),
  meta: ResponseMetaSchema,
});
export type StartDriveConnectResponse = z.infer<typeof StartDriveConnectResponseSchema>;

export const CompleteDriveConnectRequestSchema = z
  .object({
    intentId: z.string().uuid(),
    /** OAuth authorization code from Google, or fake harness code. */
    code: z.string().min(1).max(4096).optional(),
    state: z.string().min(1).max(512),
    error: z.string().max(256).optional(),
  })
  .strict();

export type CompleteDriveConnectRequest = z.infer<typeof CompleteDriveConnectRequestSchema>;

export const CompleteDriveConnectResponseSchema = z.object({
  data: DriveConnectionSchema,
  meta: ResponseMetaSchema,
});
export type CompleteDriveConnectResponse = z.infer<typeof CompleteDriveConnectResponseSchema>;

export const DisconnectDriveRequestSchema = z
  .object({
    reason: z.enum(['local_disconnect']).default('local_disconnect'),
  })
  .strict();

export const DisconnectDriveResponseSchema = z.object({
  data: z.object({
    status: z.literal('disconnected'),
    tokensRemoved: z.literal(true),
    jobsCancelled: z.number().int().nonnegative(),
    retainedImportedCopies: z.literal(true),
    remoteOriginalDeleted: z.literal(false),
    message: z.string(),
  }),
  meta: ResponseMetaSchema,
});
export type DisconnectDriveResponse = z.infer<typeof DisconnectDriveResponseSchema>;

export const DriveLinkedFileSchema = z
  .object({
    id: z.string().uuid(),
    connectionId: z.string().uuid(),
    providerFileId: z.string().min(1).max(256),
    displayName: z.string().min(1).max(512),
    mimeType: z.string().min(1).max(200),
    provenance: z.enum(['app_created', 'picker_selected', 'imported_copy', 'upload']),
    linkMode: DriveLinkModeSchema,
    providerVersion: z.string().nullable(),
    checksum: z.string().nullable(),
    localFileItemId: z.string().uuid().nullable(),
    availability: z.enum(['linked', 'imported', 'offline_cached', 'source_unavailable', 'permission_lost']),
    lastReconciledAt: z.string().datetime().nullable(),
  })
  .strict();

export type DriveLinkedFile = z.infer<typeof DriveLinkedFileSchema>;

export const ListDriveLinkedFilesResponseSchema = z.object({
  data: z.array(DriveLinkedFileSchema),
  meta: ResponseMetaSchema,
});
export type ListDriveLinkedFilesResponse = z.infer<typeof ListDriveLinkedFilesResponseSchema>;

export const DriveSelectFileRequestSchema = z
  .object({
    providerFileId: z.string().min(1).max(256),
    displayName: z.string().min(1).max(512),
    mimeType: z.string().min(1).max(200),
    linkMode: DriveLinkModeSchema,
    providerVersion: z.string().max(128).nullable().optional(),
    checksum: z.string().max(128).nullable().optional(),
    isShortcut: z.boolean().default(false),
    isSharedDrive: z.boolean().default(false),
    /** Destination folder for import_copy into app storage. */
    folderId: z.string().uuid().nullable().optional(),
    /** App file to upload when linkMode=upload_to_drive. */
    localFileItemId: z.string().uuid().nullable().optional(),
    exportMimeType: z.string().max(200).nullable().optional(),
  })
  .strict();

export type DriveSelectFileRequest = z.infer<typeof DriveSelectFileRequestSchema>;

export const DriveSelectFileResponseSchema = z.object({
  data: z.object({
    linkedFile: DriveLinkedFileSchema,
    jobId: z.string().uuid().nullable(),
    jobKind: z.enum(['import_copy', 'upload_to_drive', 'download_offline', 'none']),
  }),
  meta: ResponseMetaSchema,
});
export type DriveSelectFileResponse = z.infer<typeof DriveSelectFileResponseSchema>;

export const DrivePickerTokenResponseSchema = z.object({
  data: z.object({
    /** Short-lived access token for Google Picker only; never a refresh token. */
    accessToken: z.string().min(1),
    expiresAt: z.string().datetime(),
    cacheControl: z.literal('no-store'),
  }),
  meta: ResponseMetaSchema,
});
export type DrivePickerTokenResponse = z.infer<typeof DrivePickerTokenResponseSchema>;

export const DriveJobStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'fenced',
]);

export const DriveJobSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(['import_copy', 'upload_to_drive', 'download_offline', 'reconcile']),
    status: DriveJobStatusSchema,
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    linkedFileId: z.string().uuid().nullable(),
  })
  .strict();

export const DriveJobResponseSchema = z.object({
  data: DriveJobSchema,
  meta: ResponseMetaSchema,
});
