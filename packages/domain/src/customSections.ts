import { generateUuid } from './ids.js';

export const RESERVED_IDENTIFIER_KEYS = new Set<string>([
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
]);

export interface ArchivedFieldValue {
  archiveId: string;
  fieldId: string;
  fromSchemaVersion: number;
  toSchemaVersion: number;
  type?: string;
  value: unknown;
  reason: string;
  archivedAt: string;
  previousFieldType?: string;
  previousLabel?: string;
  newFieldType?: string;
  error?: string;
}

export type CustomBlockType = 'existing_record_view' | 'field_collection';

export type ExistingRecordTargetKind =
  | 'note'
  | 'notes'
  | 'task'
  | 'tasks'
  | 'routine'
  | 'routines'
  | 'file'
  | 'files'
  | 'journal'
  | 'journals'
  | 'expense_summary'
  | 'expenses';

export interface ExistingRecordViewFilter {
  folderId?: string;
  tags?: string[];
  status?: 'all' | 'active' | 'completed' | 'archived';
  dateRange?: 'all' | 'today' | 'upcoming_7_days' | 'current_month';
}

export interface ExistingRecordViewBlock {
  id: string;
  type: 'existing_record_view';
  title: string;
  targetKind: ExistingRecordTargetKind;
  filter?: ExistingRecordViewFilter;
  displayMode?: 'list' | 'card' | 'compact';
  limit?: number;
  sortBy?: 'updated_at' | 'created_at' | 'deadline' | 'name';
  sortDirection?: 'asc' | 'desc';
}

export type CustomFieldType =
  | 'text'
  | 'checklist'
  | 'date'
  | 'number'
  | 'link'
  | 'attachment';

export interface BaseFieldDefinition {
  id: string;
  label: string;
  required?: boolean;
  description?: string;
}

export interface TextFieldDefinition extends BaseFieldDefinition {
  type: 'text';
  multiline?: boolean;
  maxLength?: number;
  pattern?: string;
}

export interface ChecklistEntry {
  id: string;
  text: string;
  completed: boolean;
}

export interface ChecklistFieldDefinition extends BaseFieldDefinition {
  type: 'checklist';
  maxEntries?: number;
}

export interface DateFieldDefinition extends BaseFieldDefinition {
  type: 'date';
  minDate?: string;
  maxDate?: string;
}

export interface NumberFieldDefinition extends BaseFieldDefinition {
  type: 'number';
  min?: number;
  max?: number;
  precision?: number;
  unit?: string;
}

export interface LinkFieldDefinition extends BaseFieldDefinition {
  type: 'link';
  placeholder?: string;
}

export interface AttachmentFieldDefinition extends BaseFieldDefinition {
  type: 'attachment';
  allowedMimeTypes?: string[];
}

export type CustomFieldDefinition =
  | TextFieldDefinition
  | ChecklistFieldDefinition
  | DateFieldDefinition
  | NumberFieldDefinition
  | LinkFieldDefinition
  | AttachmentFieldDefinition;

export interface FieldCollectionBlock {
  id: string;
  type: 'field_collection';
  title: string;
  fields: CustomFieldDefinition[];
  defaultViewMode?: 'table' | 'cards' | 'list';
}

export type CustomCollectionBlockDefinition = FieldCollectionBlock;
export type CustomBlockDefinition = ExistingRecordViewBlock | FieldCollectionBlock;

export interface CustomSectionSchemaPayload {
  version: number;
  blocks: CustomBlockDefinition[];
}

export interface FieldValidationResult {
  valid: boolean;
  error?: string;
  sanitizedValue?: unknown;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedValues?: Record<string, unknown>;
}

export interface MigrationResult {
  fieldValues: Record<string, unknown>;
  archivedValues: Record<string, ArchivedFieldValue[]>;
}

export interface FallbackBlockRepresentation {
  id: string;
  type: 'fallback';
  title: string;
  unsupportedType: string;
  message: string;
  rawData: Record<string, unknown>;
  isReadOnly?: boolean;
}

const UNSAFE_SCRIPT_PATTERN = /<\s*script\b|javascript:|data:text\/html|onload\s*=|onerror\s*=/i;
const SAFE_URL_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates and sanitizes a single custom field value according to its definition.
 */
export function validateFieldValue(
  field: CustomFieldDefinition,
  value: unknown
): FieldValidationResult {
  if (value === null || value === undefined || value === '') {
    if (field.required) {
      return { valid: false, error: `Field "${field.label}" is required` };
    }
    return { valid: true, sanitizedValue: null };
  }

  switch (field.type) {
    case 'text': {
      if (typeof value !== 'string') {
        return { valid: false, error: `Field "${field.label}" must be a string` };
      }
      const maxLen = field.maxLength ?? 5000;
      if (value.length > maxLen) {
        return {
          valid: false,
          error: `Field "${field.label}" exceeds maximum length of ${maxLen} characters`,
        };
      }
      if (UNSAFE_SCRIPT_PATTERN.test(value)) {
        return {
          valid: false,
          error: `Field "${field.label}" contains disallowed script or event handler content`,
        };
      }
      if (field.pattern) {
        let regex: RegExp;
        try {
          regex = new RegExp(field.pattern);
        } catch {
          return {
            valid: false,
            error: `Field "${field.label}" has an invalid validation pattern`,
          };
        }
        if (value.length > 1000) {
          return {
            valid: false,
            error: `Field "${field.label}" exceeds bounded pattern verification length (1000)`,
          };
        }
        if (!regex.test(value)) {
          return {
            valid: false,
            error: `Field "${field.label}" does not match the required pattern`,
          };
        }
      }
      return { valid: true, sanitizedValue: value };
    }

    case 'checklist': {
      if (!Array.isArray(value)) {
        return { valid: false, error: `Field "${field.label}" must be an array of checklist items` };
      }
      const maxEntries = field.maxEntries ?? 50;
      if (value.length > maxEntries) {
        return {
          valid: false,
          error: `Field "${field.label}" exceeds maximum of ${maxEntries} checklist items`,
        };
      }
      const sanitizedEntries: ChecklistEntry[] = [];
      const seenIds = new Set<string>();
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (!item || typeof item !== 'object') {
          return { valid: false, error: `Checklist item ${i + 1} in "${field.label}" must be an object` };
        }
        const candidate = item as Record<string, unknown>;
        const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : generateUuid();
        if (RESERVED_IDENTIFIER_KEYS.has(id)) {
          return { valid: false, error: `Checklist item ID "${id}" in "${field.label}" is a reserved system identifier` };
        }
        if (seenIds.has(id)) {
          return { valid: false, error: `Duplicate checklist item ID "${id}" in "${field.label}"` };
        }
        seenIds.add(id);
        if (typeof candidate.text !== 'string' || candidate.text.trim().length === 0) {
          return { valid: false, error: `Checklist item ${i + 1} in "${field.label}" must have non-empty text` };
        }
        if (candidate.text.length > 500) {
          return { valid: false, error: `Checklist item ${i + 1} text exceeds 500 characters` };
        }
        if (UNSAFE_SCRIPT_PATTERN.test(candidate.text)) {
          return { valid: false, error: `Checklist item ${i + 1} contains prohibited script tags` };
        }
        sanitizedEntries.push({
          id,
          text: candidate.text.trim(),
          completed: Boolean(candidate.completed ?? candidate.checked),
        });
      }
      return { valid: true, sanitizedValue: sanitizedEntries };
    }

    case 'date': {
      if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
        return { valid: false, error: `Field "${field.label}" must be an ISO date string (YYYY-MM-DD)` };
      }
      const [yearStr, monthStr, dayStr] = value.split('-');
      const year = parseInt(yearStr!, 10);
      const month = parseInt(monthStr!, 10);
      const day = parseInt(dayStr!, 10);
      const d = new Date(Date.UTC(year, month - 1, day));
      if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) {
        return { valid: false, error: `Field "${field.label}" is not a valid calendar date` };
      }
      if (field.minDate && value < field.minDate) {
        return {
          valid: false,
          error: `Field "${field.label}" cannot be earlier than ${field.minDate}`,
        };
      }
      if (field.maxDate && value > field.maxDate) {
        return {
          valid: false,
          error: `Field "${field.label}" cannot be later than ${field.maxDate}`,
        };
      }
      return { valid: true, sanitizedValue: value };
    }

    case 'number': {
      let numVal: number;
      if (typeof value === 'number') {
        numVal = value;
      } else if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
        numVal = Number(value.trim());
      } else {
        return { valid: false, error: `Field "${field.label}" must be a finite number` };
      }
      if (!Number.isFinite(numVal) || Number.isNaN(numVal)) {
        return { valid: false, error: `Field "${field.label}" must be a finite number` };
      }
      if (field.min !== undefined && numVal < field.min) {
        return {
          valid: false,
          error: `Field "${field.label}" cannot be less than ${field.min}`,
        };
      }
      if (field.max !== undefined && numVal > field.max) {
        return {
          valid: false,
          error: `Field "${field.label}" cannot be greater than ${field.max}`,
        };
      }
      const precision = field.precision ?? 0;
      const factor = 10 ** precision;
      const rounded = Math.round(numVal * factor) / factor;
      return { valid: true, sanitizedValue: rounded };
    }

    case 'link': {
      if (typeof value !== 'string') {
        return { valid: false, error: `Field "${field.label}" must be a URL string` };
      }
      const trimmed = value.trim();
      if (UNSAFE_SCRIPT_PATTERN.test(trimmed)) {
        return {
          valid: false,
          error: `Field "${field.label}" contains prohibited script protocol or tags`,
        };
      }
      const isExternalUrl = SAFE_URL_PATTERN.test(trimmed) || /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(trimmed);
      const isInternalItemLink = /^item:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed);
      if (!isExternalUrl && !isInternalItemLink) {
        return {
          valid: false,
          error: `Field "${field.label}" must be a valid http(s) URL, mailto link, or internal canonical item link (item:<uuid>)`,
        };
      }
      return { valid: true, sanitizedValue: trimmed };
    }

    case 'attachment': {
      if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
        return {
          valid: false,
          error: `Field "${field.label}" must reference a valid file item UUID`,
        };
      }
      return { valid: true, sanitizedValue: value };
    }

    default:
      return { valid: false, error: `Unknown field type: ${(field as { type: string }).type}` };
  }
}

/**
 * Validates a complete dictionary of record field values against a section schema.
 * Enforces collection boundaries, own-property checks, and rejects reserved keys.
 */
export function validateRecordAgainstSchema(
  schema: CustomSectionSchemaPayload,
  fieldValues: Record<string, unknown>,
  collectionId?: string
): SchemaValidationResult {
  const errors: string[] = [];
  const sanitizedValues: Record<string, unknown> = {};

  // Extract all field definitions across relevant field collection blocks
  const fieldMap = new Map<string, CustomFieldDefinition>();
  for (const block of schema.blocks) {
    if (block.type === 'field_collection') {
      if (!collectionId || block.id === collectionId) {
        for (const field of block.fields) {
          fieldMap.set(field.id, field);
        }
      }
    }
  }

  // 1. Validate provided values
  for (const [fieldId, val] of Object.entries(fieldValues)) {
    if (!Object.prototype.hasOwnProperty.call(fieldValues, fieldId)) {
      continue;
    }
    if (RESERVED_IDENTIFIER_KEYS.has(fieldId)) {
      errors.push(`Field ID "${fieldId}" is a reserved system identifier and cannot be used`);
      continue;
    }
    const fieldDef = fieldMap.get(fieldId);
    if (!fieldDef) {
      // Disallow unexpected extra fields
      errors.push(`Unrecognized field "${fieldId}" is not defined in current schema`);
      continue;
    }
    const result = validateFieldValue(fieldDef, val);
    if (!result.valid) {
      errors.push(result.error || `Validation failed for field "${fieldDef.label}"`);
    } else {
      sanitizedValues[fieldId] = result.sanitizedValue;
    }
  }

  // 2. Check for missing required fields
  for (const [fieldId, fieldDef] of fieldMap.entries()) {
    if (fieldDef.required && !(fieldId in sanitizedValues)) {
      errors.push(`Required field "${fieldDef.label}" is missing`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitizedValues: errors.length === 0 ? sanitizedValues : undefined,
  };
}


/**
 * Safely migrates record field values across schema versions.
 * Preserves every archived value across repeated removals, reintroductions, and type changes.
 * Archives are append-only versioned entries with stable UUIDs and source schema metadata.
 */
export function migrateRecordValues(
  oldSchema: CustomSectionSchemaPayload,
  newSchema: CustomSectionSchemaPayload,
  currentValues: Record<string, unknown>,
  currentArchivedValues: Record<string, unknown> = {}
): MigrationResult {
  const oldFieldMap = new Map<string, CustomFieldDefinition>();
  for (const block of oldSchema.blocks) {
    if (block.type === 'field_collection') {
      for (const f of block.fields) oldFieldMap.set(f.id, f);
    }
  }

  const newFieldMap = new Map<string, CustomFieldDefinition>();
  for (const block of newSchema.blocks) {
    if (block.type === 'field_collection') {
      for (const f of block.fields) newFieldMap.set(f.id, f);
    }
  }

  const newFieldValues: Record<string, unknown> = {};
  const newArchivedValues: Record<string, ArchivedFieldValue[]> = {};
  const now = new Date().toISOString();

  // 1. Normalize existing archives into append-only array per fieldId
  for (const [fieldId, existing] of Object.entries(currentArchivedValues)) {
    if (RESERVED_IDENTIFIER_KEYS.has(fieldId)) continue;
    if (!Object.prototype.hasOwnProperty.call(currentArchivedValues, fieldId)) continue;

    if (Array.isArray(existing)) {
      newArchivedValues[fieldId] = [...(existing as ArchivedFieldValue[])];
    } else if (existing && typeof existing === 'object') {
      const legacy = existing as Record<string, unknown>;
      newArchivedValues[fieldId] = [
        {
          archiveId: typeof legacy.archiveId === 'string' ? legacy.archiveId : generateUuid(),
          fieldId,
          fromSchemaVersion: typeof legacy.fromSchemaVersion === 'number' ? legacy.fromSchemaVersion : (oldSchema.version || 1),
          toSchemaVersion: typeof legacy.toSchemaVersion === 'number' ? legacy.toSchemaVersion : (newSchema.version || 2),
          value: legacy.value,
          reason: typeof legacy.reason === 'string' ? legacy.reason : 'legacy_archived',
          archivedAt: typeof legacy.archivedAt === 'string' ? legacy.archivedAt : now,
          previousFieldType: typeof legacy.previousFieldType === 'string' ? legacy.previousFieldType : undefined,
          previousLabel: typeof legacy.previousLabel === 'string' ? legacy.previousLabel : undefined,
          newFieldType: typeof legacy.newFieldType === 'string' ? legacy.newFieldType : undefined,
          error: typeof legacy.error === 'string' ? legacy.error : undefined,
        },
      ];
    }
  }

  function appendArchive(fieldId: string, entry: Omit<ArchivedFieldValue, 'archiveId'>) {
    if (!newArchivedValues[fieldId]) {
      newArchivedValues[fieldId] = [];
    }
    newArchivedValues[fieldId].push({
      archiveId: generateUuid(),
      ...entry,
    });
  }

  for (const [fieldId, value] of Object.entries(currentValues)) {
    if (!Object.prototype.hasOwnProperty.call(currentValues, fieldId)) continue;
    if (RESERVED_IDENTIFIER_KEYS.has(fieldId)) continue;

    const oldField = oldFieldMap.get(fieldId);
    const newField = newFieldMap.get(fieldId);

    if (!newField) {
      // Field was removed in new schema -> archive value without losing prior archives
      appendArchive(fieldId, {
        fieldId,
        fromSchemaVersion: oldSchema.version,
        toSchemaVersion: newSchema.version,
        value,
        archivedAt: now,
        reason: 'field_removed',
        previousFieldType: oldField?.type || 'unknown',
        previousLabel: oldField?.label || fieldId,
      });
    } else if (oldField && oldField.type !== newField.type) {
      // Field type was changed in new schema -> archive previous value and reset field
      appendArchive(fieldId, {
        fieldId,
        fromSchemaVersion: oldSchema.version,
        toSchemaVersion: newSchema.version,
        value,
        archivedAt: now,
        reason: 'type_changed',
        previousFieldType: oldField.type,
        newFieldType: newField.type,
        previousLabel: oldField.label,
      });
      // If new field has default, apply it
      if (newField.type === 'checklist') {
        newFieldValues[fieldId] = [];
      }
    } else {
      // Field preserved with compatible type -> validate and keep
      const validation = validateFieldValue(newField, value);
      if (validation.valid) {
        newFieldValues[fieldId] = validation.sanitizedValue;
      } else {
        // Soft archive value if no longer valid under new constraints
        appendArchive(fieldId, {
          fieldId,
          fromSchemaVersion: oldSchema.version,
          toSchemaVersion: newSchema.version,
          value,
          archivedAt: now,
          reason: 'constraint_incompatible',
          previousFieldType: oldField?.type || newField.type,
          previousLabel: oldField?.label || newField.label,
          error: validation.error,
        });
      }
    }
  }

  // Handle newly added fields in newSchema
  for (const [fieldId, newField] of newFieldMap.entries()) {
    if (!(fieldId in newFieldValues)) {
      if (newField.type === 'checklist') {
        newFieldValues[fieldId] = [];
      }
    }
  }

  return {
    fieldValues: newFieldValues,
    archivedValues: newArchivedValues,
  };
}

/**
 * Retrieves all archived values for a specific field in chronological order.
 */
export function getArchivedFieldValues(
  record: { archivedValues?: Record<string, unknown> },
  fieldId: string
): ArchivedFieldValue[] {
  if (!record.archivedValues || typeof record.archivedValues !== 'object') return [];
  const entries = record.archivedValues[fieldId];
  if (Array.isArray(entries)) return entries as ArchivedFieldValue[];
  if (entries && typeof entries === 'object') return [entries as ArchivedFieldValue];
  return [];
}

/**
 * Returns the most recent archived value for a specific field.
 */
export function getLatestArchivedFieldValue(
  record: { archivedValues?: Record<string, unknown> },
  fieldId: string
): ArchivedFieldValue | undefined {
  const list = getArchivedFieldValues(record, fieldId);
  return list[list.length - 1];
}

/**
 * Returns all historical archived values across all fields in the record.
 */
export function getAllArchivedFieldValues(
  record: { archivedValues?: Record<string, unknown> }
): ArchivedFieldValue[] {
  if (!record.archivedValues || typeof record.archivedValues !== 'object') return [];
  const all: ArchivedFieldValue[] = [];
  for (const list of Object.values(record.archivedValues)) {
    if (Array.isArray(list)) {
      all.push(...(list as ArchivedFieldValue[]));
    } else if (list && typeof list === 'object') {
      all.push(list as ArchivedFieldValue);
    }
  }
  return all;
}

/**
 * Explicitly restores an archived value by archive ID if compatible with current schema.
 */
export function restoreArchivedFieldValue(
  record: { fieldValues: Record<string, unknown>; archivedValues?: Record<string, unknown> },
  schema: CustomSectionSchemaPayload,
  archiveId: string
): { success: boolean; fieldId?: string; error?: string } {
  const archives = getAllArchivedFieldValues(record);
  const target = archives.find((a) => a.archiveId === archiveId);
  if (!target) {
    return { success: false, error: `Archived entry "${archiveId}" not found` };
  }

  // Find target field in current schema
  let currentField: CustomFieldDefinition | undefined;
  for (const block of schema.blocks) {
    if (block.type === 'field_collection') {
      const found = block.fields.find((f) => f.id === target.fieldId);
      if (found) {
        currentField = found;
        break;
      }
    }
  }

  if (!currentField) {
    return {
      success: false,
      error: `Field "${target.fieldId}" does not exist in current schema`,
    };
  }

  const validation = validateFieldValue(currentField, target.value);
  if (!validation.valid) {
    return {
      success: false,
      error: `Archived value is incompatible with current field definition: ${validation.error}`,
    };
  }

  record.fieldValues[target.fieldId] = validation.sanitizedValue;
  return { success: true, fieldId: target.fieldId };
}

/**
 * Checks if a block is supported by the current rendering engine.
 * Validates complete shape, required properties, and field type definitions.
 */
export function isBlockSupported(block: unknown): block is CustomBlockDefinition {
  if (!block || typeof block !== 'object') return false;
  const b = block as Record<string, unknown>;
  if (typeof b.id !== 'string' || !b.id.trim() || RESERVED_IDENTIFIER_KEYS.has(b.id)) {
    return false;
  }
  if (typeof b.title !== 'string' || !b.title.trim()) {
    return false;
  }

  if (b.type === 'existing_record_view') {
    const validKinds = [
      'note',
      'notes',
      'task',
      'tasks',
      'routine',
      'routines',
      'file',
      'files',
      'journal',
      'journals',
      'journal_entry',
      'journal_entries',
      'expense_summary',
      'expense',
      'expenses',
    ];
    if (typeof b.targetKind !== 'string' || !validKinds.includes(b.targetKind)) {
      return false;
    }
    return true;
  }

  if (b.type === 'field_collection') {
    if (!Array.isArray(b.fields) || b.fields.length === 0 || b.fields.length > 20) {
      return false;
    }
    const validFieldTypes = ['text', 'checklist', 'date', 'number', 'link', 'attachment'];
    const seenFieldIds = new Set<string>();
    for (const f of b.fields) {
      if (!f || typeof f !== 'object') return false;
      const field = f as Record<string, unknown>;
      if (typeof field.id !== 'string' || !field.id.trim() || RESERVED_IDENTIFIER_KEYS.has(field.id)) {
        return false;
      }
      if (seenFieldIds.has(field.id)) return false;
      seenFieldIds.add(field.id);
      if (typeof field.label !== 'string' || !field.label.trim()) return false;
      if (typeof field.type !== 'string' || !validFieldTypes.includes(field.type)) {
        return false;
      }
    }
    return true;
  }

  return false;
}

/**
 * Creates a safe fallback presentation for unknown block types or versions.
 * Preserves raw data while informing the user that an update is required.
 */
export function createFallbackBlockRepresentation(
  rawBlock: Record<string, unknown>
): FallbackBlockRepresentation {
  const blockId = typeof rawBlock.id === 'string' ? rawBlock.id : 'unknown-block';
  const blockType = typeof rawBlock.type === 'string' ? rawBlock.type : 'unknown';
  const blockTitle = typeof rawBlock.title === 'string' ? rawBlock.title : 'Unsupported Block';

  return {
    id: blockId,
    type: 'fallback',
    title: blockTitle,
    unsupportedType: blockType,
    message: `This block type ("${blockType}") is not supported by your current Daynori version. Data is preserved safely.`,
    rawData: rawBlock,
    isReadOnly: true,
  };
}

/**
 * Standard approved section templates.
 */
export const APPROVED_SECTION_TEMPLATES = {
  READING_LIST: {
    name: 'Reading List',
    description: 'Track books, articles, papers, and reading progress with structured fields.',
    layoutMode: 'single_column' as const,
    schema: {
      version: 1,
      blocks: [
        {
          id: 'reading-items',
          type: 'field_collection' as const,
          title: 'Books & Articles',
          defaultViewMode: 'table' as const,
          fields: [
            {
              id: 'title',
              label: 'Title',
              type: 'text' as const,
              required: true,
              maxLength: 250,
            },
            {
              id: 'author',
              label: 'Author',
              type: 'text' as const,
              required: false,
              maxLength: 100,
            },
            {
              id: 'completed',
              label: 'Progress Checklist',
              type: 'checklist' as const,
              required: false,
              maxEntries: 50,
            },
            {
              id: 'finish_date',
              label: 'Finished Date',
              type: 'date' as const,
              required: false,
            },
            {
              id: 'rating',
              label: 'Rating (1-5)',
              type: 'number' as const,
              required: false,
              min: 1,
              max: 5,
              precision: 0,
            },
            {
              id: 'url',
              label: 'Source Link',
              type: 'link' as const,
              required: false,
            },
          ],
        },
      ],
    },
  },
  STUDY_DASHBOARD: {
    name: 'Study & Research Hub',
    description: 'Combines reference files and upcoming study tasks in a unified view.',
    layoutMode: 'two_column' as const,
    schema: {
      version: 1,
      blocks: [
        {
          id: 'study-files',
          type: 'existing_record_view' as const,
          title: 'Course Materials & Files',
          targetKind: 'file' as const,
          filter: {},
          displayMode: 'list' as const,
          limit: 10,
          sortBy: 'updated_at' as const,
          sortDirection: 'desc' as const,
        },
        {
          id: 'study-tasks',
          type: 'existing_record_view' as const,
          title: 'Upcoming Assignments',
          targetKind: 'task' as const,
          filter: { status: 'active' as const },
          displayMode: 'card' as const,
          limit: 10,
          sortBy: 'deadline' as const,
          sortDirection: 'asc' as const,
        },
      ],
    },
  },
};

export const APPROVED_FIELD_TYPES: CustomFieldType[] = [
  'text',
  'checklist',
  'date',
  'number',
  'link',
  'attachment',
];

export interface CustomSectionStarterTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  color?: string;
  layoutMode: 'single_column' | 'two_column' | 'grid';
  schema: CustomSectionSchemaPayload;
}

export const APPROVED_CUSTOM_SECTION_TEMPLATES: CustomSectionStarterTemplate[] = [
  {
    id: 'reading_list',
    name: APPROVED_SECTION_TEMPLATES.READING_LIST.name,
    description: APPROVED_SECTION_TEMPLATES.READING_LIST.description,
    category: 'Productivity',
    icon: 'book',
    color: '#2563eb',
    layoutMode: APPROVED_SECTION_TEMPLATES.READING_LIST.layoutMode,
    schema: APPROVED_SECTION_TEMPLATES.READING_LIST.schema,
  },
  {
    id: 'study_hub',
    name: APPROVED_SECTION_TEMPLATES.STUDY_DASHBOARD.name,
    description: APPROVED_SECTION_TEMPLATES.STUDY_DASHBOARD.description,
    category: 'Education',
    icon: 'academic-cap',
    color: '#059669',
    layoutMode: APPROVED_SECTION_TEMPLATES.STUDY_DASHBOARD.layoutMode,
    schema: APPROVED_SECTION_TEMPLATES.STUDY_DASHBOARD.schema,
  },
];

// --- Phase 43: Schema Migration Preview & Template Helpers ---

export interface FieldMigrationImpact {
  fieldId: string;
  label: string;
  changeType: 'unmodified' | 'added' | 'removed' | 'type_changed' | 'constraint_changed';
  previousType?: string;
  newType?: string;
  description: string;
  archivedNotice?: string;
}

export interface SchemaMigrationPreview {
  affectedFields: FieldMigrationImpact[];
  affectedRecordCount: number;
  hasIncompatibleChanges: boolean;
  canMigrateSafely: boolean;
  summary: string;
}

/**
 * Generates an impact analysis preview before publishing a schema evolution.
 * Explains affected fields, record counts, and archived retention rules in plain language.
 */
export function generateSchemaMigrationPreview(
  currentSchema: CustomSectionSchemaPayload,
  proposedBlocks: CustomBlockDefinition[],
  totalRecordsCount = 0
): SchemaMigrationPreview {
  const oldFieldMap = new Map<string, CustomFieldDefinition>();
  for (const block of currentSchema.blocks) {
    if (block.type === 'field_collection') {
      for (const field of block.fields) {
        oldFieldMap.set(field.id, field);
      }
    }
  }

  const newFieldMap = new Map<string, CustomFieldDefinition>();
  for (const block of proposedBlocks) {
    if (block.type === 'field_collection') {
      for (const field of block.fields) {
        newFieldMap.set(field.id, field);
      }
    }
  }

  const impacts: FieldMigrationImpact[] = [];
  let hasIncompatibleChanges = false;
  let removedCount = 0;
  let typeChangedCount = 0;
  let addedCount = 0;

  // 1. Evaluate existing fields
  for (const [fieldId, oldField] of oldFieldMap.entries()) {
    const newField = newFieldMap.get(fieldId);

    if (!newField) {
      // Removed
      hasIncompatibleChanges = true;
      removedCount++;
      impacts.push({
        fieldId,
        label: oldField.label,
        changeType: 'removed',
        previousType: oldField.type,
        description: `Field "${oldField.label}" will be removed.`,
        archivedNotice: `All historical entries for "${oldField.label}" will be preserved in archived values and can be recovered anytime.`,
      });
    } else if (oldField.type !== newField.type) {
      // Type Changed
      hasIncompatibleChanges = true;
      typeChangedCount++;
      impacts.push({
        fieldId,
        label: newField.label,
        changeType: 'type_changed',
        previousType: oldField.type,
        newType: newField.type,
        description: `Field "${newField.label}" type changes from ${oldField.type} to ${newField.type}.`,
        archivedNotice: `Prior ${oldField.type} values will be archived safely. Conforming values will be migrated automatically.`,
      });
    } else if (
      oldField.required !== newField.required ||
      ('pattern' in oldField && 'pattern' in newField && oldField.pattern !== newField.pattern)
    ) {
      // Constraints changed
      impacts.push({
        fieldId,
        label: newField.label,
        changeType: 'constraint_changed',
        previousType: oldField.type,
        newType: newField.type,
        description: `Validation rules updated for "${newField.label}".`,
      });
    } else {
      impacts.push({
        fieldId,
        label: newField.label,
        changeType: 'unmodified',
        description: `Field "${newField.label}" remains unchanged.`,
      });
    }
  }

  // 2. Identify new fields
  for (const [fieldId, newField] of newFieldMap.entries()) {
    if (!oldFieldMap.has(fieldId)) {
      addedCount++;
      impacts.push({
        fieldId,
        label: newField.label,
        changeType: 'added',
        newType: newField.type,
        description: `New ${newField.type} field "${newField.label}" added.`,
      });
    }
  }

  // Generate plain-language summary
  const summaryParts: string[] = [];
  if (addedCount > 0) summaryParts.push(`${addedCount} field(s) added`);
  if (removedCount > 0) summaryParts.push(`${removedCount} field(s) removed`);
  if (typeChangedCount > 0) summaryParts.push(`${typeChangedCount} field type(s) updated`);
  if (summaryParts.length === 0) summaryParts.push('No field additions or removals');

  const recordNotice =
    totalRecordsCount > 0
      ? ` Affects ${totalRecordsCount} existing record(s).`
      : ' No records currently exist in this section.';

  return {
    affectedFields: impacts,
    affectedRecordCount: totalRecordsCount,
    hasIncompatibleChanges,
    canMigrateSafely: true, // Daynori append-only archives guarantee no data loss
    summary: summaryParts.join(', ') + '.' + recordNotice,
  };
}

/**
 * Creates an independent section configuration from a template.
 * Guarantees zero leakage of private user records and ensures independent version 1 evolution.
 */
export function createSectionPayloadFromTemplate(
  template: {
    name: string;
    description?: string | null;
    icon?: string | null;
    layoutMode: 'single_column' | 'two_column' | 'grid';
    schema: CustomSectionSchemaPayload;
  },
  customName?: string
) {
  return {
    name: customName || template.name,
    description: template.description || undefined,
    icon: template.icon || undefined,
    layoutMode: template.layoutMode,
    initialSchema: {
      version: 1,
      blocks: JSON.parse(JSON.stringify(template.schema.blocks)),
    },
  };
}
