/**
 * Spike experiment inventory — scope constants/validation live in @daynori/domain.
 */

import { DRIVE_FILE_SCOPE } from '@daynori/domain';

export {
  DRIVE_FILE_SCOPE,
  FORBIDDEN_DRIVE_SCOPES as RESTRICTED_DRIVE_SCOPES,
  APPROVED_DRIVE_SCOPES,
  tokenizeScopes,
  validateRequestedDriveScopes,
  validateGrantedDriveScopes,
  assertNarrowScope,
  assertCleanNarrowGrant,
} from '@daynori/domain';

export type Capability =
  | 'metadata'
  | 'enumerate'
  | 'download_or_export'
  | 'create_upload'
  | 'update_move_trash';

export type CapabilityResult = 'allowed' | 'denied' | 'unverified' | 'error' | 'n/a';

/** Evidence lanes must stay separate in reports. */
export type EvidenceLane = 'documentation_expectation' | 'synthetic_assumption' | 'live_observation';

export interface ExperimentCase {
  id: string;
  description: string;
  requestedScope: string;
  authorizationPath:
    | 'app_created'
    | 'picker_file'
    | 'picker_folder'
    | 'never_selected'
    | 'external_child_after_folder_pick'
    | 'app_created_in_authorized_folder'
    | 'independent_picker'
    | 'post_move'
    | 'trash_restore'
    | 'permission_loss'
    | 'grant_revoked'
    | 'reauth_incremental';
}

export const EXPERIMENT_CASES: ExperimentCase[] = [
  {
    id: 'app-created-file',
    description: 'App-created file under drive.file',
    requestedScope: DRIVE_FILE_SCOPE,
    authorizationPath: 'app_created',
  },
  {
    id: 'picker-selected-file',
    description: 'Existing file explicitly selected through Picker',
    requestedScope: DRIVE_FILE_SCOPE,
    authorizationPath: 'picker_file',
  },
  {
    id: 'never-selected-file',
    description: 'Existing file never selected',
    requestedScope: DRIVE_FILE_SCOPE,
    authorizationPath: 'never_selected',
  },
  {
    id: 'picker-selected-folder',
    description: 'Selected existing folder (folder resource itself)',
    requestedScope: DRIVE_FILE_SCOPE,
    authorizationPath: 'picker_folder',
  },
  {
    id: 'existing-children-of-selected-folder',
    description: 'Existing children of a selected folder (must not assume recursive grant)',
    requestedScope: DRIVE_FILE_SCOPE,
    authorizationPath: 'picker_folder',
  },
  {
    id: 'external-child-after-folder-selection',
    description: 'Child added externally after folder selection',
    requestedScope: DRIVE_FILE_SCOPE,
    authorizationPath: 'external_child_after_folder_pick',
  },
  {
    id: 'app-created-child-in-authorized-location',
    description: 'App-created child uploaded into an authorized location',
    requestedScope: DRIVE_FILE_SCOPE,
    authorizationPath: 'app_created_in_authorized_folder',
  },
  {
    id: 'independently-selected-child',
    description: 'Child explicitly selected independently via Picker',
    requestedScope: DRIVE_FILE_SCOPE,
    authorizationPath: 'independent_picker',
  },
  {
    id: 'file-move',
    description: 'Authorized file moved (inside/outside authorized parents)',
    requestedScope: DRIVE_FILE_SCOPE,
    authorizationPath: 'post_move',
  },
  {
    id: 'trash-restore',
    description: 'Trash/restore of synthetic authorized object',
    requestedScope: DRIVE_FILE_SCOPE,
    authorizationPath: 'trash_restore',
  },
  {
    id: 'permission-loss',
    description: 'Permission loss on previously authorized object',
    requestedScope: DRIVE_FILE_SCOPE,
    authorizationPath: 'permission_loss',
  },
  {
    id: 'grant-revocation',
    description: 'User revokes app grant',
    requestedScope: DRIVE_FILE_SCOPE,
    authorizationPath: 'grant_revoked',
  },
  {
    id: 'reauth-incremental',
    description: 'Reauthorization / incremental consent behavior',
    requestedScope: DRIVE_FILE_SCOPE,
    authorizationPath: 'reauth_incremental',
  },
];
