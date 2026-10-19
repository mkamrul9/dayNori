/**
 * Phase 48 Drive spike runner (plain Node, no TS loader required).
 * --mode=mock (default) | --mode=live
 * Never prints tokens or secrets.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const modeArg = process.argv.find((a) => a.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : 'mock';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const RESTRICTED_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

const EXPERIMENT_CASES = [
  { id: 'app-created-file', description: 'App-created file under drive.file', authorizationPath: 'app_created' },
  { id: 'picker-selected-file', description: 'Existing file explicitly selected through Picker', authorizationPath: 'picker_file' },
  { id: 'never-selected-file', description: 'Existing file never selected', authorizationPath: 'never_selected' },
  { id: 'picker-selected-folder', description: 'Selected existing folder (folder resource itself)', authorizationPath: 'picker_folder' },
  { id: 'existing-children-of-selected-folder', description: 'Existing children of a selected folder', authorizationPath: 'picker_folder' },
  { id: 'external-child-after-folder-selection', description: 'Child added externally after folder selection', authorizationPath: 'external_child_after_folder_pick' },
  { id: 'app-created-child-in-authorized-location', description: 'App-created child uploaded into an authorized location', authorizationPath: 'app_created_in_authorized_folder' },
  { id: 'independently-selected-child', description: 'Child explicitly selected independently via Picker', authorizationPath: 'independent_picker' },
  { id: 'file-move', description: 'Authorized file moved', authorizationPath: 'post_move' },
  { id: 'trash-restore', description: 'Trash/restore of synthetic authorized object', authorizationPath: 'trash_restore' },
  { id: 'permission-loss', description: 'Permission loss on previously authorized object', authorizationPath: 'permission_loss' },
  { id: 'grant-revocation', description: 'User revokes app grant', authorizationPath: 'grant_revoked' },
  { id: 'reauth-incremental', description: 'Reauthorization / incremental consent behavior', authorizationPath: 'reauth_incremental' },
];

function expectedMatrixForCase(c) {
  const denied = {
    metadata: 'denied',
    enumerate: 'denied',
    download_or_export: 'denied',
    create_upload: 'denied',
    update_move_trash: 'denied',
  };
  switch (c.authorizationPath) {
    case 'app_created':
    case 'app_created_in_authorized_folder':
      return {
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
          capabilities: { ...denied },
          notes: 'Do not assume folder selection grants existing children. Live proof required.',
        };
      }
      return {
        capabilities: {
          metadata: 'allowed',
          enumerate: 'unverified',
          download_or_export: 'denied',
          create_upload: 'unverified',
          update_move_trash: 'allowed',
        },
        notes: 'Folder resource itself may be authorized; children are the experiment under test.',
      };
    case 'never_selected':
    case 'external_child_after_folder_pick':
    case 'permission_loss':
    case 'grant_revoked':
      return { capabilities: { ...denied }, notes: 'Not in per-file grant / access lost.' };
    case 'trash_restore':
      return {
        capabilities: {
          metadata: 'allowed',
          enumerate: 'allowed',
          download_or_export: 'allowed',
          create_upload: 'denied',
          update_move_trash: 'allowed',
        },
        notes: 'Synthetic authorized object trash/restore when still authorized.',
      };
    default:
      return {
        capabilities: {
          metadata: 'unverified',
          enumerate: 'unverified',
          download_or_export: 'unverified',
          create_upload: 'unverified',
          update_move_trash: 'unverified',
        },
        notes: 'Live-only observation.',
      };
  }
}

function parseEnvFile(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function loadConfig() {
  const localPath = join(here, 'config.local.env');
  const fromFile = existsSync(localPath) ? parseEnvFile(localPath) : {};
  const clientId = process.env.DAYNORI_DRIVE_CLIENT_ID || fromFile.DAYNORI_DRIVE_CLIENT_ID || '';
  const clientSecret =
    process.env.DAYNORI_DRIVE_CLIENT_SECRET || fromFile.DAYNORI_DRIVE_CLIENT_SECRET || '';
  const requestedScope =
    process.env.DAYNORI_DRIVE_REQUESTED_SCOPE ||
    fromFile.DAYNORI_DRIVE_REQUESTED_SCOPE ||
    DRIVE_FILE_SCOPE;
  if (/\/auth\/drive$|drive\.readonly|drive\.metadata/.test(requestedScope)) {
    throw new Error('Spike refuses restricted/broader Drive scopes.');
  }
  return {
    clientIdSet: Boolean(clientId),
    clientSecretSet: Boolean(clientSecret),
    loginHintSet: Boolean(process.env.DAYNORI_DRIVE_LOGIN_HINT || fromFile.DAYNORI_DRIVE_LOGIN_HINT),
    redirectUri:
      process.env.DAYNORI_DRIVE_REDIRECT_URI ||
      fromFile.DAYNORI_DRIVE_REDIRECT_URI ||
      'http://127.0.0.1:8765/oauth2callback',
    requestedScope,
    localEnvFilePresent: existsSync(localPath),
  };
}

const startedAt = new Date().toISOString();
const config = loadConfig();
const inventory = EXPERIMENT_CASES.map((c) => {
  const expected = expectedMatrixForCase(c);
  return {
    caseId: c.id,
    description: c.description,
    requestedScope: DRIVE_FILE_SCOPE,
    authorizationPath: c.authorizationPath,
    documentationExpectation: expected,
    observed:
      mode === 'live'
        ? {
            status: 'unexecuted',
            reason: config.clientIdSet
              ? 'Interactive live consent not completed in this environment.'
              : 'OAuth configuration missing (DAYNORI_DRIVE_CLIENT_ID unset).',
            grantedScope: null,
            httpStatus: null,
            capabilities: null,
          }
        : {
            status: 'mock_expectation_only',
            reason: 'Mock mode — not live OAuth proof.',
            grantedScope: null,
            httpStatus: null,
            capabilities: expected.capabilities,
          },
  };
});

const report = {
  phase: 48,
  mode,
  startedAt,
  endedAt: new Date().toISOString(),
  configInspection: config,
  refusedScopes: RESTRICTED_DRIVE_SCOPES,
  decisionCandidate: 'selected_app_created_file_mode',
  decisionRationale:
    'Prefer drive.file + Picker/app-created files. Do not promise recursive folder mirroring without live proof and restricted-scope verification/assessment.',
  vaultExclusion: 'Vault material is excluded from Drive experiments and future ordinary connector behavior.',
  inventory,
  liveHandoff: config.clientIdSet
    ? {
        needed: [
          'Interactive browser consent on a clean test account',
          'Google Picker selection of synthetic fixtures',
          'Capture granted scope (redacted) and fill observed.capabilities',
        ],
        command: 'node tests/spikes/drive/run-spike.mjs --mode=live',
      }
    : {
        needed: [
          'Create Google Cloud OAuth client with Drive API enabled',
          'Copy config.example.env → config.local.env and set DAYNORI_DRIVE_CLIENT_ID',
          'Use a dedicated test account; revoke prior grants for a clean narrow-scope experiment',
          'Re-run: node tests/spikes/drive/run-spike.mjs --mode=live',
        ],
        command: 'node tests/spikes/drive/run-spike.mjs --mode=mock',
      },
};

const outDir = join(here, 'results');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, mode === 'live' ? 'live-pending.json' : 'mock-inventory.json');
writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

console.log(`Phase 48 spike mode=${mode}`);
console.log(`clientIdSet=${config.clientIdSet} clientSecretSet=${config.clientSecretSet}`);
console.log(`requestedScope=${config.requestedScope}`);
console.log(`cases=${inventory.length} written=${outPath}`);
console.log(`decisionCandidate=${report.decisionCandidate}`);
if (!config.clientIdSet) {
  console.log('LIVE_UNVERIFIED: provide DAYNORI_DRIVE_CLIENT_ID in config.local.env to run live experiments.');
}
