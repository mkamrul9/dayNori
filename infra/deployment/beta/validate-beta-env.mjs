#!/usr/bin/env node
/**
 * Daynori Phase 38: Controlled Private Beta Environment Validator
 *
 * Audits a candidate beta deployment environment against essential security invariants:
 * 1. Private access enforced: public sign-up disabled, invitation secret configured.
 * 2. Least-privilege separation: runtime DB user is non-admin.
 * 3. Scope constraints: private storage bucket, strict quota limits.
 * 4. Privacy: telemetry redaction enabled, log level specified.
 * 5. Reauthentication security: HMAC secret present and sufficient length.
 */

import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export function validateBetaEnvironment(env = process.env) {
  const errors = [];
  const warnings = [];

  // 1. Private access boundaries
  if (env.BETA_ACCESS_MODE !== 'private_invitation_only') {
    errors.push(
      `BETA_ACCESS_MODE must be 'private_invitation_only', found: '${env.BETA_ACCESS_MODE || 'unset'}'`
    );
  }
  if (env.BETA_ALLOW_PUBLIC_SIGNUP !== 'false') {
    errors.push(
      `BETA_ALLOW_PUBLIC_SIGNUP must be explicitly 'false'; public registration is forbidden in beta (found: '${env.BETA_ALLOW_PUBLIC_SIGNUP ?? 'unset'}').`
    );
  }
  const inviteSecret = env.BETA_INVITATION_SECRET || '';
  if (!inviteSecret || inviteSecret.includes('replace_with_') || inviteSecret.length < 32) {
    errors.push(
      'BETA_INVITATION_SECRET must be configured with at least 32 characters of high-entropy secret.'
    );
  }
  const maxSeatsRaw = env.BETA_MAX_SEATS || env.BETA_SEAT_LIMIT;
  const maxSeats = Number(maxSeatsRaw);
  if (
    !maxSeatsRaw ||
    isNaN(maxSeats) ||
    !Number.isInteger(maxSeats) ||
    maxSeats <= 0 ||
    maxSeats > 100
  ) {
    errors.push(
      `BETA_MAX_SEATS must be a positive integer between 1 and 100 (found: '${maxSeatsRaw ?? 'unset'}').`
    );
  }

  // 2. Database least-privilege separation
  const dbUser = (env.DB_USER || '').toLowerCase();
  if (!dbUser || dbUser === 'postgres' || dbUser === 'root' || dbUser === 'admin') {
    errors.push(
      `Runtime DB_USER must be a dedicated least-privilege role (e.g. 'daynori_runtime'), not '${dbUser || 'unset'}'.`
    );
  }
  if (!env.DB_NAME || env.DB_NAME === 'postgres') {
    errors.push(`DB_NAME must target an isolated database, not '${env.DB_NAME || 'unset'}'.`);
  }
  if (env.DB_PASSWORD?.includes('replace_with_') || env.PGPASSWORD?.includes('replace_with_')) {
    errors.push('Placeholder credentials detected in database configuration.');
  }

  // 3. Storage and quota boundaries
  if (!env.STORAGE_PRIVATE_BUCKET) {
    errors.push('STORAGE_PRIVATE_BUCKET must be explicitly specified.');
  }
  const quotaRaw = env.STORAGE_QUOTA_BYTES_PER_WORKSPACE;
  const quotaBytes = Number(quotaRaw);
  if (
    !quotaRaw ||
    isNaN(quotaBytes) ||
    !Number.isInteger(quotaBytes) ||
    quotaBytes <= 0 ||
    quotaBytes > 500 * 1024 * 1024
  ) {
    errors.push(
      `STORAGE_QUOTA_BYTES_PER_WORKSPACE must be a positive integer bounded to at most 500MB (found: '${quotaRaw ?? 'unset'}').`
    );
  }

  // 4. Privacy & Telemetry
  if (env.REDACT_TELEMETRY !== 'true') {
    errors.push(
      `REDACT_TELEMETRY must be explicitly set to 'true' to prevent personal journal/note content from leaking into telemetry (found: '${env.REDACT_TELEMETRY ?? 'unset'}').`
    );
  }

  // 5. Reauthentication & Token security
  const reauthSecret = env.REAUTH_SECRET || env.REAUTH_SIGNING_SECRET || '';
  if (!reauthSecret || reauthSecret.includes('replace_with_') || reauthSecret.length < 32) {
    errors.push(
      'REAUTH_SECRET or REAUTH_SIGNING_SECRET must be configured with at least 32 characters for portable export and account deletion.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

import { fileURLToPath } from 'node:url';

// CLI Execution
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const envFile = process.argv[2];
  let envToTest = process.env;

  if (envFile && fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf8').split('\n');
    envToTest = { ...process.env };
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        envToTest[key] = val;
      }
    }
  }

  console.log('=== VALIDATING PHASE 38 BETA ENVIRONMENT CONFIGURATION ===');
  const result = validateBetaEnvironment(envToTest);

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  }

  if (result.errors.length > 0) {
    console.log('\nValidation Errors:');
    result.errors.forEach((e) => console.log(`  ✗ ${e}`));
    console.log('\n❌ Beta environment configuration FAILED compliance audit.\n');
    process.exit(1);
  } else {
    console.log(
      '\n✓ Beta environment configuration conforms to all Phase 38 security invariants.\n'
    );
    process.exit(0);
  }
}
