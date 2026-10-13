import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  timestamp: z.string().datetime(),
  environment: z.string().optional(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const SmokeResponseSchema = z.object({
  status: z.literal('ready'),
  phase: z.literal('01'),
  service: z.string(),
  timestamp: z.string().datetime(),
});

export type SmokeResponse = z.infer<typeof SmokeResponseSchema>;
