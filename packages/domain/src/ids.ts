/**
 * Domain identifier brands and validation
 */

export type WorkspaceId = string & { readonly __brand: unique symbol };
export type UserId = string & { readonly __brand: unique symbol };
export type ItemId = string & { readonly __brand: unique symbol };
export type NoteId = string & { readonly __brand: unique symbol };
export type TaskId = string & { readonly __brand: unique symbol };
export type RoutineId = string & { readonly __brand: unique symbol };
export type JournalId = string & { readonly __brand: unique symbol };
export type FolderId = string & { readonly __brand: unique symbol };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function parseWorkspaceId(value: string): WorkspaceId {
  if (!isValidUuid(value)) {
    throw new Error(`Invalid WorkspaceId: expected UUID, got "${value}"`);
  }
  return value as WorkspaceId;
}

export function parseUserId(value: string): UserId {
  if (!isValidUuid(value)) {
    throw new Error(`Invalid UserId: expected UUID, got "${value}"`);
  }
  return value as UserId;
}
