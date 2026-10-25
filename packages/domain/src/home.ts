/**
 * Phase 30: Today Home and Personal Customization Domain Models
 *
 * Provides versioned home layout metadata, approved widget/module registries,
 * bounded custom display labels, accessible reordering, privacy redaction,
 * and safe migration without executing arbitrary code or HTML.
 */

export const APPROVED_HOME_WIDGET_IDS = [
  'tasks',
  'routines',
  'upcoming_summary',
  'quick_capture',
  'journal_prompt',
  'recent_items',
  'favorite_folders',
] as const;

export type HomeWidgetId = (typeof APPROVED_HOME_WIDGET_IDS)[number];

export const APPROVED_MODULE_SHORTCUT_IDS = [
  'today',
  'plan',
  'library',
  'journal',
  'notes',
  'tasks',
  'routines',
  'calendar',
  'files',
  'knowledge',
] as const;

export type ModuleShortcutId = (typeof APPROVED_MODULE_SHORTCUT_IDS)[number];

export const DEFAULT_WIDGET_LABELS: Record<HomeWidgetId, string> = {
  tasks: 'Tasks Due Today',
  routines: "Today's Routines",
  upcoming_summary: 'Upcoming (Next 7 Days)',
  quick_capture: 'Quick Capture',
  journal_prompt: 'Daily Reflection',
  recent_items: 'Recent Items',
  favorite_folders: 'Favorite Folders',
};

export const DEFAULT_MODULE_LABELS: Record<ModuleShortcutId, string> = {
  today: 'Today',
  plan: 'Plan',
  library: 'Library',
  journal: 'Journal',
  notes: 'Notes',
  tasks: 'Tasks',
  routines: 'Routines',
  calendar: 'Calendar',
  files: 'Files',
  knowledge: 'Knowledge',
};

export interface HomeWidgetConfig {
  id: HomeWidgetId;
  visible: boolean;
  order: number;
  customLabel?: string | null;
}

export interface ModuleShortcutConfig {
  id: ModuleShortcutId;
  visible: boolean;
  order: number;
  customLabel?: string | null;
}

export type HomeDensity = 'comfortable' | 'compact';

export interface HomeLayout {
  version: 1;
  density: HomeDensity;
  widgets: HomeWidgetConfig[];
  moduleShortcuts: ModuleShortcutConfig[];
  favoriteFolderIds: string[];
  unsupportedVersion?: number;
}

export const CURRENT_HOME_LAYOUT_VERSION = 1;

/**
 * Thrown when an older client receives a HomeLayout created by a newer schema version,
 * preventing silent overwriting of newer metadata.
 */
export class UnsupportedLayoutVersionError extends Error {
  constructor(public readonly version: number) {
    super(
      `Unsupported layout schema version ${version}. This configuration was created by a newer version of Daynori; update your client to view and modify this layout.`
    );
    this.name = 'UnsupportedLayoutVersionError';
  }
}

/**
 * Checks whether an incoming layout object has a version newer than currently supported.
 */
export function isUnsupportedNewerLayoutVersion(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const raw = input as Record<string, unknown>;
  return typeof raw.version === 'number' && raw.version > CURRENT_HOME_LAYOUT_VERSION;
}

/**
 * Validates and sanitizes a user-supplied custom display label.
 * Bounds length to 1-40 characters, trims Unicode whitespace,
 * strips HTML/script tags, and rejects empty strings.
 */
export function validateCustomLabel(input: unknown): string | null {
  if (typeof input !== 'string') return null;

  // Strip script and style blocks including their contents
  let stripped = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  stripped = stripped.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  // Strip any remaining HTML / XML tags to prevent markup injection
  stripped = stripped.replace(/<[^>]*>/g, '').trim();
  if (stripped.length === 0) return null;

  // Bound length to 40 characters
  return stripped.slice(0, 40);
}

/**
 * Returns a calm default HomeLayout for Phase 69 focused Today:
 * three primary groups + optional journal prompt (≤5 cards).
 * Module shortcut chips default off — primary destinations live in the shell.
 * Quick Capture defaults off; shell Create remains the primary capture path.
 */
export function getDefaultHomeLayout(): HomeLayout {
  return {
    version: 1,
    density: 'comfortable',
    widgets: [
      { id: 'tasks', visible: true, order: 0, customLabel: null },
      { id: 'routines', visible: true, order: 1, customLabel: null },
      { id: 'upcoming_summary', visible: true, order: 2, customLabel: null },
      { id: 'journal_prompt', visible: true, order: 3, customLabel: null },
      { id: 'quick_capture', visible: false, order: 4, customLabel: null },
      { id: 'recent_items', visible: false, order: 5, customLabel: null },
      { id: 'favorite_folders', visible: false, order: 6, customLabel: null },
    ],
    moduleShortcuts: [
      { id: 'today', visible: false, order: 0, customLabel: null },
      { id: 'plan', visible: false, order: 1, customLabel: null },
      { id: 'library', visible: false, order: 2, customLabel: null },
      { id: 'journal', visible: false, order: 3, customLabel: null },
      { id: 'notes', visible: false, order: 4, customLabel: null },
      { id: 'files', visible: false, order: 5, customLabel: null },
      { id: 'tasks', visible: false, order: 6, customLabel: null },
      { id: 'routines', visible: false, order: 7, customLabel: null },
      { id: 'calendar', visible: false, order: 8, customLabel: null },
      { id: 'knowledge', visible: false, order: 9, customLabel: null },
    ],
    favoriteFolderIds: [],
  };
}

/**
 * Normalizes, sanitizes, and migrates home layout metadata.
 * Drops unknown or unreleased widget/module identifiers (e.g. expenses, vault, rooms, ai),
 * appends missing approved widgets with defaults, bounds custom labels,
 * normalizes ordering to consecutive zero-indexed integers, and deduplicates folder UUIDs.
 * Throws UnsupportedLayoutVersionError if the input layout has a newer version,
 * unless allowUnsupportedVersion is specified.
 */
export function sanitizeAndMigrateHomeLayout(
  input: unknown,
  options?: { allowUnsupportedVersion?: boolean }
): HomeLayout {
  const defaults = getDefaultHomeLayout();

  if (!input || typeof input !== 'object') {
    return defaults;
  }

  const raw = input as Record<string, unknown>;

  // Check version compatibility
  if (isUnsupportedNewerLayoutVersion(input)) {
    const ver = Number(raw.version);
    if (!options?.allowUnsupportedVersion) {
      throw new UnsupportedLayoutVersionError(ver);
    }
    return {
      ...defaults,
      unsupportedVersion: ver,
    };
  }

  // Density
  const density: HomeDensity =
    raw.density === 'compact' || raw.density === 'comfortable' ? raw.density : 'comfortable';

  // Widgets
  const rawWidgets = Array.isArray(raw.widgets) ? raw.widgets : [];
  const validWidgets: HomeWidgetConfig[] = [];
  const seenWidgetIds = new Set<string>();

  for (const item of rawWidgets) {
    if (!item || typeof item !== 'object') continue;
    const itemObj = item as Record<string, unknown>;
    const id = itemObj.id as string;

    if (APPROVED_HOME_WIDGET_IDS.includes(id as HomeWidgetId) && !seenWidgetIds.has(id)) {
      seenWidgetIds.add(id);
      validWidgets.push({
        id: id as HomeWidgetId,
        visible: Boolean(itemObj.visible),
        order: typeof itemObj.order === 'number' && Number.isFinite(itemObj.order) ? itemObj.order : validWidgets.length,
        customLabel: validateCustomLabel(itemObj.customLabel),
      });
    }
  }

  // Ensure all approved widgets exist
  for (const defWidget of defaults.widgets) {
    if (!seenWidgetIds.has(defWidget.id)) {
      validWidgets.push({
        ...defWidget,
        order: validWidgets.length,
      });
    }
  }

  // Sort and re-index sequentially
  validWidgets.sort((a, b) => a.order - b.order);
  const normalizedWidgets = validWidgets.map((w, index) => ({
    ...w,
    order: index,
  }));

  // Module Shortcuts
  const rawShortcuts = Array.isArray(raw.moduleShortcuts) ? raw.moduleShortcuts : [];
  const validShortcuts: ModuleShortcutConfig[] = [];
  const seenShortcutIds = new Set<string>();

  for (const item of rawShortcuts) {
    if (!item || typeof item !== 'object') continue;
    const itemObj = item as Record<string, unknown>;
    const id = itemObj.id as string;

    if (APPROVED_MODULE_SHORTCUT_IDS.includes(id as ModuleShortcutId) && !seenShortcutIds.has(id)) {
      seenShortcutIds.add(id);
      validShortcuts.push({
        id: id as ModuleShortcutId,
        visible: Boolean(itemObj.visible),
        order: typeof itemObj.order === 'number' && Number.isFinite(itemObj.order) ? itemObj.order : validShortcuts.length,
        customLabel: validateCustomLabel(itemObj.customLabel),
      });
    }
  }

  // Ensure all approved module shortcuts exist
  for (const defShortcut of defaults.moduleShortcuts) {
    if (!seenShortcutIds.has(defShortcut.id)) {
      validShortcuts.push({
        ...defShortcut,
        order: validShortcuts.length,
      });
    }
  }

  // Sort and re-index sequentially
  validShortcuts.sort((a, b) => a.order - b.order);
  const normalizedShortcuts = validShortcuts.map((s, index) => ({
    ...s,
    order: index,
  }));

  // Favorite folders (UUIDs only)
  const rawFolderIds = Array.isArray(raw.favoriteFolderIds) ? raw.favoriteFolderIds : [];
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const favoriteFolderIds = Array.from(
    new Set(
      rawFolderIds.filter((id): id is string => typeof id === 'string' && uuidRegex.test(id))
    )
  );

  return {
    version: 1,
    density,
    widgets: normalizedWidgets,
    moduleShortcuts: normalizedShortcuts,
    favoriteFolderIds: favoriteFolderIds.slice(0, 20),
  };
}

/**
 * Reorders a widget up or down in the widget list, providing an accessible
 * alternative to drag-and-drop. Maintains stable orders.
 */
export function reorderWidgets(
  widgets: HomeWidgetConfig[],
  widgetId: HomeWidgetId,
  direction: 'up' | 'down'
): HomeWidgetConfig[] {
  const sorted = [...widgets].sort((a, b) => a.order - b.order);
  const currentIndex = sorted.findIndex((w) => w.id === widgetId);
  if (currentIndex === -1) return widgets;

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= sorted.length) return widgets;

  // Swap
  const currentItem = sorted[currentIndex]!;
  const targetItem = sorted[targetIndex]!;
  sorted[currentIndex] = targetItem;
  sorted[targetIndex] = currentItem;

  return sorted.map((w, index) => ({
    ...w,
    order: index,
  }));
}

/**
 * Reorders a module shortcut up or down in the shortcuts list.
 */
export function reorderModuleShortcuts(
  shortcuts: ModuleShortcutConfig[],
  shortcutId: ModuleShortcutId,
  direction: 'up' | 'down'
): ModuleShortcutConfig[] {
  const sorted = [...shortcuts].sort((a, b) => a.order - b.order);
  const currentIndex = sorted.findIndex((s) => s.id === shortcutId);
  if (currentIndex === -1) return shortcuts;

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= sorted.length) return shortcuts;

  // Swap
  const currentItem = sorted[currentIndex]!;
  const targetItem = sorted[targetIndex]!;
  sorted[currentIndex] = targetItem;
  sorted[targetIndex] = currentItem;

  return sorted.map((s, index) => ({
    ...s,
    order: index,
  }));
}

export interface RecentItemEntry {
  id: string;
  type: 'note' | 'task' | 'routine' | 'event' | 'file' | 'journal';
  title: string;
  updatedAt: string;
  folderId?: string | null;
  bodyPreview?: string | null;
}

/**
 * Enforces privacy rules for recent items displayed on the Today view.
 * Journal entries have body previews strictly removed and fallback to generic title
 * if private title hiding is requested. Vault entries are entirely excluded.
 */
export function filterRecentItemsForPrivacy(
  items: RecentItemEntry[],
  options?: { hideJournalSnippets?: boolean }
): RecentItemEntry[] {
  const hideJournal = options?.hideJournalSnippets !== false;

  return items
    .filter((item) => {
      // Exclude unreleased or secure vault items
      if (item.type === ('vault' as unknown as string)) return false;
      return true;
    })
    .map((item) => {
      if (item.type === 'journal') {
        return {
          ...item,
          bodyPreview: null, // Strictly no body preview on Today
          title: hideJournal ? 'Journal entry' : item.title || 'Journal entry',
        };
      }
      return item;
    });
}
