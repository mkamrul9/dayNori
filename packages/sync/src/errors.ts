/**
 * Typed storage and persistence errors for Daynori local repositories.
 */

export class StorageQuotaError extends Error {
  readonly code = 'STORAGE_QUOTA_EXCEEDED';
  constructor(message = 'Local storage quota exceeded. Free up space on device.') {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

export class StorageMigrationError extends Error {
  readonly code = 'STORAGE_MIGRATION_FAILED';
  constructor(message = 'Local database migration failed and requires recovery.') {
    super(message);
    this.name = 'StorageMigrationError';
  }
}

export class StorageUnavailableError extends Error {
  readonly code = 'STORAGE_UNAVAILABLE';
  constructor(message = 'Local storage is unavailable or database connection closed.') {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

export class StorageKeyError extends Error {
  readonly code = 'STORAGE_KEY_ERROR';
  constructor(message = 'Encryption key is missing, invalidated, or failed to unlock database.') {
    super(message);
    this.name = 'StorageKeyError';
  }
}

export class TrustedDeviceConsentRequiredError extends Error {
  readonly code = 'TRUSTED_DEVICE_CONSENT_REQUIRED';
  constructor(
    message = 'Persistent local browser storage requires explicit trusted-device consent.'
  ) {
    super(message);
    this.name = 'TrustedDeviceConsentRequiredError';
  }
}
