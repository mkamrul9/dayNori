import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { ApiErrorCode, type ApiErrorResponse } from '@daynori/contracts';
import { AuthError } from '../auth/jwt.js';
import { RateLimitError } from './rateLimiter.js';
import { SafeLogger, sanitizeLogString } from './logger.js';
import { CursorValidationError } from '../utils/pagination.js';

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

export class ValidationError extends Error {
  constructor(message = 'Validation failed') {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends Error {
  constructor(message = 'Revision conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ResponseValidationError extends Error {
  public override readonly cause?: unknown;

  constructor(message = 'Response contract validation failed', cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'ResponseValidationError';
    this.cause = cause;
  }
}

export function validateResponse<T>(schema: { parse: (val: unknown) => T }, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err) {
    throw new ResponseValidationError('Response schema failed contract validation', err);
  }
}

export function createErrorHandler(logger: SafeLogger) {
  return function errorHandler(
    error: FastifyError | Error,
    request: FastifyRequest,
    reply: FastifyReply
  ): FastifyReply {
    const requestId = request.id || 'unknown';

    // 1. Response-schema contract failures are internal server errors (500), NOT client errors
    if (error instanceof ResponseValidationError) {
      logger.error(requestId, 'Response schema failed contract validation', {
        cause: error.cause instanceof Error ? error.cause.message : error.cause,
      });

      const body: ApiErrorResponse = {
        error: {
          code: ApiErrorCode.INTERNAL_ERROR,
          message: 'An unexpected internal server error occurred',
          requestId,
        },
      };
      return reply.status(500).send(body);
    }

    // 2. Keyset pagination cursor errors (invalid encoding, oversized, or mismatched context)
    if (error instanceof CursorValidationError) {
      const body: ApiErrorResponse = {
        error: {
          code: ApiErrorCode.VALIDATION_FAILED,
          message: error.message,
          requestId,
        },
      };
      return reply.status(400).send(body);
    }

    // 3. Malformed JSON payload
    if (
      error instanceof SyntaxError ||
      ('statusCode' in error && error.statusCode === 400 && error.message.includes('JSON'))
    ) {
      const body: ApiErrorResponse = {
        error: {
          code: ApiErrorCode.VALIDATION_FAILED,
          message: 'Malformed JSON payload: unable to parse request body',
          requestId,
        },
      };
      return reply.status(400).send(body);
    }

    // 4. Zod schema validation errors (client input)
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

    // 4b. Custom invariant validation errors
    if (error instanceof ValidationError) {
      const body: ApiErrorResponse = {
        error: {
          code: ApiErrorCode.VALIDATION_FAILED,
          message: error.message,
          requestId,
        },
      };
      return reply.status(400).send(body);
    }

    // 4c. Optimistic concurrency revision conflicts
    if (error instanceof ConflictError) {
      const body: ApiErrorResponse = {
        error: {
          code: ApiErrorCode.REVISION_CONFLICT,
          message: error.message,
          requestId,
        },
      };
      return reply.status(409).send(body);
    }

    // 5. Authentication errors
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

    // 6. Not Found or Forbidden (consistently return 404 to avoid leaking object existence)
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

    // 7. Rate Limiting
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

    // 8. Body size limit
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

    // 9. Generic / unexpected error -> Redact messages and stack before logging; return safe 500
    const sanitizedMessage = sanitizeLogString(error.message);
    const sanitizedStack = error.stack ? sanitizeLogString(error.stack) : undefined;

    logger.error(requestId, 'Unhandled server error occurred', {
      name: error.name,
      message: sanitizedMessage,
      stack: sanitizedStack,
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
