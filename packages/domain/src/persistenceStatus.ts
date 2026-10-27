/**
 * Canonical persistence/sync labels for note, journal, and library surfaces.
 * Distinct local vs cloud states — never claim success before durable acceptance.
 */

export type LocalPersistenceKind = 'unsaved' | 'saved_on_device' | 'failed';
export type CloudPersistenceKind = 'waiting' | 'synchronized' | 'offline' | 'failed';

export const LOCAL_PERSISTENCE_LABEL: Record<LocalPersistenceKind, string> = {
  unsaved: 'Unsaved',
  saved_on_device: 'Saved on this device',
  failed: 'Failed — retry',
};

export const CLOUD_PERSISTENCE_LABEL: Record<CloudPersistenceKind, string> = {
  waiting: 'Waiting to sync',
  synchronized: 'Synchronized',
  offline: 'Offline',
  failed: 'Failed — retry',
};

export function resolveLocalPersistenceLabel(options: {
  dirty?: boolean;
  failed?: boolean;
  raw?: string | null;
}): string {
  if (options.failed) return LOCAL_PERSISTENCE_LABEL.failed;
  if (options.dirty) return LOCAL_PERSISTENCE_LABEL.unsaved;
  const raw = (options.raw || '').toLowerCase();
  if (!raw || /saved|device|local|ready|checking/.test(raw)) {
    return LOCAL_PERSISTENCE_LABEL.saved_on_device;
  }
  if (/fail|error/.test(raw)) return LOCAL_PERSISTENCE_LABEL.failed;
  if (/unsaved|dirty|editing/.test(raw)) return LOCAL_PERSISTENCE_LABEL.unsaved;
  return options.raw || LOCAL_PERSISTENCE_LABEL.saved_on_device;
}

export function resolveCloudPersistenceLabel(raw?: string | null): string {
  const s = (raw || '').toLowerCase();
  if (!s) return CLOUD_PERSISTENCE_LABEL.synchronized;
  if (/offline/.test(s)) return CLOUD_PERSISTENCE_LABEL.offline;
  if (/fail|error|conflict/.test(s)) return CLOUD_PERSISTENCE_LABEL.failed;
  if (/wait|syncing|connecting|pending|queue/.test(s)) return CLOUD_PERSISTENCE_LABEL.waiting;
  if (/sync|connected/.test(s)) return CLOUD_PERSISTENCE_LABEL.synchronized;
  return raw || CLOUD_PERSISTENCE_LABEL.synchronized;
}
