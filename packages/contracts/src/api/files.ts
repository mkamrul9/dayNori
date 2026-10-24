import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
] as const;

export const MAX_GENERAL_FILE_BYTES = 25 * 1024 * 1024; // 25 MiB = 26,214,400 bytes
export const MAX_AUDIO_FILE_BYTES = 50 * 1024 * 1024; // 50 MiB = 52,428,800 bytes
export const UPLOAD_CAPABILITY_EXPIRY_SECONDS = 7200; // 2 hours (Supabase signed upload URL validity)
export const DOWNLOAD_CAPABILITY_EXPIRY_SECONDS = 300; // 5 minutes (Short-lived download URL)
export const MAX_CONCURRENT_RESERVATIONS = 5;

export const FileQuarantineStatusSchema = z.enum([
  'quarantined',
  'verified',
  'rejected',
  'deleted',
]);
export type FileQuarantineStatus = z.infer<typeof FileQuarantineStatusSchema>;

export const UploadReservationStatusSchema = z.enum([
  'reserved',
  'uploaded',
  'quarantined',
  'verified',
  'rejected',
  'cancelled',
  'expired',
  'finalized',
]);
export type UploadReservationStatus = z.infer<typeof UploadReservationStatusSchema>;

// --- 1. Upload Reservation Schemas ---

export const ReserveUploadRequestSchema = z
  .object({
    fileName: z
      .string()
      .min(1)
      .max(255)
      .refine(
        (name) => !name.includes('/') && !name.includes('\\') && !name.includes('..'),
        'File name must not contain path traversal characters'
      ),
    declaredMimeType: z.string().min(1).max(100),
    declaredBytes: z
      .number()
      .int()
      .positive('Declared bytes must be greater than zero')
      .max(MAX_AUDIO_FILE_BYTES, 'Declared bytes exceeds maximum file size limit'),
    folderId: z.string().uuid().nullable().optional(),
    fileId: z.string().uuid().optional(),
  })
  .strict();

export type ReserveUploadRequest = z.infer<typeof ReserveUploadRequestSchema>;
export type ReserveUploadRequestInput = z.input<typeof ReserveUploadRequestSchema>;

export const ReserveUploadResponseDataSchema = z.object({
  reservationId: z.string().uuid(),
  fileId: z.string().uuid(),
  objectPath: z.string(),
  uploadUrl: z.string().url(),
  method: z.literal('PUT'),
  headers: z.record(z.string()),
  expiresAt: z.string().datetime(),
  expiresInSeconds: z.literal(UPLOAD_CAPABILITY_EXPIRY_SECONDS),
  maxByteLimit: z.number().int(),
  reservedExposureBytes: z.number().int(),
});

export const ReserveUploadResponseSchema = z.object({
  data: ReserveUploadResponseDataSchema,
  meta: ResponseMetaSchema,
});
export type ReserveUploadResponse = z.infer<typeof ReserveUploadResponseSchema>;

// --- 2. Finalize Upload Schemas ---

export const FinalizeUploadRequestSchema = z
  .object({
    operationId: z.string().uuid().optional(),
    clientChecksum: z
      .string()
      .regex(/^[a-f0-9]{64}$/i, 'Must be a 64-char hex SHA-256 hash')
      .optional(),
  })
  .strict()
  .optional();

export type FinalizeUploadRequest = z.infer<typeof FinalizeUploadRequestSchema>;

export const FinalizeUploadResponseDataSchema = z.object({
  fileId: z.string().uuid(),
  status: FileQuarantineStatusSchema,
  fileName: z.string(),
  byteSize: z.number().int(),
  detectedMimeType: z.string(),
  sha256Checksum: z.string(),
  rejectionReason: z.string().nullable().optional(),
  verifiedAt: z.string().datetime().nullable().optional(),
});

export const FinalizeUploadResponseSchema = z.object({
  data: FinalizeUploadResponseDataSchema,
  meta: ResponseMetaSchema,
});
export type FinalizeUploadResponse = z.infer<typeof FinalizeUploadResponseSchema>;

// --- 3. Upload Reservation Status & Cancellation ---

export const UploadStatusResponseDataSchema = z.object({
  reservationId: z.string().uuid(),
  fileId: z.string().uuid(),
  status: UploadReservationStatusSchema,
  fileName: z.string(),
  declaredBytes: z.number().int(),
  reservedExposureBytes: z.number().int(),
  expiresAt: z.string().datetime(),
  rejectionReason: z.string().nullable().optional(),
  reconciled: z.boolean(),
});

export const UploadStatusResponseSchema = z.object({
  data: UploadStatusResponseDataSchema,
  meta: ResponseMetaSchema,
});
export type UploadStatusResponse = z.infer<typeof UploadStatusResponseSchema>;

export const CancelReservationResponseSchema = z.object({
  data: z.object({
    reservationId: z.string().uuid(),
    status: z.literal('cancelled'),
    reconciled: z.boolean(),
  }),
  meta: ResponseMetaSchema,
});
export type CancelReservationResponse = z.infer<typeof CancelReservationResponseSchema>;

// --- 4. File Item & Download Capability ---

export const FileItemSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  folderId: z.string().uuid().nullable(),
  fileName: z.string(),
  declaredMimeType: z.string(),
  detectedMimeType: z.string(),
  byteSize: z.number().int(),
  sha256Checksum: z.string(),
  version: z.string(),
  quarantineStatus: FileQuarantineStatusSchema,
  rejectionReason: z.string().nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  verifiedAt: z.string().datetime().nullable(),
});
export type FileItem = z.infer<typeof FileItemSchema>;

export const FileItemResponseSchema = z.object({
  data: FileItemSchema,
  meta: ResponseMetaSchema,
});
export type FileItemResponse = z.infer<typeof FileItemResponseSchema>;

export const DownloadCapabilityResponseDataSchema = z.object({
  fileId: z.string().uuid(),
  downloadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  expiresInSeconds: z.number().int(),
  fileName: z.string(),
  mimeType: z.string(),
  byteSize: z.number().int(),
});

export const DownloadCapabilityResponseSchema = z.object({
  data: DownloadCapabilityResponseDataSchema,
  meta: ResponseMetaSchema,
});
export type DownloadCapabilityResponse = z.infer<typeof DownloadCapabilityResponseSchema>;

// --- 5. Storage Quota Accounting ---

export const StorageQuotaResponseDataSchema = z.object({
  workspaceId: z.string().uuid(),
  storedBytes: z.number().int(),
  reservedBytes: z.number().int(),
  totalCommittedBytes: z.number().int(),
  maxStorageBytes: z.number().int(),
  availableBytes: z.number().int(),
  activeReservationsCount: z.number().int(),
});

export const StorageQuotaResponseSchema = z.object({
  data: StorageQuotaResponseDataSchema,
  meta: ResponseMetaSchema,
});
export type StorageQuotaResponse = z.infer<typeof StorageQuotaResponseSchema>;
