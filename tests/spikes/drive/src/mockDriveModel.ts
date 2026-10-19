/**
 * Documentation / synthetic expectation matrix — not live Google observations.
 * Selection (OAuth file authorization) ≠ provider capability (edit/move/trash).
 */

import type { Capability, CapabilityResult, ExperimentCase } from './scopes.js';

export interface CaseCapabilityMatrix {
  caseId: string;
  /** documentation_expectation or synthetic_assumption — never live_observation */
  evidenceLane: 'documentation_expectation' | 'synthetic_assumption';
  /** OAuth/file authorization expectation (may the app call APIs for this object?). */
  oauthAuthorization: 'authorized' | 'unauthorized' | 'unverified';
  /**
   * Provider capability expectations if authorized. Must not treat selection alone
   * as proof a read-only shared file can be edited/moved/trashed.
   */
  capabilities: Record<Capability, CapabilityResult>;
  notes: string;
}

export function expectedMatrixForCase(c: ExperimentCase): CaseCapabilityMatrix {
  const allDenied = (): Record<Capability, CapabilityResult> => ({
    metadata: 'denied',
    enumerate: 'denied',
    download_or_export: 'denied',
    create_upload: 'denied',
    update_move_trash: 'denied',
  });

  const allUnverified = (): Record<Capability, CapabilityResult> => ({
    metadata: 'unverified',
    enumerate: 'unverified',
    download_or_export: 'unverified',
    create_upload: 'unverified',
    update_move_trash: 'unverified',
  });

  switch (c.authorizationPath) {
    case 'app_created':
    case 'app_created_in_authorized_folder':
      return {
        caseId: c.id,
        evidenceLane: 'documentation_expectation',
        oauthAuthorization: 'authorized',
        capabilities: {
          metadata: 'allowed',
          enumerate: 'allowed',
          download_or_export: 'allowed',
          create_upload: 'allowed',
          // Capability still depends on ACLs; app-created usually writable.
          update_move_trash: 'unverified',
        },
        notes:
          'App-created objects are in the drive.file per-file set. Mutating capability still requires live ACL proof.',
      };
    case 'picker_file':
    case 'independent_picker':
      return {
        caseId: c.id,
        evidenceLane: 'documentation_expectation',
        oauthAuthorization: 'authorized',
        capabilities: {
          metadata: 'allowed',
          enumerate: 'allowed',
          download_or_export: 'unverified',
          create_upload: 'n/a',
          update_move_trash: 'unverified',
        },
        notes:
          'Picker selection authorizes the file for the app; download/edit/trash still depend on the user’s role on that file.',
      };
    case 'picker_folder':
      if (c.id === 'existing-children-of-selected-folder') {
        return {
          caseId: c.id,
          evidenceLane: 'synthetic_assumption',
          oauthAuthorization: 'unverified',
          capabilities: allUnverified(),
          notes:
            'Unmeasured: do not treat mock denial as an observed Google denial. Folder pick ≠ proven recursive child grant.',
        };
      }
      return {
        caseId: c.id,
        evidenceLane: 'documentation_expectation',
        oauthAuthorization: 'authorized',
        capabilities: {
          metadata: 'allowed',
          enumerate: 'unverified',
          download_or_export: 'n/a',
          create_upload: 'unverified',
          update_move_trash: 'unverified',
        },
        notes: 'Folder resource may be authorized; child listing/create must be measured live.',
      };
    case 'never_selected':
    case 'external_child_after_folder_pick':
      return {
        caseId: c.id,
        evidenceLane: 'synthetic_assumption',
        oauthAuthorization: 'unauthorized',
        capabilities: allDenied(),
        notes:
          'Synthetic assumption under per-file model — confirm with live 403/404; mock is not observation.',
      };
    case 'post_move':
    case 'reauth_incremental':
      return {
        caseId: c.id,
        evidenceLane: 'synthetic_assumption',
        oauthAuthorization: 'unverified',
        capabilities: allUnverified(),
        notes: 'Live-only.',
      };
    case 'trash_restore':
      return {
        caseId: c.id,
        evidenceLane: 'documentation_expectation',
        oauthAuthorization: 'authorized',
        capabilities: {
          metadata: 'allowed',
          enumerate: 'allowed',
          download_or_export: 'unverified',
          create_upload: 'n/a',
          update_move_trash: 'unverified',
        },
        notes: 'Authorized synthetic object; trash/restore capability still ACL-dependent.',
      };
    case 'permission_loss':
    case 'grant_revoked':
      return {
        caseId: c.id,
        evidenceLane: 'documentation_expectation',
        oauthAuthorization: 'unauthorized',
        capabilities: allDenied(),
        notes: 'After revoke/permission loss, operations must fail closed (live).',
      };
    default:
      return {
        caseId: c.id,
        evidenceLane: 'synthetic_assumption',
        oauthAuthorization: 'unverified',
        capabilities: allUnverified(),
        notes: 'Unknown path.',
      };
  }
}
