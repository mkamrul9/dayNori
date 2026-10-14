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
  secret?: string;
  keyStore?: JWTVerifyGetKey;
}

export interface VerifiedActor {
  userId: string;
  email?: string;
  role: string;
  claims: JWTPayload;
}

const DEFAULT_ASYMMETRIC_ALGORITHMS = ['RS256', 'ES256', 'EdDSA'];
const DEFAULT_SYMMETRIC_ALGORITHMS = ['HS256'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class JwtVerifier {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly allowedAlgorithms: string[];
  private readonly getKey: JWTVerifyGetKey;

  constructor(config: JwtVerifierConfig) {
    this.issuer = config.issuer;
    this.audience = config.audience;

    if (config.keyStore) {
      this.getKey = config.keyStore;
      this.allowedAlgorithms = config.allowedAlgorithms ?? DEFAULT_ASYMMETRIC_ALGORITHMS;
    } else if (config.secret) {
      const secretBytes = new TextEncoder().encode(config.secret);
      this.getKey = async () => secretBytes;
      this.allowedAlgorithms = config.allowedAlgorithms ?? DEFAULT_SYMMETRIC_ALGORITHMS;
    } else if (config.localJwks) {
      this.getKey = createLocalJWKSet(config.localJwks);
      this.allowedAlgorithms = config.allowedAlgorithms ?? DEFAULT_ASYMMETRIC_ALGORITHMS;
    } else if (config.jwksUrl) {
      // Configure bounded caching and timeout; never fetch URLs from untrusted tokens
      this.getKey = createRemoteJWKSet(new URL(config.jwksUrl), {
        cacheMaxAge: 10 * 60 * 1000, // 10 minutes cache
        cooldownDuration: 30 * 1000, // 30 seconds cooldown
        timeoutDuration: 5 * 1000, // 5 seconds timeout
      });
      this.allowedAlgorithms = config.allowedAlgorithms ?? DEFAULT_ASYMMETRIC_ALGORITHMS;
    } else {
      throw new Error('JwtVerifier requires either keyStore, localJwks, secret, or jwksUrl');
    }

    if (config.allowedAlgorithms) {
      this.allowedAlgorithms = config.allowedAlgorithms;
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

      // 1. Reject tokens using disallowed algorithms
      if (!protectedHeader.alg || !this.allowedAlgorithms.includes(protectedHeader.alg)) {
        throw new AuthError('Token algorithm is not permitted');
      }

      // 2. Token expiration must be present and valid
      if (typeof payload.exp !== 'number') {
        throw new AuthError('Token expiration claim is missing');
      }

      // 3. Subject must be present and must be a valid UUID matching database identity contract
      if (!payload.sub || typeof payload.sub !== 'string' || !UUID_REGEX.test(payload.sub)) {
        throw new AuthError('Invalid user identity in token');
      }

      // 4. Role must be present and must be 'authenticated'
      // NEVER default missing or invalid roles to authenticated
      const role = payload['role'];
      const forbiddenRoles = ['anon', 'service_role', 'supabase_admin'];
      if (typeof role === 'string' && forbiddenRoles.includes(role)) {
        throw new AuthError(`Role '${role}' is not permitted for user session authentication`);
      }
      if (!role || typeof role !== 'string' || role !== 'authenticated') {
        throw new AuthError('Unauthorized token role: expected authenticated user');
      }

      // 5. Reject anonymous user sessions
      if (payload['is_anonymous'] === true) {
        throw new AuthError('Anonymous sessions are not permitted');
      }

      // 7. Reject ID tokens — require access token
      const tokenUse = payload['token_use'];
      if (tokenUse === 'id' || (tokenUse && tokenUse !== 'access')) {
        throw new AuthError('ID tokens and non-access tokens are not permitted');
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
      // Return safe authentication error without exposing internal verifier details or stack
      throw new AuthError('Invalid or expired authorization token');
    }
  }
}
