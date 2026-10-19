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

export interface TransferRecord {
  operationId: string;
  state: TransferState;
  ordinaryItemId: string;
  vaultItemId: string | null;
  ciphertextVerified: boolean;
  ordinarySourceRevisionAtStart: number;
  ordinarySourceRevisionLatest: number;
  sharedAttachmentFileIds: string[];
  retainedOrdinaryCopyDisclosed: boolean;
  cleanupEvidence: {
    searchIndexRemoved: boolean;
    previewsPurged: boolean;
    cachesCleared: boolean;
    versionsScheduled: boolean;
    pendingJobsDrained: boolean;
  };
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
    ciphertextVerified: false,
    ordinarySourceRevisionAtStart: sourceRev,
    ordinarySourceRevisionLatest: sourceRev,
    sharedAttachmentFileIds: [],
    retainedOrdinaryCopyDisclosed: false,
    cleanupEvidence: {
      searchIndexRemoved: false,
      previewsPurged: false,
      cachesCleared: false,
      versionsScheduled: false,
      pendingJobsDrained: false,
    },
  };
}

/** Idempotent transition: same operationId + same target state is a no-op success. */
export function transitionTransfer(
  record: TransferRecord,
  to: TransferState,
  opts: {
    operationId: string;
    ciphertextVerified?: boolean;
    vaultItemId?: string;
    failureReason?: string;
  }
): TransferRecord {
  if (opts.operationId !== record.operationId) {
    throw new Error('Transfer operationId mismatch (idempotency key).');
  }
  if (record.state === to) {
    return record; // idempotent retry
  }
  const allowed = ALLOWED[record.state] || [];
  if (!allowed.includes(to)) {
    throw new Error(`Illegal transfer transition ${record.state} → ${to}`);
  }

  // Hard gate: never enter cleanup before verified ciphertext acceptance.
  if (to === 'cleanup_ordinary' && !record.ciphertextVerified && opts.ciphertextVerified !== true) {
    throw new Error('Cleanup forbidden before verified ciphertext acceptance.');
  }

  const next: TransferRecord = {
    ...record,
    state: to,
    ciphertextVerified:
      opts.ciphertextVerified === true ? true : record.ciphertextVerified || to === 'ciphertext_accepted',
    vaultItemId: opts.vaultItemId ?? record.vaultItemId,
    failureReason: opts.failureReason,
  };

  if (to === 'ciphertext_accepted') {
    next.ciphertextVerified = true;
  }
  return next;
}

export function noteOrdinaryEditDuringTransfer(record: TransferRecord, latestRev: number): TransferRecord {
  if (latestRev < record.ordinarySourceRevisionLatest) {
    throw new Error('Ordinary source revision moved backwards.');
  }
  return { ...record, ordinarySourceRevisionLatest: latestRev };
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

export function canMarkTransferComplete(record: TransferRecord): boolean {
  if (record.state !== 'cleanup_ordinary' && record.state !== 'transfer_complete') return false;
  if (!record.ciphertextVerified) return false;
  const e = record.cleanupEvidence;
  return (
    e.searchIndexRemoved &&
    e.previewsPurged &&
    e.cachesCleared &&
    e.versionsScheduled &&
    e.pendingJobsDrained
  );
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
