import {
  jwtVerify,
  createRemoteJWKSet,
  createLocalJWKSet,
  type JWTVerifyGetKey,
  type JWTPayload,
  type JSONWebKeySet,
} from 'jose';

export class AuthError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code = 'UNAUTHENTICATED', statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface JwtVerifierConfig {
  issuer: string;
  audience: string;
  allowedAlgorithms?: string[];
  jwksUrl?: string;
  localJwks?: JSONWebKeySet;
  keyStore?: JWTVerifyGetKey;
}

export interface VerifiedActor {
  userId: string;
  email?: string;
  role: string;
  claims: JWTPayload;
}

const DEFAULT_ALLOWED_ALGORITHMS = ['RS256', 'EdDSA'];

export class JwtVerifier {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly allowedAlgorithms: string[];
  private readonly getKey: JWTVerifyGetKey;

  constructor(config: JwtVerifierConfig) {
    this.issuer = config.issuer;
    this.audience = config.audience;
    this.allowedAlgorithms = config.allowedAlgorithms ?? DEFAULT_ALLOWED_ALGORITHMS;

    if (config.keyStore) {
      this.getKey = config.keyStore;
    } else if (config.localJwks) {
      this.getKey = createLocalJWKSet(config.localJwks);
    } else if (config.jwksUrl) {
      // Configure bounded caching and timeout; never fetch URLs from untrusted tokens
      this.getKey = createRemoteJWKSet(new URL(config.jwksUrl), {
        cacheMaxAge: 10 * 60 * 1000, // 10 minutes cache
        cooldownDuration: 30 * 1000, // 30 seconds cooldown
        timeoutDuration: 5 * 1000, // 5 seconds timeout
      });
    } else {
      throw new Error('JwtVerifier requires either keyStore, localJwks, or jwksUrl');
    }
  }

  async verify(token: string): Promise<VerifiedActor> {
    if (!token || typeof token !== 'string') {
      throw new AuthError('Missing or malformed authorization token');
    }

    try {
      const { payload, protectedHeader } = await jwtVerify(token, this.getKey, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: this.allowedAlgorithms,
        clockTolerance: 5, // 5 seconds clock skew tolerance
      });

      // Reject tokens using disallowed algorithms
      if (!this.allowedAlgorithms.includes(protectedHeader.alg)) {
        throw new AuthError(`Token algorithm '${protectedHeader.alg}' is not permitted`);
      }

      // Subject must be present and non-empty
      if (!payload.sub || typeof payload.sub !== 'string') {
        throw new AuthError('Token subject (sub) claim is missing or invalid');
      }

      // Check token intended use / role
      // In Supabase / OAuth JWTs, user tokens have role 'authenticated' or token_use 'access'
      const role = (payload['role'] as string) || 'authenticated';
      const tokenUse = payload['token_use'] as string | undefined;

      // Reject administrative, service, or anonymous credentials as user sessions
      const forbiddenRoles = ['anon', 'service_role', 'supabase_admin'];
      if (forbiddenRoles.includes(role)) {
        throw new AuthError(`Role '${role}' is not permitted for user session authentication`);
      }

      if (tokenUse && tokenUse !== 'access' && tokenUse !== 'id') {
        throw new AuthError(`Invalid token_use: '${tokenUse}'`);
      }

      return {
        userId: payload.sub,
        email: payload['email'] as string | undefined,
        role,
        claims: payload,
      };
    } catch (err: unknown) {
      if (err instanceof AuthError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Invalid token';
      throw new AuthError(`JWT verification failed: ${message}`);
    }
  }
}
