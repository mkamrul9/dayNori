/**
 * Fixture model encoding documentation-supported drive.file expectations.
 * Not proof of live OAuth — same-account ownership is not application access.
 */

import type { Capability, CapabilityResult, ExperimentCase } from './scopes.js';

export interface CaseCapabilityMatrix {
  caseId: string;
  capabilities: Record<Capability, CapabilityResult>;
  notes: string;
}

/**
 * Expected outcomes under a clean drive.file grant + Picker per-file authorization,
 * based on Google Drive API scope guidance reviewed 2026-10-19:
 * https://developers.google.com/workspace/drive/api/guides/api-specific-auth
 *
 * Folder pick authorizes the folder resource; it is not treated here as a recursive
 * grant to all existing/future children (must be proven live; mock marks unverified/denied).
 */
export function expectedMatrixForCase(c: ExperimentCase): CaseCapabilityMatrix {
  const allDenied = (): Record<Capability, CapabilityResult> => ({
    metadata: 'denied',
    enumerate: 'denied',
    download_or_export: 'denied',
    create_upload: 'denied',
    update_move_trash: 'denied',
  });

  switch (c.authorizationPath) {
    case 'app_created':
    case 'app_created_in_authorized_folder':
      return {
        caseId: c.id,
        capabilities: {
          metadata: 'allowed',
          enumerate: 'allowed',
          download_or_export: 'allowed',
          create_upload: 'allowed',
          update_move_trash: 'allowed',
        },
        notes: 'App-created objects are in the drive.file per-file set.',
      };
    case 'picker_file':
    case 'independent_picker':
      return {
        caseId: c.id,
        capabilities: {
          metadata: 'allowed',
          enumerate: 'allowed',
          download_or_export: 'allowed',
          create_upload: 'denied',
          update_move_trash: 'allowed',
        },
        notes: 'Explicit Picker selection authorizes that file resource.',
      };
    case 'picker_folder':
      if (c.id === 'existing-children-of-selected-folder') {
        return {
          caseId: c.id,
          capabilities: {
            metadata: 'denied',
            enumerate: 'denied',
            download_or_export: 'denied',
            create_upload: 'denied',
            update_move_trash: 'denied',
          },
          notes:
            'Do not assume folder selection grants existing children. Live proof required; mock expects denial.',
        };
      }
      return {
        caseId: c.id,
        capabilities: {
          metadata: 'allowed',
          enumerate: 'unverified',
          download_or_export: 'denied',
          create_upload: 'unverified',
          update_move_trash: 'allowed',
        },
        notes:
          'Folder resource itself may be authorized; listing/creating children is the experiment under test.',
      };
    case 'never_selected':
    case 'external_child_after_folder_pick':
      return {
        caseId: c.id,
        capabilities: allDenied(),
        notes: 'Never selected / externally added child — not in per-file grant by assumption.',
      };
    case 'post_move':
      return {
        caseId: c.id,
        capabilities: {
          metadata: 'unverified',
          enumerate: 'unverified',
          download_or_export: 'unverified',
          create_upload: 'denied',
          update_move_trash: 'unverified',
        },
        notes: 'Move semantics depend on whether the file remains in the authorized set — live only.',
      };
    case 'trash_restore':
      return {
        caseId: c.id,
        capabilities: {
          metadata: 'allowed',
          enumerate: 'allowed',
          download_or_export: 'allowed',
          create_upload: 'denied',
          update_move_trash: 'allowed',
        },
        notes: 'Synthetic authorized object trash/restore expected when still authorized.',
      };
    case 'permission_loss':
    case 'grant_revoked':
      return {
        caseId: c.id,
        capabilities: allDenied(),
        notes: 'After revoke/permission loss, operations must fail closed.',
      };
    case 'reauth_incremental':
      return {
        caseId: c.id,
        capabilities: {
          metadata: 'unverified',
          enumerate: 'unverified',
          download_or_export: 'unverified',
          create_upload: 'unverified',
          update_move_trash: 'unverified',
        },
        notes: 'Incremental consent must be observed live; do not broaden scopes in the harness.',
      };
    default:
      return {
        caseId: c.id,
        capabilities: allDenied(),
        notes: 'Unknown path — deny.',
      };
  }
}
