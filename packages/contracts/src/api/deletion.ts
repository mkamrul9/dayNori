import { z } from 'zod';

export const RequestAccountDeletionBodySchema = z.object({
  password: z.string().min(1).optional(),
  reauthTicket: z.string().min(1).optional(),
  reason: z.string().max(500).optional(),
});
export type RequestAccountDeletionBody = z.infer<typeof RequestAccountDeletionBodySchema>;

export const RequestAccountDeletionResponseSchema = z.object({
  deletionId: z.string().uuid(),
  status: z.enum(['pending_confirmation', 'scheduled', 'processing', 'completed']),
  confirmationRequired: z.boolean(),
  confirmationToken: z.string().optional(),
  cancellationDeadline: z.string().datetime().optional(),
  scheduledPurgeAt: z.string().datetime().optional(),
  retainedDataDisclosure: z.string(),
});
export type RequestAccountDeletionResponse = z.infer<typeof RequestAccountDeletionResponseSchema>;

export const ConfirmAccountDeletionBodySchema = z.object({
  confirmationToken: z.string().min(1),
});
export type ConfirmAccountDeletionBody = z.infer<typeof ConfirmAccountDeletionBodySchema>;

export const ConfirmAccountDeletionResponseSchema = z.object({
  success: z.boolean(),
  deletionId: z.string().uuid(),
  status: z.string(),
  completedAt: z.string().datetime(),
  message: z.string(),
});
export type ConfirmAccountDeletionResponse = z.infer<typeof ConfirmAccountDeletionResponseSchema>;

export const CancelAccountDeletionBodySchema = z.object({
  reason: z.string().max(500).optional(),
});
export type CancelAccountDeletionBody = z.infer<typeof CancelAccountDeletionBodySchema>;

export const CancelAccountDeletionResponseSchema = z.object({
  success: z.boolean(),
  deletionId: z.string().uuid(),
  status: z.literal('cancelled'),
  cancelledAt: z.string().datetime(),
});
export type CancelAccountDeletionResponse = z.infer<typeof CancelAccountDeletionResponseSchema>;

export const AccountDeletionStatusResponseSchema = z.object({
  deletionId: z.string().uuid(),
  status: z.enum([
    'pending_confirmation',
    'scheduled',
    'processing',
    'completed',
    'failed',
    'cancelled',
  ]),
  createdAt: z.string().datetime(),
  cancellationDeadline: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  lastError: z.string().nullable().optional(),
});
export type AccountDeletionStatusResponse = z.infer<typeof AccountDeletionStatusResponseSchema>;

export const RequestWorkspaceDeletionBodySchema = z.object({
  password: z.string().min(1).optional(),
  reauthTicket: z.string().min(1).optional(),
  reason: z.string().max(500).optional(),
});
export type RequestWorkspaceDeletionBody = z.infer<typeof RequestWorkspaceDeletionBodySchema>;

export const RequestWorkspaceDeletionResponseSchema = z.object({
  success: z.boolean(),
  deletionId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  status: z.string(),
  completedAt: z.string().datetime(),
});
export type RequestWorkspaceDeletionResponse = z.infer<
  typeof RequestWorkspaceDeletionResponseSchema
>;

export const PublicDeletionRequestSubmissionSchema = z.object({
  email: z.string().email(),
  reason: z.string().max(500).optional(),
});
export type PublicDeletionRequestSubmission = z.infer<typeof PublicDeletionRequestSubmissionSchema>;

export const PublicDeletionRequestResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  disclosure: z.string(),
});
export type PublicDeletionRequestResponse = z.infer<typeof PublicDeletionRequestResponseSchema>;
