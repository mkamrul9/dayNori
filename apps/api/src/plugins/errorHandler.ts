import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { ApiErrorCode, type ApiErrorResponse } from '@daynori/contracts';
import { AuthError } from '../auth/jwt.js';
import { RateLimitError } from './rateLimiter.js';
import type { SafeLogger } from './logger.js';

export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Access forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export function createErrorHandler(logger: SafeLogger) {
  return function errorHandler(
    error: FastifyError | Error,
    request: FastifyRequest,
    reply: FastifyReply
  ): FastifyReply {
    const requestId = request.id || 'unknown';

    // 1. Zod schema validation errors
    if (error instanceof ZodError) {
      const details = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));

      const body: ApiErrorResponse = {
        error: {
          code: ApiErrorCode.VALIDATION_FAILED,
          message: 'Request validation failed',
          requestId,
          details,
        },
      };
      return reply.status(400).send(body);
    }

    // 2. Authentication errors
    if (error instanceof AuthError) {
      const body: ApiErrorResponse = {
        error: {
          code: error.code || ApiErrorCode.UNAUTHENTICATED,
          message: error.message,
          requestId,
        },
      };
      return reply.status(error.statusCode || 401).send(body);
    }

    // 3. Not Found or Forbidden (consistently return 404 to avoid leaking object existence)
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      const body: ApiErrorResponse = {
        error: {
          code: ApiErrorCode.NOT_FOUND,
          message: error.message,
          requestId,
        },
      };
      return reply.status(404).send(body);
    }

    // 4. Rate Limiting
    if (error instanceof RateLimitError) {
      const body: ApiErrorResponse = {
        error: {
          code: ApiErrorCode.RATE_LIMITED,
          message: error.message,
          requestId,
          retryAfter: error.retryAfterSeconds,
        },
      };
      return reply.status(429).send(body);
    }

    // 5. Body size limit
    if ('statusCode' in error && error.statusCode === 413) {
      const body: ApiErrorResponse = {
        error: {
          code: ApiErrorCode.PAYLOAD_TOO_LARGE,
          message: 'Payload too large: request body exceeds maximum allowed size (1 MiB)',
          requestId,
        },
      };
      return reply.status(413).send(body);
    }

    // 6. Generic / unexpected error -> Log safely and return non-leaking 500
    logger.error(requestId, `Unhandled server error: ${error.message}`, {
      stack: error.stack,
      name: error.name,
    });

    const body: ApiErrorResponse = {
      error: {
        code: ApiErrorCode.INTERNAL_ERROR,
        message: 'An unexpected internal server error occurred',
        requestId,
      },
    };
    return reply.status(500).send(body);
  };
}
