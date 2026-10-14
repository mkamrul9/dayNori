import { z } from 'zod';
import { ResponseMetaSchema } from './common.js';

export const HealthCheckDataSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  environment: z.string(),
});

export const HealthCheckResponseSchema = z.object({
  data: HealthCheckDataSchema,
  meta: ResponseMetaSchema,
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;

export const ReadinessStatusSchema = z.enum(['ready', 'degraded', 'unavailable']);

export const ReadinessCheckDataSchema = z.object({
  status: ReadinessStatusSchema,
  checks: z.object({
    database: z.enum(['connected', 'disconnected']),
    auth: z.enum(['ready', 'unconfigured', 'unavailable']).optional(),
  }),
});

export const ReadinessCheckResponseSchema = z.object({
  data: ReadinessCheckDataSchema,
  meta: ResponseMetaSchema,
});

export type ReadinessCheckResponse = z.infer<typeof ReadinessCheckResponseSchema>;
