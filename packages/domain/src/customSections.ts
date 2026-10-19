import { generateUuid } from './ids.js';

export type CustomBlockType = 'existing_record_view' | 'field_collection';

export type ExistingRecordTargetKind =
  | 'note'
  | 'task'
  | 'routine'
  | 'file'
  | 'journal'
  | 'expense_summary';

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
  archivedValues: Record<string, unknown>;
}

export interface FallbackBlockRepresentation {
  id: string;
  type: 'fallback';
  title: string;
  unsupportedType: string;
  message: string;
  rawData: Record<string, unknown>;
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
        try {
          const regex = new RegExp(field.pattern);
          if (!regex.test(value)) {
            return {
              valid: false,
              error: `Field "${field.label}" does not match the required pattern`,
            };
          }
        } catch {
          // Ignore invalid regex pattern in field definition
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
 */
export function validateRecordAgainstSchema(
  schema: CustomSectionSchemaPayload,
  fieldValues: Record<string, unknown>
): SchemaValidationResult {
  const errors: string[] = [];
  const sanitizedValues: Record<string, unknown> = {};

  // Extract all field definitions across all field collection blocks
  const fieldMap = new Map<string, CustomFieldDefinition>();
  for (const block of schema.blocks) {
    if (block.type === 'field_collection') {
      for (const field of block.fields) {
        fieldMap.set(field.id, field);
      }
    }
  }

  // 1. Validate provided values
  for (const [fieldId, val] of Object.entries(fieldValues)) {
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
 * Preserves all values: removed or type-incompatible fields are archived rather than discarded.
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
  const newArchivedValues: Record<string, unknown> = { ...currentArchivedValues };
  const now = new Date().toISOString();

  for (const [fieldId, value] of Object.entries(currentValues)) {
    const oldField = oldFieldMap.get(fieldId);
    const newField = newFieldMap.get(fieldId);

    if (!newField) {
      // Field was removed in new schema -> archive value
      newArchivedValues[fieldId] = {
        value,
        archivedAt: now,
        reason: 'field_removed',
        previousFieldType: oldField?.type || 'unknown',
        previousLabel: oldField?.label || fieldId,
      };
    } else if (oldField && oldField.type !== newField.type) {
      // Field type was changed in new schema -> archive previous value and reset field
      newArchivedValues[fieldId] = {
        value,
        archivedAt: now,
        reason: 'type_changed',
        previousFieldType: oldField.type,
        newFieldType: newField.type,
        previousLabel: oldField.label,
      };
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
        newArchivedValues[fieldId] = {
          value,
          archivedAt: now,
          reason: 'constraint_incompatible',
          error: validation.error,
        };
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
 * Checks if a block is supported by the current rendering engine.
 */
export function isBlockSupported(block: unknown): block is CustomBlockDefinition {
  if (!block || typeof block !== 'object') return false;
  const b = block as Record<string, unknown>;
  return b.type === 'existing_record_view' || b.type === 'field_collection';
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
          filter: { status: 'active' },
          displayMode: 'card' as const,
          limit: 10,
          sortBy: 'deadline' as const,
          sortDirection: 'asc' as const,
        },
      ],
    },
  },
};
