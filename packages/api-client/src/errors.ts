import type { ApiErrorDetail } from '@daynori/contracts';

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly requestId?: string;
  public readonly details?: ApiErrorDetail[];

  constructor(
    message: string,
    options: {
      code: string;
      statusCode: number;
      requestId?: string;
      details?: ApiErrorDetail[];
    }
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.requestId = options.requestId;
    this.details = options.details;
  }
}

export class ApiAuthError extends ApiClientError {
  constructor(message: string, options: { requestId?: string; details?: ApiErrorDetail[] }) {
    super(message, { code: 'UNAUTHENTICATED', statusCode: 401, ...options });
    this.name = 'ApiAuthError';
  }
}

export class ApiNotFoundError extends ApiClientError {
  constructor(message: string, options: { requestId?: string; details?: ApiErrorDetail[] }) {
    super(message, { code: 'NOT_FOUND', statusCode: 404, ...options });
    this.name = 'ApiNotFoundError';
  }
}

export class ApiValidationError extends ApiClientError {
  constructor(message: string, options: { requestId?: string; details?: ApiErrorDetail[] }) {
    super(message, { code: 'VALIDATION_FAILED', statusCode: 400, ...options });
    this.name = 'ApiValidationError';
  }
}

export class ApiConflictError extends ApiClientError {
  constructor(message: string, options: { requestId?: string; details?: ApiErrorDetail[] }) {
    super(message, { code: 'REVISION_CONFLICT', statusCode: 409, ...options });
    this.name = 'ApiConflictError';
  }
}

export class ApiRateLimitError extends ApiClientError {
  public readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    options: { requestId?: string; retryAfter?: number; details?: ApiErrorDetail[] }
  ) {
    super(message, { code: 'RATE_LIMITED', statusCode: 429, ...options });
    this.name = 'ApiRateLimitError';
    this.retryAfterSeconds = options.retryAfter;
  }
}

export class ApiPayloadTooLargeError extends ApiClientError {
  constructor(message: string, options: { requestId?: string; details?: ApiErrorDetail[] }) {
    super(message, { code: 'PAYLOAD_TOO_LARGE', statusCode: 413, ...options });
    this.name = 'ApiPayloadTooLargeError';
  }
}
