/**
 * Phase 45 preparation — executable test-only protocol models.
 * Disconnected from application routes, migrations, and unlock UI.
 * Passing these models is NOT production integration evidence.
 */

export type FieldRole = 'title' | 'body' | 'attachment_meta' | 'wrapped_key';

export interface VaultItemIdentity {
  workspaceId: string;
  itemId: string;
  schemaVersion: number;
  keyVersion: number;
  revision: number;
}

export interface PurposeBoundEnvelopeRef {
  identity: VaultItemIdentity;
  fieldRole: FieldRole;
  envelopeId: string;
  ciphertextSha256: string;
}

/** Bind ciphertext to purpose/field role — title/body/attachment/wrap are not interchangeable. */
export function purposeBoundAad(
  identity: VaultItemIdentity,
  fieldRole: FieldRole,
  itemType = 'vault_note'
): string {
  return JSON.stringify({
    keyVersion: identity.keyVersion,
    schemaVersion: identity.schemaVersion,
    revision: identity.revision,
    itemType,
    itemId: identity.itemId,
    workspaceId: identity.workspaceId,
    fieldRole,
  });
}

export function assertPurposeMatch(
  envelopeAad: string,
  identity: VaultItemIdentity,
  fieldRole: FieldRole
): void {
  const expected = purposeBoundAad(identity, fieldRole);
  if (envelopeAad !== expected) {
    throw new Error(
      `Purpose/field-role binding mismatch: cannot use envelope as ${fieldRole} for this item revision.`
    );
  }
}

export interface TrustedCheckpoint {
  workspaceId: string;
  deviceId: string;
  /** Monotonic per-item accepted revision map (synthetic). */
  acceptedRevisions: Record<string, number>;
  /** Key epoch the device last successfully unlocked. */
  keyEpoch: number;
  updatedAt: string;
}

export type ReplayDecision = 'accept' | 'reject_stale' | 'reject_unknown_item' | 'accept_with_reduced_assurance';

/**
 * Checkpoint rules for replay detection.
 * Missing checkpoint on fresh device ⇒ reduced rollback resistance (documented limit).
 */
export function evaluateEnvelopeAgainstCheckpoint(
  checkpoint: TrustedCheckpoint | null,
  itemId: string,
  envelopeRevision: number,
  envelopeKeyEpoch: number
): { decision: ReplayDecision; reason: string } {
  if (!checkpoint) {
    return {
      decision: 'accept_with_reduced_assurance',
      reason:
        'No trusted checkpoint on this device (fresh-device recovery). Older valid ciphertext for the same item may be accepted until a checkpoint is established.',
    };
  }
  if (envelopeKeyEpoch < checkpoint.keyEpoch) {
    return {
      decision: 'reject_stale',
      reason: 'Envelope key epoch is behind the device checkpoint key epoch.',
    };
  }
  const accepted = checkpoint.acceptedRevisions[itemId];
  if (accepted === undefined) {
    return {
      decision: 'accept',
      reason: 'First observed revision for item under existing checkpoint.',
    };
  }
  if (envelopeRevision < accepted) {
    return {
      decision: 'reject_stale',
      reason: `Envelope revision ${envelopeRevision} is behind accepted revision ${accepted}.`,
    };
  }
  if (envelopeRevision === accepted) {
    return {
      decision: 'accept',
      reason: 'Idempotent delivery of already-accepted revision.',
    };
  }
  return {
    decision: 'accept',
    reason: 'Monotonic revision advance.',
  };
}

export interface CiphertextConflictSet {
  itemId: string;
  versions: Array<{ revision: number; envelopeId: string; ciphertextSha256: string }>;
}

/** Preserve distinct ciphertext conflicts without silent overwrite. */
export function mergeConflictPreserving(
  existing: CiphertextConflictSet | null,
  incoming: { revision: number; envelopeId: string; ciphertextSha256: string },
  itemId: string
): CiphertextConflictSet {
  if (!existing) {
    return { itemId, versions: [incoming] };
  }
  if (existing.itemId !== itemId) {
    throw new Error('Conflict set itemId mismatch.');
  }
  const dup = existing.versions.find((v) => v.envelopeId === incoming.envelopeId);
  if (dup) return existing;
  const sameRev = existing.versions.find((v) => v.revision === incoming.revision);
  if (sameRev && sameRev.ciphertextSha256 !== incoming.ciphertextSha256) {
    // Distinct ciphertext at same revision — keep both for user resolution.
    return { itemId, versions: [...existing.versions, incoming] };
  }
  if (sameRev) return existing;
  return { itemId, versions: [...existing.versions, incoming] };
}

export type TransferState =
  | 'proposed'
  | 'encrypting'
  | 'uploading'
  | 'ciphertext_accepted'
  | 'cleanup_ordinary'
  | 'transfer_complete'
  | 'encrypt_failed'
  | 'upload_failed'
  | 'verify_failed'
  | 'cleanup_failed';

/** Explicit client proof required before ciphertext_accepted / cleanup. */
export interface CiphertextVerificationEvidence {
  /** Destination vault item the ciphertext was verified against. */
  vaultItemId: string;
  /** Ordinary source revision that was encrypted (must match transfer binding). */
  sourceRevision: number;
  /** Stable identity of accepted ciphertext (e.g. SHA-256 of envelope bytes). */
  ciphertextIdentity: string;
  /** True only after decrypt/tag verify against expected destination AAD. */
  decryptVerified: boolean;
}

/**
 * Deliberate policy when the ordinary source changes during transfer.
 * Silent deletion of newer ordinary content is never allowed.
 */
export type SourceEditDisposition = 'restart_reconcile' | 'preserve_changed_source';

export interface TransferRecord {
  operationId: string;
  state: TransferState;
  ordinaryItemId: string;
  vaultItemId: string | null;
  /** Bound on first successful acceptance; retries may not substitute. */
  boundCiphertextIdentity: string | null;
  ciphertextVerified: boolean;
  verificationEvidence: CiphertextVerificationEvidence | null;
  ordinarySourceRevisionAtStart: number;
  ordinarySourceRevisionLatest: number;
  sourceEditDisposition: SourceEditDisposition | null;
  sharedAttachmentFileIds: string[];
  retainedOrdinaryCopyDisclosed: boolean;
  /**
   * Observable cleanup completion — scheduling a versions job alone is insufficient.
   * `versionsCleanupCompleted` requires confirmed deletion/absence of ordinary versions.
   */
  cleanupEvidence: {
    searchIndexRemoved: boolean;
    previewsPurged: boolean;
    cachesCleared: boolean;
    versionsCleanupCompleted: boolean;
    pendingJobsDrained: boolean;
  };
  /** Non-authoritative: recording that a versions-cleanup job was scheduled. */
  versionsCleanupJobScheduled: boolean;
  failureReason?: string;
}

const ALLOWED: Record<TransferState, TransferState[]> = {
  proposed: ['encrypting'],
  encrypting: ['uploading', 'encrypt_failed'],
  uploading: ['ciphertext_accepted', 'upload_failed', 'verify_failed'],
  ciphertext_accepted: ['cleanup_ordinary'],
  cleanup_ordinary: ['transfer_complete', 'cleanup_failed'],
  transfer_complete: [],
  encrypt_failed: ['encrypting'],
  upload_failed: ['uploading'],
  verify_failed: ['uploading'],
  cleanup_failed: ['cleanup_ordinary'],
};

export function createTransfer(operationId: string, ordinaryItemId: string, sourceRev: number): TransferRecord {
  return {
    operationId,
    state: 'proposed',
    ordinaryItemId,
    vaultItemId: null,
    boundCiphertextIdentity: null,
    ciphertextVerified: false,
    verificationEvidence: null,
    ordinarySourceRevisionAtStart: sourceRev,
    ordinarySourceRevisionLatest: sourceRev,
    sourceEditDisposition: null,
    sharedAttachmentFileIds: [],
    retainedOrdinaryCopyDisclosed: false,
    cleanupEvidence: {
      searchIndexRemoved: false,
      previewsPurged: false,
      cachesCleared: false,
      versionsCleanupCompleted: false,
      pendingJobsDrained: false,
    },
    versionsCleanupJobScheduled: false,
  };
}

export function sourceChangedDuringTransfer(record: TransferRecord): boolean {
  return record.ordinarySourceRevisionLatest > record.ordinarySourceRevisionAtStart;
}

export type TransitionOpts = {
  operationId: string;
  verificationEvidence?: CiphertextVerificationEvidence;
  vaultItemId?: string;
  failureReason?: string;
  /** Required at cleanup when another ordinary item still references a shared binary. */
  sharedFileStillReferenced?: boolean;
};

function assertIdempotentBindings(record: TransferRecord, opts: TransitionOpts): void {
  if (opts.vaultItemId !== undefined && record.vaultItemId !== null && opts.vaultItemId !== record.vaultItemId) {
    throw new Error(
      'Idempotent retry cannot substitute a different vault destination under the same operationId.'
    );
  }
  if (
    opts.verificationEvidence &&
    record.boundCiphertextIdentity !== null &&
    opts.verificationEvidence.ciphertextIdentity !== record.boundCiphertextIdentity
  ) {
    throw new Error(
      'Idempotent retry cannot substitute a different ciphertext identity under the same operationId.'
    );
  }
  if (
    opts.verificationEvidence &&
    record.vaultItemId !== null &&
    opts.verificationEvidence.vaultItemId !== record.vaultItemId
  ) {
    throw new Error(
      'Idempotent retry cannot substitute a different vault destination under the same operationId.'
    );
  }
}

function requireVerificationEvidence(
  record: TransferRecord,
  opts: TransitionOpts
): CiphertextVerificationEvidence {
  const ev = opts.verificationEvidence;
  if (!ev) {
    throw new Error(
      'ciphertext_accepted requires explicit verification evidence bound to destination, source revision, and ciphertext identity.'
    );
  }
  if (!ev.decryptVerified) {
    throw new Error('Verification evidence must include successful decrypt/tag verification.');
  }
  if (!ev.vaultItemId || ev.vaultItemId.trim() === '') {
    throw new Error('Verification evidence requires a vault destination item id.');
  }
  if (!ev.ciphertextIdentity || ev.ciphertextIdentity.trim() === '') {
    throw new Error('Verification evidence requires a ciphertext identity.');
  }
  if (ev.sourceRevision !== record.ordinarySourceRevisionAtStart) {
    throw new Error(
      `Verification evidence sourceRevision ${ev.sourceRevision} does not match encrypted source revision ${record.ordinarySourceRevisionAtStart}.`
    );
  }
  if (record.boundCiphertextIdentity !== null && ev.ciphertextIdentity !== record.boundCiphertextIdentity) {
    throw new Error('Ciphertext identity does not match the identity bound to this operationId.');
  }
  if (record.vaultItemId !== null && ev.vaultItemId !== record.vaultItemId) {
    throw new Error('Vault destination does not match the destination bound to this operationId.');
  }
  return ev;
}

function assertCleanupAllowed(record: TransferRecord, opts: TransitionOpts): void {
  if (!record.ciphertextVerified || !record.verificationEvidence) {
    throw new Error('Cleanup forbidden before verified ciphertext acceptance with evidence.');
  }
  if (!record.vaultItemId || !record.boundCiphertextIdentity) {
    throw new Error('Cleanup forbidden without bound vault destination and ciphertext identity.');
  }
  if (sourceChangedDuringTransfer(record)) {
    if (record.sourceEditDisposition === null) {
      throw new Error(
        'Ordinary source changed during transfer; set restart_reconcile or preserve_changed_source before cleanup. Silent deletion of newer content is forbidden.'
      );
    }
    if (record.sourceEditDisposition === 'restart_reconcile') {
      throw new Error(
        'Source edit disposition is restart_reconcile; re-encrypt from the new revision before cleanup.'
      );
    }
    if (record.sourceEditDisposition === 'preserve_changed_source' && !record.retainedOrdinaryCopyDisclosed) {
      throw new Error(
        'preserve_changed_source requires explicit retained ordinary-copy disclosure before cleanup.'
      );
    }
  }
  const shared = opts.sharedFileStillReferenced === true;
  if (shared && !record.retainedOrdinaryCopyDisclosed) {
    throw new Error(
      'Ordinary binary still referenced by another item; explicit retained-copy disclosure required before cleanup.'
    );
  }
}

/** True only when every required cleanup completion flag is set (not mere job scheduling). */
export function hasRequiredCleanupCompletionEvidence(record: TransferRecord): boolean {
  const e = record.cleanupEvidence;
  return (
    e.searchIndexRemoved &&
    e.previewsPurged &&
    e.cachesCleared &&
    e.versionsCleanupCompleted &&
    e.pendingJobsDrained
  );
}

export function canMarkTransferComplete(record: TransferRecord): boolean {
  if (record.state !== 'cleanup_ordinary' && record.state !== 'transfer_complete') return false;
  if (!record.ciphertextVerified || !record.verificationEvidence) return false;
  // Scheduling alone must never establish completion.
  if (record.versionsCleanupJobScheduled && !record.cleanupEvidence.versionsCleanupCompleted) {
    return false;
  }
  return hasRequiredCleanupCompletionEvidence(record);
}

/**
 * Idempotent transition: same operationId + same target state is a no-op success
 * only when destination/ciphertext bindings are unchanged.
 * Safety gates are enforced inside this function — callers cannot bypass via omitted helpers.
 */
export function transitionTransfer(
  record: TransferRecord,
  to: TransferState,
  opts: TransitionOpts
): TransferRecord {
  if (opts.operationId !== record.operationId) {
    throw new Error('Transfer operationId mismatch (idempotency key).');
  }
  assertIdempotentBindings(record, opts);

  if (record.state === to) {
    // Idempotent retry: reject binding substitutions; otherwise no-op.
    return record;
  }

  const allowed = ALLOWED[record.state] || [];
  if (!allowed.includes(to)) {
    throw new Error(`Illegal transfer transition ${record.state} → ${to}`);
  }

  if (to === 'ciphertext_accepted') {
    const ev = requireVerificationEvidence(record, opts);
    return {
      ...record,
      state: to,
      ciphertextVerified: true,
      verificationEvidence: ev,
      vaultItemId: ev.vaultItemId,
      boundCiphertextIdentity: ev.ciphertextIdentity,
      failureReason: undefined,
    };
  }

  if (to === 'cleanup_ordinary') {
    assertCleanupAllowed(record, opts);
    return {
      ...record,
      state: to,
      failureReason: undefined,
    };
  }

  if (to === 'transfer_complete') {
    if (!canMarkTransferComplete({ ...record, state: 'cleanup_ordinary' })) {
      throw new Error(
        'transfer_complete forbidden: required cleanup completion evidence missing (scheduling a versions-cleanup job is not sufficient).'
      );
    }
    return {
      ...record,
      state: to,
      failureReason: undefined,
    };
  }

  if (to === 'verify_failed' || to === 'upload_failed' || to === 'encrypt_failed' || to === 'cleanup_failed') {
    return {
      ...record,
      state: to,
      failureReason: opts.failureReason,
      // Failures never invent verification.
      ciphertextVerified: record.ciphertextVerified,
    };
  }

  return {
    ...record,
    state: to,
    vaultItemId: opts.vaultItemId ?? record.vaultItemId,
    failureReason: opts.failureReason,
  };
}

export function noteOrdinaryEditDuringTransfer(record: TransferRecord, latestRev: number): TransferRecord {
  if (latestRev < record.ordinarySourceRevisionLatest) {
    throw new Error('Ordinary source revision moved backwards.');
  }
  if (latestRev === record.ordinarySourceRevisionLatest) {
    return record;
  }
  // Clear prior disposition — a new edit requires an explicit choice again.
  return {
    ...record,
    ordinarySourceRevisionLatest: latestRev,
    sourceEditDisposition: null,
  };
}

/**
 * Apply deliberate source-edit policy.
 * - restart_reconcile: return to encrypting with atStart advanced to latest (re-bind required).
 * - preserve_changed_source: keep vault copy of older revision; ordinary newer content retained (disclosure required before cleanup).
 */
export function applySourceEditDisposition(
  record: TransferRecord,
  disposition: SourceEditDisposition
): TransferRecord {
  if (!sourceChangedDuringTransfer(record)) {
    throw new Error('No ordinary source change to dispose.');
  }
  if (disposition === 'restart_reconcile') {
    if (record.state === 'transfer_complete') {
      throw new Error('Cannot restart a completed transfer.');
    }
    return {
      ...record,
      state: 'encrypting',
      sourceEditDisposition: 'restart_reconcile',
      ordinarySourceRevisionAtStart: record.ordinarySourceRevisionLatest,
      ciphertextVerified: false,
      verificationEvidence: null,
      vaultItemId: null,
      boundCiphertextIdentity: null,
      cleanupEvidence: {
        searchIndexRemoved: false,
        previewsPurged: false,
        cachesCleared: false,
        versionsCleanupCompleted: false,
        pendingJobsDrained: false,
      },
      versionsCleanupJobScheduled: false,
      failureReason: undefined,
    };
  }
  return {
    ...record,
    sourceEditDisposition: 'preserve_changed_source',
  };
}

/** Record that the user was shown an explicit retained ordinary-copy disclosure. */
export function discloseRetainedOrdinaryCopy(record: TransferRecord): TransferRecord {
  return { ...record, retainedOrdinaryCopyDisclosed: true };
}

/** Cleanup must not proceed while shared ordinary binaries remain without disclosure. */
export function assertSharedReferenceCleanupAllowed(
  record: TransferRecord,
  sharedFileStillReferenced: boolean
): void {
  if (sharedFileStillReferenced && !record.retainedOrdinaryCopyDisclosed) {
    throw new Error(
      'Ordinary binary still referenced by another item; explicit retained-copy disclosure required before cleanup.'
    );
  }
}

export function scheduleVersionsCleanupJob(record: TransferRecord): TransferRecord {
  if (record.state !== 'cleanup_ordinary') {
    throw new Error('versions-cleanup job may only be scheduled during cleanup_ordinary.');
  }
  return { ...record, versionsCleanupJobScheduled: true };
}

export function applyCleanupEvidence(
  record: TransferRecord,
  evidence: Partial<TransferRecord['cleanupEvidence']>
): TransferRecord {
  if (record.state !== 'cleanup_ordinary' && record.state !== 'transfer_complete') {
    throw new Error('Cleanup evidence only applicable during/after cleanup_ordinary.');
  }
  return {
    ...record,
    cleanupEvidence: { ...record.cleanupEvidence, ...evidence },
  };
}

/** Default-deny exclusion registry — new consumers must be listed. */
export const VAULT_EXCLUSION_SURFACES = [
  'search',
  'previews',
  'reminders',
  'analytics',
  'chat',
  'ai_retrieval',
  'logs',
  'telemetry',
  'notification_bodies',
  'drive_mirroring',
] as const;

export type ExclusionSurface = (typeof VAULT_EXCLUSION_SURFACES)[number];

export function assertVaultExcluded(
  surface: string,
  allowlist: readonly string[] = VAULT_EXCLUSION_SURFACES
): void {
  if (!allowlist.includes(surface)) {
    throw new Error(
      `Unknown consumer "${surface}" is not registered in the vault exclusion allowlist (default-deny).`
    );
  }
}
