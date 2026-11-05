import type { FeedbackDiagnostics } from './types.js';

const SENSITIVE_KEY_PATTERN = /(token|secret|password|bearer|auth|cookie|session|credential|private|prompt|audio|journal|body)/i;
const JWT_PATTERN = /eyJ[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]{2,}\.[a-zA-Z0-9_-]*/g;
const BEARER_PATTERN = /Bearer\s+[a-zA-Z0-9._~+/-]+=*/gi;

/**
 * Sanitizes route template by removing query parameters, hashes, and potential sensitive values.
 */
export function sanitizeRouteTemplate(route: string): string {
  if (!route || typeof route !== 'string') return '/';
  try {
    // If route is a full URL, parse it; otherwise, parse against dummy origin
    const parsed = new URL(route, 'https://daynori.internal');
    // Keep only pathname, replace UUIDs with :id placeholder
    const cleanPath = parsed.pathname
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .slice(0, 200);
    return cleanPath || '/';
  } catch {
    return route.split('?')[0]?.split('#')[0]?.slice(0, 200) || '/';
  }
}

/**
 * Sanitizes a string value by removing JWT tokens, bearer tokens, and bounding length.
 */
export function sanitizeDiagnosticsString(str: unknown, maxLen = 200): string {
  if (typeof str !== 'string') return '';
  return str
    .replace(JWT_PATTERN, '[REDACTED_TOKEN]')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .slice(0, maxLen)
    .trim();
}

/**
 * Validates and strictly sanitizes technical diagnostics before storage or transmission.
 * Ensures tokens, credentials, private bodies, prompts, audio, and unrelated user content
 * are completely excluded.
 */
export function sanitizeDiagnostics(rawInput: unknown): FeedbackDiagnostics {
  if (!rawInput || typeof rawInput !== 'object') {
    return {
      appVersion: 'unknown',
      platform: 'web',
      browserOrOs: 'unknown',
      routeTemplate: '/',
      locale: 'en',
      timestamp: new Date().toISOString(),
      correlationId: 'generated-' + Math.random().toString(36).slice(2, 10),
    };
  }

  const input = rawInput as Record<string, unknown>;

  // Check for suspicious sensitive keys
  for (const key of Object.keys(input)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      delete input[key];
    }
  }

  const platformRaw = String(input['platform'] || 'web').toLowerCase();
  const platform: 'web' | 'android' | 'ios' | 'desktop' =
    platformRaw === 'android' || platformRaw === 'ios' || platformRaw === 'desktop'
      ? platformRaw
      : 'web';

  const appVersion = sanitizeDiagnosticsString(input['appVersion'] || '0.1.0', 50);
  const buildNumberRaw = input['buildNumber'];
  const buildNumber =
    typeof buildNumberRaw === 'string' && buildNumberRaw.length > 0
      ? sanitizeDiagnosticsString(buildNumberRaw, 50)
      : undefined;

  const browserOrOs = sanitizeDiagnosticsString(input['browserOrOs'] || 'unknown', 200);
  const routeTemplate = sanitizeRouteTemplate(String(input['routeTemplate'] || '/'));
  const locale = sanitizeDiagnosticsString(input['locale'] || 'en', 35);

  let timestamp = new Date().toISOString();
  if (typeof input['timestamp'] === 'string' && !isNaN(Date.parse(input['timestamp']))) {
    timestamp = new Date(input['timestamp']).toISOString();
  }

  let correlationId = sanitizeDiagnosticsString(input['correlationId'], 100);
  if (!correlationId) {
    correlationId = 'corr-' + Math.random().toString(36).slice(2, 12);
  }

  let errorCode: string | undefined;
  if (typeof input['errorCode'] === 'string' && input['errorCode'].length > 0) {
    // Only allow bounded alphanumeric, hyphen, underscore error codes
    errorCode = input['errorCode'].replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50);
  }

  return {
    appVersion: appVersion || '0.1.0',
    ...(buildNumber ? { buildNumber } : {}),
    platform,
    browserOrOs: browserOrOs || 'unknown',
    routeTemplate: routeTemplate || '/',
    locale: locale || 'en',
    timestamp,
    correlationId,
    ...(errorCode ? { errorCode } : {}),
  };
}

/**
 * Collects reviewable client-side diagnostics in a safe manner across web and native.
 */
export function collectClientDiagnostics(options: {
  appVersion?: string;
  buildNumber?: string;
  platform?: 'web' | 'android' | 'ios' | 'desktop';
  route?: string;
  errorCode?: string;
  correlationId?: string;
} = {}): FeedbackDiagnostics {
  let browserOrOs = 'unknown';
  let locale = 'en';

  if (typeof navigator !== 'undefined') {
    browserOrOs = navigator.userAgent ? navigator.userAgent.slice(0, 200) : 'browser';
    locale = navigator.language || 'en';
  }

  return sanitizeDiagnostics({
    appVersion: options.appVersion || '0.1.0',
    buildNumber: options.buildNumber,
    platform: options.platform || 'web',
    browserOrOs,
    routeTemplate: options.route || '/',
    locale,
    timestamp: new Date().toISOString(),
    correlationId: options.correlationId,
    errorCode: options.errorCode,
  });
}
