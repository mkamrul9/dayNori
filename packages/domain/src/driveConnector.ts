/**
 * Phase 49 — Drive selected-file connector domain invariants.
 * Narrow `drive.file` only; vault excluded; disconnect fencing.
 */

import { DRIVE_FILE_SCOPE, validateGrantedDriveScopes, validateRequestedDriveScopes } from './driveScopes.js';

export type DriveConnectionStatus =
  | 'unconfigured'
  | 'pending_consent'
  | 'connected'
  | 'degraded'
  | 'disconnected'
  | 'revoked';

export type DriveLinkMode = 'link_reference' | 'import_copy' | 'upload_to_drive' | 'download_offline';

export type DriveAuthIntentStatus =
  | 'pending'
  | 'consumed'
  | 'cancelled'
  | 'denied'
  | 'expired'
  | 'failed';

export type DriveJobKind = 'import_copy' | 'upload_to_drive' | 'download_offline' | 'reconcile';

export type DriveDisconnectReason = 'local_disconnect' | 'provider_revocation' | 'invalid_grant';

export interface DriveConnectionSnapshot {
  id: string;
  workspaceId: string;
  accountId: string;
  status: DriveConnectionStatus;
  /** Monotonic generation; incremented on disconnect so late jobs cannot resurrect. */
  generation: number;
  providerAccountEmail: string | null;
  providerSubject: string | null;
  grantedScope: string | null;
}

export interface DriveSelectedObject {
  providerFileId: string;
  mimeType: string;
  name: string;
  /** True when Google reports a shortcut; shortcuts are not silently followed. */
  isShortcut: boolean;
  /** True when resource lives on a shared drive outside supported boundary. */
  isSharedDrive: boolean;
  md5Checksum: string | null;
  version: string | null;
}

export function assertDriveScopesForConnect(requested: string, granted: string): void {
  const req = validateRequestedDriveScopes(requested);
  if (!req.ok) throw new Error(req.message);
  const grant = validateGrantedDriveScopes(granted, { allowOpenIdExtras: true });
  if (!grant.ok) throw new Error(grant.message);
}

export function isVaultDriveTarget(itemKind: string | null | undefined): boolean {
  return itemKind === 'vault' || itemKind === 'vault_item' || itemKind === 'encrypted_vault';
}

/**
 * Application selection boundary: only explicitly selected or app-created provider IDs
 * may be used, even if Google's token could reach more.
 */
export function isProviderObjectAuthorized(
  authorizedProviderIds: ReadonlySet<string>,
  providerFileId: string
): boolean {
  return authorizedProviderIds.has(providerFileId);
}

export function evaluateSelectedObjectSupport(obj: DriveSelectedObject): {
  supported: boolean;
  reason: string | null;
} {
  if (obj.isShortcut) {
    return {
      supported: false,
      reason: 'shortcuts_unsupported_without_explicit_target_selection',
    };
  }
  if (obj.isSharedDrive) {
    return {
      supported: false,
      reason: 'shared_drive_outside_selected_file_boundary',
    };
  }
  return { supported: true, reason: null };
}

/** Auth intents expire and are single-use. */
export function isAuthIntentUsable(input: {
  status: DriveAuthIntentStatus;
  expiresAtMs: number;
  nowMs: number;
  boundAccountId: string;
  boundWorkspaceId: string;
  actorAccountId: string;
  actorWorkspaceId: string;
}): { ok: true } | { ok: false; reason: string } {
  if (input.boundAccountId !== input.actorAccountId) {
    return { ok: false, reason: 'account_mismatch' };
  }
  if (input.boundWorkspaceId !== input.actorWorkspaceId) {
    return { ok: false, reason: 'workspace_mismatch' };
  }
  if (input.status !== 'pending') {
    return { ok: false, reason: `intent_${input.status}` };
  }
  if (input.nowMs > input.expiresAtMs) {
    return { ok: false, reason: 'intent_expired' };
  }
  return { ok: true };
}

/**
 * Fence late refresh/job completions after disconnect.
 * Returning false means the completion must be discarded (no resurrection).
 */
export function mayCompleteDriveWork(input: {
  connectionStatus: DriveConnectionStatus;
  connectionGeneration: number;
  jobGeneration: number;
}): boolean {
  if (input.connectionStatus === 'disconnected' || input.connectionStatus === 'revoked') {
    return false;
  }
  if (input.connectionStatus === 'unconfigured') return false;
  return input.jobGeneration === input.connectionGeneration;
}

export function disconnectExplanation(reason: DriveDisconnectReason): {
  tokensRemoved: true;
  retainedImportedCopies: true;
  remoteOriginalDeleted: false;
  message: string;
} {
  const base = {
    tokensRemoved: true as const,
    retainedImportedCopies: true as const,
    remoteOriginalDeleted: false as const,
  };
  switch (reason) {
    case 'local_disconnect':
      return {
        ...base,
        message:
          'Local disconnect removed stored Google tokens and cancelled pending Drive jobs. Imported/offline copies remain in Daynori unless you delete them. The remote Drive originals were not trashed.',
      };
    case 'provider_revocation':
      return {
        ...base,
        message:
          'Google access was revoked. Daynori stopped Drive work and removed stored tokens. Retained imported/offline copies stay available locally.',
      };
    case 'invalid_grant':
      return {
        ...base,
        message:
          'Google rejected the refresh grant. Connection marked revoked; tokens removed; pending jobs cancelled. Retained copies stay local.',
      };
  }
}

export const DRIVE_CONNECTOR_REQUESTED_SCOPE = DRIVE_FILE_SCOPE;

/** Short-lived Picker access-token handoff constraints (never refresh tokens). */
export const PICKER_ACCESS_TOKEN_TTL_MS = 5 * 60 * 1000;

/** Google Drive MIME type for folder containers. */
export const GOOGLE_DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

export function isDriveFolder(mimeType: string): boolean {
  return mimeType === GOOGLE_DRIVE_FOLDER_MIME;
}

export interface DescendantEvaluationInput {
  parentFolderId: string;
  childFileId: string;
  provenance: 'app_created' | 'picker_selected' | 'external_unpicked' | 'pre_existing_unpicked';
  grantedScope: string;
}

export interface DescendantEvaluationResult {
  authorized: boolean;
  reason: string | null;
  scopeCategory: 'narrow_drive_file' | 'broader_restricted' | 'invalid_scope';
}

/**
 * Phase 107: Under narrow drive.file scope, selecting a folder authorizes the folder
 * resource itself, but DOES NOT grant OAuth permissions to pre-existing or external unpicked descendants.
 * Only app-created files or individually picked files within that folder are authorized.
 */
export function evaluateDescendantAuthorization(
  input: DescendantEvaluationInput
): DescendantEvaluationResult {
  const scopeCheck = validateGrantedDriveScopes(input.grantedScope, { allowOpenIdExtras: true });
  if (!scopeCheck.ok) {
    return {
      authorized: false,
      reason: 'invalid_or_forbidden_scope',
      scopeCategory: 'invalid_scope',
    };
  }

  if (input.provenance === 'app_created' || input.provenance === 'picker_selected') {
    return {
      authorized: true,
      reason: null,
      scopeCategory: 'narrow_drive_file',
    };
  }

  return {
    authorized: false,
    reason: 'drive_file_scope_does_not_grant_unpicked_descendants',
    scopeCategory: 'narrow_drive_file',
  };
}

/**
 * Enforces bounded traversal: Daynori never traverses or queries parents, sibling
 * folders, or root drive outside the user's explicitly selected folder IDs.
 */
export function validateTraversalBoundary(input: {
  targetFolderId: string;
  authorizedFolderIds: ReadonlySet<string>;
}): { withinBoundary: boolean; error?: string } {
  if (input.targetFolderId === 'root' || input.targetFolderId === '') {
    return {
      withinBoundary: false,
      error: 'Root Drive traversal is strictly prohibited without full drive.readonly/drive scope and CASA verification',
    };
  }
  if (!input.authorizedFolderIds.has(input.targetFolderId)) {
    return {
      withinBoundary: false,
      error: 'Target folder is outside authorized folder boundary — sibling or parent folders cannot be enumerated',
    };
  }
  return { withinBoundary: true };
}

export interface DriveFolderTreeNode {
  id: string;
  providerFileId: string;
  displayName: string;
  mimeType: string;
  isFolder: boolean;
  linkMode: DriveLinkMode;
  availability: string;
  provenance: string;
  parentProviderFolderId: string | null;
  children: DriveFolderTreeNode[];
  childCount: number;
}

export interface MinimalDriveItem {
  id: string;
  providerFileId: string;
  displayName: string;
  mimeType: string;
  linkMode: DriveLinkMode;
  availability: string;
  provenance?: string;
  parentProviderFolderId?: string | null;
}

/**
 * Constructs a familiar hierarchical folder tree for authorized Drive items.
 * Items that have a known authorized parent folder are nested under that folder.
 */
export function buildAuthorizedDriveTree<T extends MinimalDriveItem>(
  items: readonly T[],
  parentLookup?: (item: T) => string | null
): DriveFolderTreeNode[] {
  const nodes = new Map<string, DriveFolderTreeNode>();
  for (const it of items) {
    const parentId = parentLookup ? parentLookup(it) : it.parentProviderFolderId ?? null;
    nodes.set(it.providerFileId, {
      id: it.id,
      providerFileId: it.providerFileId,
      displayName: it.displayName,
      mimeType: it.mimeType,
      isFolder: isDriveFolder(it.mimeType),
      linkMode: it.linkMode,
      availability: it.availability,
      provenance: it.provenance ?? 'picker_selected',
      parentProviderFolderId: parentId,
      children: [],
      childCount: 0,
    });
  }

  const roots: DriveFolderTreeNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentProviderFolderId && nodes.has(node.parentProviderFolderId)) {
      const parent = nodes.get(node.parentProviderFolderId)!;
      parent.children.push(node);
      parent.childCount = parent.children.length;
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export interface BroaderScopeRequirements {
  requiredScope: string;
  isRestricted: boolean;
  requiresCASA: boolean;
  casaLevel: 'AL1' | 'AL2' | 'none';
  annualCostRangeUsd: { min: number; max: number };
  recurringAnnualRecertification: boolean;
  googleVerificationRequired: boolean;
  rationale: string;
}

/**
 * Evaluates scope tier, CASA assessment requirements, and cost estimates for broader Google Drive permissions.
 */
export function evaluateBroaderScopeRequirement(
  feature: 'bounded_selected_folder' | 'recursive_folder_mirroring' | 'full_drive_sync'
): BroaderScopeRequirements {
  switch (feature) {
    case 'bounded_selected_folder':
      return {
        requiredScope: DRIVE_FILE_SCOPE,
        isRestricted: false,
        requiresCASA: false,
        casaLevel: 'none',
        annualCostRangeUsd: { min: 0, max: 0 },
        recurringAnnualRecertification: false,
        googleVerificationRequired: false,
        rationale: 'Granular per-file authorization through Google Picker without CASA audit requirement.',
      };
    case 'recursive_folder_mirroring':
      return {
        requiredScope: 'https://www.googleapis.com/auth/drive.readonly',
        isRestricted: true,
        requiresCASA: true,
        casaLevel: 'AL2',
        annualCostRangeUsd: { min: 675, max: 5400 },
        recurringAnnualRecertification: true,
        googleVerificationRequired: true,
        rationale: 'Read-only recursive folder crawling requires restricted scope and annual ADA CASA AL2 security assessment.',
      };
    case 'full_drive_sync':
      return {
        requiredScope: 'https://www.googleapis.com/auth/drive',
        isRestricted: true,
        requiresCASA: true,
        casaLevel: 'AL2',
        annualCostRangeUsd: { min: 1500, max: 15000 },
        recurringAnnualRecertification: true,
        googleVerificationRequired: true,
        rationale: 'Two-way synchronization requires unrestricted drive scope and comprehensive multi-tier lab assessment.',
      };
  }
}

