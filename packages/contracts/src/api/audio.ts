import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';
export const MAX_AUDIO_RECORDING_SECONDS = 600; // 10 minutes
export const MAX_AUDIO_RECORDING_BYTES = 25 * 1024 * 1024; // 25 MiB

export const AudioTargetItemTypeSchema = z.enum(['note', 'journal', 'knowledge', 'file']);
export type AudioTargetItemType = z.infer<typeof AudioTargetItemTypeSchema>;

export const AudioRecordingStatusSchema = z.enum([
  'recording',
  'paused',
  'stopped',
  'interrupted',
  'uploaded',
]);
export type AudioRecordingStatus = z.infer<typeof AudioRecordingStatusSchema>;

export const AudioAttachmentSchema = z.object({
  fileId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  durationSeconds: z.number().int().min(1).max(MAX_AUDIO_RECORDING_SECONDS),
  byteSize: z.number().int().positive().max(MAX_AUDIO_RECORDING_BYTES),
  mimeType: z.string().min(1).max(100),
  createdAt: z.string().datetime(),
});
export type AudioAttachment = z.infer<typeof AudioAttachmentSchema>;

export const AudioAttachmentResponseSchema = z.object({
  data: AudioAttachmentSchema,
  meta: ResponseMetaSchema,
});
export type AudioAttachmentResponse = z.infer<typeof AudioAttachmentResponseSchema>;

export const AudioRecordingDraftSchema = z.object({
  sessionId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  durationSeconds: z.number().min(0).max(MAX_AUDIO_RECORDING_SECONDS),
  byteSize: z.number().int().nonnegative().max(MAX_AUDIO_RECORDING_BYTES),
  mimeType: z.string().min(1).max(100),
  status: AudioRecordingStatusSchema,
  targetItemType: AudioTargetItemTypeSchema.optional(),
  targetItemId: z.string().uuid().optional(),
  blobKey: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AudioRecordingDraft = z.infer<typeof AudioRecordingDraftSchema>;
