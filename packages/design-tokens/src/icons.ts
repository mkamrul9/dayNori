/** Shared 24-unit line artwork. Platform renderers own color, size and accessibility. */
export const iconPaths = {
  sun: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
  ],
  moon: ['M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z'],
  search: ['M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM16 16l5 5'],
  plus: ['M12 5v14M5 12h14'],
  menu: ['M4 6h16M4 12h16M4 18h16'],
  user: ['M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21v-2a8 6 0 0 1 16 0v2'],
  settings: [
    'M12.00 2.00L13.56 4.15L15.06 4.61L17.56 3.69L19.07 4.93L18.65 7.56L19.39 8.94L21.81 10.05L22.00 12.00L19.85 13.56L19.39 15.06L20.31 17.56L19.07 19.07L16.44 18.65L15.06 19.39L13.95 21.81L12.00 22.00L10.44 19.85L8.94 19.39L6.44 20.31L4.93 19.07L5.35 16.44L4.61 15.06L2.19 13.95L2.00 12.00L4.15 10.44L4.61 8.94L3.69 6.44L4.93 4.93L7.56 5.35L8.94 4.61L10.05 2.19ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  ],
  sliders: ['M4 7h4m4 0h8M4 17h8m4 0h4M8 4v6m4-6v6m0 4v6m4-6v6'],
  help: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM9 8a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01'],
  check: ['M5 12l4 4L19 6'],
  'check-circle': ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM7 12l3 3 7-7'],
  x: ['M6 6l12 12M18 6 6 18'],
  warning: [
    'M10.3 3.8 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0ZM12 9v4m0 4h.01',
  ],
  info: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 11v6m0-10h.01'],
  folder: ['M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z'],
  'folder-open': [
    'M3 9V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v2M3 9h17a1 1 0 0 1 1 1.3l-2.5 9a1 1 0 0 1-1 .7H5a2 2 0 0 1-2-2V9Z',
  ],
  file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6'],
  note: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M8 13h8M8 17h6'],
  clipboard: [
    'M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3M9 2h6v5H9V2ZM8 12h8M8 16h5',
  ],
  library: ['M3 3h4v18H3V3ZM10 3h4v18h-4V3ZM16 5l3-1 4 16-3 1-4-16Z'],
  book: ['M12 5C9 2 5 2 2 3v17c3-1 7-1 10 2 3-3 7-3 10-2V3c-3-1-7-1-10 2ZM12 5v17'],
  journal: [
    'M6 3h13a2 2 0 0 1 2 2v15a1 1 0 0 1-1 1H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3ZM6 3v18M10 7h7M10 11h5',
  ],
  calendar: [
    'M8 2v4m8-4v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM7 13h2m3 0h2m3 0h.01M7 17h2m3 0h2',
  ],
  repeat: ['M4 7h14l-3-3m3 3-3 3M20 17H6l3 3m-3-3 3-3M4 7v5m16 5v-5'],
  refresh: ['M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 13-2l2 2M4 17l2 2a8 8 0 0 0 13-2'],
  clock: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 6v6l4 2'],
  timer: ['M9 2h6m-3 0v3m6 2 2-2M12 5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 9v5'],
  hourglass: ['M6 2h12M6 22h12M7 2v5l5 5-5 5v5m10-20v5l-5 5 5 5v5'],
  edit: ['m15 5 4 4M4 20l1-5L17 3a2.8 2.8 0 0 1 4 4L9 19l-5 1Z'],
  trash: ['M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7'],
  archive: ['M3 3h18v5H3V3ZM5 8v13h14V8M10 12h4'],
  save: ['M4 3h13l4 4v14H3V3h1ZM7 3v6h9V3M7 21v-8h10v8'],
  download: ['M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5'],
  upload: ['M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5'],
  cloud: ['M7 19a5 5 0 1 1 1-10 7 7 0 0 1 13 2 4 4 0 0 1-1 8H7Z'],
  offline: ['m3 3 18 18M5 9a5 5 0 0 0 2 10h10M9 5a7 7 0 0 1 12 6 4 4 0 0 1 1 7'],
  lock: ['M6 10h12a2 2 0 0 1 2 2v8H4v-8a2 2 0 0 1 2-2ZM8 10V6a4 4 0 0 1 8 0v4M12 14v3'],
  shield: ['M12 2 3 6v6c0 5 4 8 9 10 5-2 9-5 9-10V6l-9-4ZM8 12l3 3 5-6'],
  bell: ['M6 9a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9ZM10 21h4'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
  attachment: ['m9 15 7-7a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7L15 3'],
  link: [
    'm10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  ],
  tag: ['M3 3h8l11 11-8 8L3 11V3ZM7 7h.01'],
  pin: ['m8 3 10 2-3 6 3 5-7-1-4 4-2-2 4-4-1-7 5 3 6-3M5 19l-3 3'],
  bookmark: ['M5 3h14v19l-7-5-7 5V3Z'],
  bulb: ['M8 16c0-3-3-3-3-7a7 7 0 0 1 14 0c0 4-3 4-3 7H8ZM8 19h8m-6 3h4'],
  leaf: ['M20 3C8 2 2 9 5 17c8 4 16-2 15-14ZM4 21 16 9'],
  code: ['m8 5-6 7 6 7m8-14 6 7-6 7M14 3l-4 18'],
  rocket: ['M14 3h7v7L10 21l-2-5-5-2L14 3ZM13 7l4 4M5 18l-2 3 3-1'],
  landmark: ['m2 7 10-5 10 5H2ZM3 22h18M5 10v9m5-9v9m4-9v9m5-9v9'],
  graduation: ['m2 8 10-5 10 5-10 5L2 8ZM6 10v7c4 3 8 3 12 0v-7M22 8v9'],
  palette: [
    'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4 2 2 0 0 1 1-4h3a3 3 0 0 0 3-3c0-4-4-7-9-7ZM7 8h.01M12 6h.01M17 8h.01M6 13h.01',
  ],
  chart: ['M4 3v18h17M8 17v-5m5 5V7m5 10V4'],
  wallet: ['M3 6V4h16v4H5a2 2 0 0 1 0-4M3 6v14h18V8H5M16 12h5v5h-5v-5Z'],
  'credit-card': ['M3 5h18v14H3V5ZM3 10h18M7 15h3'],
  'arrow-up': ['M12 20V4m-6 6 6-6 6 6'],
  'arrow-down': ['M12 4v16m-6-6 6 6 6-6'],
  'arrow-left': ['M20 12H4m6-6-6 6 6 6'],
  'arrow-right': ['M4 12h16m-6-6 6 6-6 6'],
  'arrow-up-right': ['M5 19 19 5M6 5h13v13'],
  'chevron-left': ['m15 5-7 7 7 7'],
  'chevron-right': ['m9 5 7 7-7 7'],
  'chevron-up': ['m5 15 7-7 7 7'],
  'chevron-down': ['m5 9 7 7 7-7'],
  undo: ['M3 5v7h7M3 12l4-4a7 7 0 0 1 12 5v5'],
  redo: ['M21 5v7h-7m7 0-4-4a7 7 0 0 0-12 5v5'],
  'corner-down-right': ['M4 3v10h16m-5-5 5 5-5 5'],
  square: ['M4 4h16v16H4V4Z'],
  'check-square': ['M20 12v8H4V4h12M8 11l4 4L22 5'],
  circle: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z'],
  'radio-selected': ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z'],
  microphone: ['M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8'],
  play: ['m7 3 14 9-14 9V3Z'],
  pause: ['M6 3h4v18H6V3Zm8 0h4v18h-4V3Z'],
  stop: ['M5 5h14v14H5V5Z'],
  globe: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2c-5 5-5 15 0 20 5-5 5-15 0-20Z'],
  image: ['M3 3h18v18H3V3Zm0 13 6-6 5 5 3-3 4 4M16 7h.01'],
  compass: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 5-3 7-7 3 3-7 7-3Z'],
  sparkle: ['m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z'],
  smile: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM8 9h.01m8 0h.01M7 14c3 4 7 4 10 0'],
  neutral: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM8 9h.01m8 0h.01M8 16h8'],
  rain: ['M6 15a4 4 0 1 1 1-8 6 6 0 0 1 11 2 3 3 0 0 1 0 6M8 18l-1 3m6-3-1 3m6-3-1 3'],
  tools: [
    'm3 3 6 6m6 6 6 6M7 3 3 7m14 10 4 4M21 3l-4 4h-3V4l4-3a6 6 0 0 0-8 8L3 16a3 3 0 0 0 4 4l8-8a6 6 0 0 0 6-9Z',
  ],
} as const;

export type IconName = keyof typeof iconPaths;

/** Legacy folder preferences are display metadata, not a migration of saved user records. */
const legacyIcons: Readonly<Record<string, IconName>> = {
  '☀': 'sun',
  '🌙': 'moon',
  '🔍': 'search',
  '➕': 'plus',
  '＋': 'plus',
  '☰': 'menu',
  '👤': 'user',
  '⚙': 'settings',
  '❓': 'help',
  'ℹ': 'info',
  '✓': 'check',
  '✅': 'check-circle',
  '✕': 'x',
  '✗': 'x',
  '⚠': 'warning',
  '📁': 'folder',
  '📂': 'folder-open',
  '📄': 'file',
  '📝': 'note',
  '📋': 'clipboard',
  '📚': 'library',
  '📖': 'book',
  '📓': 'journal',
  '📕': 'file',
  '📘': 'file',
  '📅': 'calendar',
  '🗓': 'calendar',
  '🔄': 'refresh',
  '🔁': 'repeat',
  '🕒': 'clock',
  '⏱': 'timer',
  '⏳': 'hourglass',
  '✏': 'edit',
  '✍': 'edit',
  '🖋': 'edit',
  '🗑': 'trash',
  '📦': 'archive',
  '💾': 'save',
  '📥': 'download',
  '📤': 'upload',
  '☁': 'cloud',
  '⚡': 'offline',
  '🔒': 'lock',
  '🛡': 'shield',
  '🔔': 'bell',
  '👁': 'eye',
  '📎': 'attachment',
  '🔗': 'link',
  '🏷': 'tag',
  '📌': 'pin',
  '🔖': 'bookmark',
  '💡': 'bulb',
  '🌱': 'leaf',
  '💻': 'code',
  '🚀': 'rocket',
  '🏛': 'landmark',
  '🎓': 'graduation',
  '🎨': 'palette',
  '📊': 'chart',
  '💸': 'wallet',
  '💰': 'wallet',
  '💳': 'credit-card',
  '↑': 'arrow-up',
  '↓': 'arrow-down',
  '←': 'arrow-left',
  '→': 'arrow-right',
  '➡': 'arrow-right',
  '⬇': 'arrow-down',
  '↗': 'arrow-up-right',
  '◀': 'chevron-left',
  '▶': 'play',
  '▲': 'chevron-up',
  '▼': 'chevron-down',
  '↩': 'undo',
  '↪': 'redo',
  '↺': 'undo',
  '↳': 'corner-down-right',
  '☑': 'check-square',
  '☐': 'square',
  '⚪': 'circle',
  '🔘': 'radio-selected',
  '🔴': 'circle',
  '🎙': 'microphone',
  '⏸': 'pause',
  '⏹': 'stop',
  '🌐': 'globe',
  '🖼': 'image',
  '🧭': 'compass',
  '✨': 'sparkle',
  '😊': 'smile',
  '🙂': 'smile',
  '😐': 'neutral',
  '🌧': 'rain',
  '📑': 'clipboard',
  '🛠': 'tools',
};

export function resolveIconName(value: string): IconName {
  if (Object.hasOwn(iconPaths, value)) return value as IconName;
  return legacyIcons[value.replace(/[\uFE0E\uFE0F]/g, '')] ?? 'file';
}

const glyphPattern = new RegExp(
  `(${Object.keys(legacyIcons)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})[\\uFE0E\\uFE0F]?`,
  'gu'
);
export type IconTextPart = { kind: 'text'; text: string } | { kind: 'icon'; name: IconName };

/** Only use for application-authored labels. User writing must render unchanged. */
export function splitIconText(text: string): IconTextPart[] {
  if (!text) return [];
  const parts: IconTextPart[] = [];
  let cursor = 0;
  const matches = text.matchAll(glyphPattern);
  for (const match of matches) {
    if (match[0].length === 0) continue;
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ kind: 'text', text: text.slice(cursor, index) });
    parts.push({ kind: 'icon', name: resolveIconName(match[0]) });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push({ kind: 'text', text: text.slice(cursor) });
  return parts.length > 0 ? parts : [{ kind: 'text', text }];
}
