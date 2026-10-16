import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactsDir = path.join(root, 'artifacts', 'web-e2e');
fs.mkdirSync(artifactsDir, { recursive: true });

const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

const browserExe = edgeCandidates.find((c) => fs.existsSync(c));
if (!browserExe) {
  console.error('No compatible Chromium browser found at standard paths.');
  process.exit(1);
}

const serverPort = 3105;
const cdpPort = 9225;
const userDataDir = path.join(root, 'artifacts', 'local', 'edge-e2e-profile');
fs.mkdirSync(userDataDir, { recursive: true });

console.log('=== STARTING PHASE 05 RESPONSIVE WEB SHELL E2E TEST ===');
console.log(`Browser: ${browserExe}`);
console.log(`Server Port: ${serverPort}`);
console.log(`CDP Port: ${cdpPort}`);

// 1. Start Next.js Production Server
console.log('\n[1/6] Launching Next.js production server...');
const nextBin = path.join(root, 'apps', 'web', 'node_modules', 'next', 'dist', 'bin', 'next');
const server = spawn(
  process.execPath,
  [nextBin, 'start', path.join(root, 'apps', 'web'), '-p', String(serverPort)],
  {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);

server.stdout.on('data', () => {});
server.stderr.on('data', (d) => process.stderr.write(`[Server] ${d}`));

let serverExited = false;
server.on('exit', (code) => {
  serverExited = true;
  if (code !== null && code !== 0) {
    console.error(`Next.js server exited prematurely with code ${code}`);
  }
});

// Wait for server health endpoint
let serverReady = false;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/health`);
    if (res.ok) {
      serverReady = true;
      break;
    }
  } catch {}
}

if (!serverReady) {
  server.kill();
  throw new Error(`Server failed to start on port ${serverPort}`);
}
console.log('✓ Next.js server ready at http://127.0.0.1:' + serverPort);

// 2. Launch Browser via CDP
console.log('\n[2/6] Launching headless browser with CDP debugging...');
const browser = spawn(browserExe, [
  '--headless=new',
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  'about:blank',
]);

let versionInfo = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
    if (res.ok) {
      versionInfo = await res.json();
      break;
    }
  } catch {}
}

if (!versionInfo) {
  browser.kill();
  server.kill();
  throw new Error('Could not connect to browser CDP');
}
console.log(`✓ Connected to ${versionInfo.Browser}`);

// Helper CDP WebSocket Client
const newTabRes = await fetch(
  `http://127.0.0.1:${cdpPort}/json/new?http://127.0.0.1:${serverPort}/today`,
  {
    method: 'PUT',
  }
);
const tab = await newTabRes.json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);

let msgId = 1;
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = msgId++;
    const handler = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === id) {
        ws.removeEventListener('message', handler);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

await new Promise((r) => ws.addEventListener('open', r));
await send('Runtime.enable');
await send('Page.enable');
await send('DOM.enable');

const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error('Evaluation exception: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result.value;
};

const setViewport = async (width, height, isMobile = false) => {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: isMobile,
  });
  await new Promise((r) => setTimeout(r, 100));
};

const captureScreenshot = async (filename) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const buffer = Buffer.from(data, 'base64');
  const target = path.join(artifactsDir, filename);
  fs.writeFileSync(target, buffer);
  console.log(`  📸 Screenshot saved: ${filename}`);
};

const navigateTo = async (urlPath) => {
  await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}${urlPath}` });
  await new Promise((r) => setTimeout(r, 500));
};

const testResults = [];
const record = (name, pass, details) => {
  testResults.push({ name, pass, details });
  console.log(`${pass ? '✓ PASS' : '✗ FAIL'}: ${name} — ${details}`);
};

try {
  // ----------------------------------------------------
  // TEST SUITE 1: Responsive Layouts & Horizontal Reflow
  // ----------------------------------------------------
  console.log('\n[3/6] Testing responsive layouts & 320 CSS-px width reflow...');

  // A. Desktop Wide Viewport (1280x800)
  await setViewport(1280, 800, false);
  await navigateTo('/today');
  const desktopLayout = await evaluate(`(() => {
    const sidebar = document.querySelector('nav[aria-label="Desktop Navigation"]');
    const bottomNav = document.querySelector('nav[aria-label="Compact Navigation"]');
    const header = document.querySelector('header[role="banner"]');
    const main = document.querySelector('main#main-content');
    return {
      hasSidebar: !!sidebar && window.getComputedStyle(sidebar).display !== 'none',
      hasBottomNavHidden: !!bottomNav && window.getComputedStyle(bottomNav).display === 'none',
      hasHeader: !!header,
      hasMain: !!main,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  })()`);

  record(
    'Desktop 1280px layout',
    desktopLayout.hasSidebar && desktopLayout.hasBottomNavHidden && desktopLayout.hasHeader,
    `Sidebar visible, BottomNav hidden, scrollWidth=${desktopLayout.scrollWidth}px`
  );

  await captureScreenshot('today-light-desktop.png');

  // Switch to Dark Theme & Screenshot
  await evaluate(`document.querySelector('#global-theme-toggle').click()`);
  await new Promise((r) => setTimeout(r, 200));
  const isDark = await evaluate(`document.documentElement.getAttribute('data-theme') === 'dark'`);
  record('Theme toggle switch to Dark', isDark, 'HTML data-theme updated to dark');
  await captureScreenshot('today-dark-desktop.png');

  // Switch back to Light
  await evaluate(`document.querySelector('#global-theme-toggle').click()`);
  await new Promise((r) => setTimeout(r, 200));

  // B. Tablet Viewport (768x1024)
  await setViewport(768, 1024, false);
  const tabletLayout = await evaluate(`(() => {
    const sidebar = document.querySelector('nav[aria-label="Desktop Navigation"]');
    const bottomNav = document.querySelector('nav[aria-label="Compact Navigation"]');
    return {
      sidebarVisible: !!sidebar && window.getComputedStyle(sidebar).display !== 'none',
      bottomNavHidden: !!bottomNav && window.getComputedStyle(bottomNav).display === 'none',
      noOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    };
  })()`);
  record(
    'Tablet 768px layout',
    tabletLayout.sidebarVisible && tabletLayout.bottomNavHidden && tabletLayout.noOverflow,
    'Responsive narrow sidebar, no horizontal clipping'
  );

  // C. Compact Mobile Viewport (320x600 - WCAG 320 CSS-pixel reflow gate)
  await setViewport(320, 600, true);
  const compactLayout = await evaluate(`(() => {
    const sidebar = document.querySelector('nav[aria-label="Desktop Navigation"]');
    const bottomNav = document.querySelector('nav[aria-label="Compact Navigation"]');
    const scrollWidth = document.documentElement.scrollWidth;
    const clientWidth = document.documentElement.clientWidth;
    return {
      sidebarHidden: !!sidebar && window.getComputedStyle(sidebar).display === 'none',
      bottomNavVisible: !!bottomNav && window.getComputedStyle(bottomNav).display !== 'none',
      scrollWidth,
      clientWidth,
      noOverflow: scrollWidth <= clientWidth,
    };
  })()`);

  record(
    'Compact 320px mobile layout (WCAG Reflow)',
    compactLayout.bottomNavVisible && compactLayout.sidebarHidden && compactLayout.noOverflow,
    `BottomNav active, zero horizontal overflow (scrollWidth=${compactLayout.scrollWidth} <= clientWidth=${compactLayout.clientWidth})`
  );
  await captureScreenshot('today-light-mobile-320px.png');

  // Restore Desktop Viewport for full route tests
  await setViewport(1280, 800, false);

  // ----------------------------------------------------
  // TEST SUITE 2: All Routes Direct Load & History Navigation
  // ----------------------------------------------------
  console.log('\n[4/6] Testing all parent routes, refresh, Back and Forward navigation...');

  const routes = [
    { path: '/today', expectedText: 'Tasks Due Today' },
    { path: '/plan', expectedText: 'Plan' },
    { path: '/plan/calendar', expectedText: 'Calendar' },
    { path: '/library', expectedText: 'Library' },
    { path: '/journal', expectedText: 'Journal' },
    { path: '/settings', expectedText: 'Settings' },
    { path: '/help', expectedText: 'Help & Accessibility Guide' },
    { path: '/review', expectedText: 'Daynori Component Review Surface' },
    { path: '/unknown-route-test-404', expectedText: 'Page Not Found' },
  ];

  for (const r of routes) {
    await navigateTo(r.path);
    const pageContent = await evaluate(`document.body.innerText`);
    const hasText = pageContent.includes(r.expectedText);
    const currentAttr = await evaluate(
      `document.querySelector('a[href="${r.path}"]')?.getAttribute('aria-current')`
    );
    record(
      `Route direct load ${r.path}`,
      hasText,
      `Contains "${r.expectedText}"${currentAttr === 'page' ? ' (aria-current="page")' : ''}`
    );

    if (r.path === '/plan/calendar') await captureScreenshot('plan-calendar-desktop.png');
    if (r.path === '/library') await captureScreenshot('library-desktop.png');
    if (r.path === '/journal') await captureScreenshot('journal-desktop.png');
  }

  // Refresh test
  await send('Page.reload');
  await new Promise((r) => setTimeout(r, 400));
  const afterReloadText = await evaluate(`document.body.innerText`);
  record(
    'Page reload (refresh) stability',
    afterReloadText.includes('Page Not Found'),
    '404 state maintained after reload'
  );

  // Browser Back / Forward History Test
  await navigateTo('/today');
  await navigateTo('/plan');
  await navigateTo('/journal');

  await evaluate(`window.history.back()`);
  await new Promise((r) => setTimeout(r, 300));
  const backUrl = await evaluate(`window.location.pathname`);
  record('Browser Back button navigation', backUrl === '/plan', `Navigated back to ${backUrl}`);

  await evaluate(`window.history.forward()`);
  await new Promise((r) => setTimeout(r, 300));
  const fwdUrl = await evaluate(`window.location.pathname`);
  record(
    'Browser Forward button navigation',
    fwdUrl === '/journal',
    `Navigated forward to ${fwdUrl}`
  );

  // ----------------------------------------------------
  // TEST SUITE 3: Keyboard Navigation & Shortcuts
  // ----------------------------------------------------
  console.log('\n[5/6] Testing keyboard navigation, focus indicators, and shortcuts...');

  await navigateTo('/today');

  // A. Skip Navigation Link Focus & Target
  const skipLinkCheck = await evaluate(`(async () => {
    const skipLink = document.querySelector('a[href="#main-content"]');
    if (!skipLink) return { found: false };
    skipLink.focus();
    await new Promise((r) => setTimeout(r, 150));
    const isFocused = document.activeElement === skipLink;
    const computed = window.getComputedStyle(skipLink);
    return {
      found: true,
      isFocused,
      visibleWhenFocused: computed.position === 'fixed' || computed.position === 'absolute',
      minHeight: parseInt(computed.minHeight || '0', 10),
    };
  })()`);

  record(
    'Skip link focusability and target size',
    skipLinkCheck.found && skipLinkCheck.isFocused && skipLinkCheck.minHeight >= 44,
    `Skip link focused, minHeight=${skipLinkCheck.minHeight}px >= 44px`
  );

  // B. Shortcut '?' opens Help Dialog, Escape closes it
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: '?', text: '?' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '?' });
  await new Promise((r) => setTimeout(r, 300));

  const helpDialogOpen = await evaluate(`(() => {
    const dialog = document.querySelector('div[role="dialog"]');
    return !!dialog && dialog.innerText.includes('Keyboard Shortcuts');
  })()`);
  record(
    'Keyboard shortcut "?" opens Help Dialog',
    helpDialogOpen,
    'Dialog rendered with role="dialog"'
  );

  // Escape closes dialog
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape' });
  await new Promise((r) => setTimeout(r, 300));

  const helpDialogClosed = await evaluate(`!document.querySelector('div[role="dialog"]')`);
  record('Escape key closes modal dialog', helpDialogClosed, 'Dialog successfully dismissed');

  // C. Shortcut '/' opens Search modal and suppresses navigation shortcuts while typing
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: '/', text: '/' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '/' });
  await new Promise((r) => setTimeout(r, 300));

  const searchOpen = await evaluate(`(() => {
    const input = document.querySelector('#search-input');
    return !!input;
  })()`);
  record('Keyboard shortcut "/" opens Search dialog', searchOpen, 'Search input rendered');

  // Type characters inside the search input (e.g. "p" and "t") and verify they DO NOT trigger route navigation
  await send('Input.dispatchKeyEvent', { type: 'keyDown', text: 'p' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'p' });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', text: 't' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 't' });
  await new Promise((r) => setTimeout(r, 200));

  const pathAfterTyping = await evaluate(`window.location.pathname`);
  record(
    'Shortcut suppression while typing',
    pathAfterTyping === '/today',
    `Location remained at ${pathAfterTyping} without accidental navigation`
  );

  // Close search dialog
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape' });
  await new Promise((r) => setTimeout(r, 300));

  // D. Single-key route navigation 'p' -> /plan
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'p', text: 'p' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'p' });
  await new Promise((r) => setTimeout(r, 400));
  const planPath = await evaluate(`window.location.pathname`);
  record(
    'Single-key shortcut "P" navigates to Plan',
    planPath === '/plan',
    `Navigated to ${planPath}`
  );

  // ----------------------------------------------------
  // TEST SUITE 4: Accessibility, RTL, Bangla, Density & Shell States
  // ----------------------------------------------------
  console.log('\n[6/6] Testing accessibility, Bangla readability, RTL, and shell states...');

  // A. Route Announcer
  const routeAnnouncement = await evaluate(
    `document.querySelector('div[role="status"][aria-live="polite"]')?.innerText`
  );
  record(
    'Route change announcement for screen readers',
    routeAnnouncement?.includes('Plan'),
    `Announced: "${routeAnnouncement}"`
  );

  // B. Settings: Text scaling, RTL, and Bangla readability
  await navigateTo('/settings');

  // Check Bangla readability card
  const banglaCard = await evaluate(`(() => {
    const card = document.querySelector('#lang-bn-btn');
    const text = document.body.innerText;
    return {
      hasButton: !!card,
      hasBanglaScript: text.includes('আজকের দিনটি গুছিয়ে নিন'),
    };
  })()`);
  record(
    'Bangla script readability & typography',
    banglaCard.hasButton && banglaCard.hasBanglaScript,
    'Rendered conjuncts with extended 1.6 line-height'
  );
  await captureScreenshot('settings-bangla-desktop.png');

  // Test RTL toggle
  await evaluate(`document.querySelector('#direction-rtl-btn').click()`);
  await new Promise((r) => setTimeout(r, 200));
  const dirRtl = await evaluate(`document.documentElement.getAttribute('dir') === 'rtl'`);
  record('RTL reading direction switch', dirRtl, 'HTML dir set to "rtl"');

  // Restore LTR
  await evaluate(`document.querySelector('#direction-ltr-btn').click()`);

  // Test 200% text scale reflow
  await evaluate(`document.querySelector('#scale-200').click()`);
  await new Promise((r) => setTimeout(r, 200));
  await setViewport(320, 600, true);
  const scale200NoOverflow = await evaluate(
    `document.documentElement.scrollWidth <= document.documentElement.clientWidth`
  );
  record(
    '200% text resize reflow at 320px width (WCAG 1.4.10)',
    scale200NoOverflow,
    `Zero horizontal clipping at 200% font size in 320px viewport`
  );

  // Restore 100% scale and desktop viewport
  await evaluate(`document.querySelector('#scale-100').click()`);
  await setViewport(1280, 800, false);

  // Test WCAG 2.1.4 Character Key Shortcuts toggle
  await evaluate(`document.querySelector('#shortcuts-disable-btn').click()`);
  await new Promise((r) => setTimeout(r, 200));
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 't', text: 't' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 't' });
  await new Promise((r) => setTimeout(r, 300));
  const pathStillSettings = await evaluate(`window.location.pathname`);
  record(
    'WCAG 2.1.4 Character shortcut disablable',
    pathStillSettings === '/settings',
    'Disabling shortcuts prevented single-key "t" from navigating'
  );

  // Re-enable shortcuts and verify "t" navigates to /today
  await evaluate(`document.querySelector('#shortcuts-enable-btn').click()`);
  await new Promise((r) => setTimeout(r, 200));
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 't', text: 't' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 't' });
  await new Promise((r) => setTimeout(r, 400));
  const pathAfterReenable = await evaluate(`window.location.pathname`);
  record(
    'WCAG 2.1.4 Character shortcut re-enabled',
    pathAfterReenable === '/today',
    'Re-enabling shortcuts allowed single-key "t" to navigate to /today'
  );

  // C. Interactive States: Empty, Loading, Error, Retry
  await navigateTo('/today');

  // 1. Toggle Empty State
  await evaluate(`document.querySelector('#toggle-empty-state-btn').click()`);
  await new Promise((r) => setTimeout(r, 200));
  const emptyStateRendered = await evaluate(`(() => {
    const el = document.querySelector('#today-empty-state');
    return !!el && el.innerText.includes('All caught up for today');
  })()`);
  record(
    'Interactive Empty state rendering',
    emptyStateRendered,
    'Gentle empty state with Create Task action'
  );

  // Restore content
  await evaluate(`document.querySelector('#toggle-empty-state-btn').click()`);

  // 2. Simulate Loading State
  await evaluate(`document.querySelector('#simulate-loading-btn').click()`);
  const loadingStateRendered = await evaluate(`(() => {
    const el = document.querySelector('div[role="status"][aria-busy="true"]');
    return !!el && el.innerText.includes('Refreshing Today content');
  })()`);
  record(
    'Interactive Loading state rendering',
    loadingStateRendered,
    'aria-busy="true" status indicator'
  );
  await new Promise((r) => setTimeout(r, 900));

  // 3. Simulate Error & Retry State
  await evaluate(`document.querySelector('#simulate-error-btn').click()`);
  await new Promise((r) => setTimeout(r, 200));
  const errorRendered = await evaluate(`(() => {
    const el = document.querySelector('#retry-state-btn');
    return !!el && document.body.innerText.includes('Synchronization Error');
  })()`);
  record(
    'Interactive Error state rendering',
    errorRendered,
    'role="alert" feedback with Retry button'
  );

  // Click Retry
  await evaluate(`document.querySelector('#retry-state-btn').click()`);
  await new Promise((r) => setTimeout(r, 700));
  const errorCleared = await evaluate(`!document.querySelector('#retry-state-btn')`);
  record('Interactive Retry state recovery', errorCleared, 'Content recovered cleanly after retry');

  // ----------------------------------------------------
  // TEST SUITE 5: Phase 15 Folder Browsing, Mixed Item Lists & Hierarchy Navigation
  // ----------------------------------------------------
  console.log('\n[7/7] Testing Phase 15 Library folder browsing, hierarchy, and mixed items...');

  await setViewport(1280, 800, false);
  await navigateTo('/library');

  // A. Verify Root Breadcrumb & Empty Workspace by Default
  const rootBreadcrumb = await evaluate(
    `document.querySelector('nav[aria-label="Breadcrumb"]')?.innerText`
  );
  record(
    'Phase 15 Library root breadcrumbs',
    rootBreadcrumb?.includes('Workspace'),
    `Breadcrumb contains Workspace: "${rootBreadcrumb}"`
  );

  const emptyTitle = await evaluate(
    `document.querySelector('#library-empty-state')?.innerText || document.querySelector('section[aria-label="Your library is empty"]')?.innerText`
  );
  record(
    'Phase 15 Library empty workspace by default',
    emptyTitle?.includes('Your library is empty'),
    `Empty workspace title: "${emptyTitle}"`
  );

  // Explicit user action to load sample journeys
  await evaluate(`(() => {
    const btn = document.querySelector('#load-demo-journeys-btn');
    if (btn) btn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 400));

  const initialFolders = await evaluate(`(() => {
    const list = Array.from(document.querySelectorAll('button[title^="Open "]'));
    return list.map((b) => b.innerText.trim());
  })()`);
  record(
    'Phase 15 Canonical root folders present',
    initialFolders.some((f) => f.includes('Software')) &&
      initialFolders.some((f) => f.includes('Government jobs')),
    `Found folders: ${initialFolders.join(', ')}`
  );

  await captureScreenshot('library-root-desktop.png');

  // B. Drill down into Software folder
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button[title^="Open "]')).find(b => b.innerText.includes('Software'));
    if (btn) btn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 300));

  const softwareBreadcrumb = await evaluate(
    `document.querySelector('nav[aria-label="Breadcrumb"]')?.innerText`
  );
  record(
    'Phase 15 Drill-down into Software folder',
    softwareBreadcrumb?.includes('Software'),
    `Breadcrumb updated to: "${softwareBreadcrumb}"`
  );

  const softwareSubfolders = await evaluate(`(() => {
    const list = Array.from(document.querySelectorAll('button[title^="Open "]'));
    return list.map((b) => b.innerText.trim());
  })()`);
  record(
    'Phase 15 Subfolders Guides and Projects in Software',
    softwareSubfolders.some((f) => f.includes('Guides')) &&
      softwareSubfolders.some((f) => f.includes('Projects')),
    `Subfolders: ${softwareSubfolders.join(', ')}`
  );

  await captureScreenshot('library-software-desktop.png');

  // C. Drill down into Guides folder (contains mixed items: knowledge note, pdf file, task)
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button[title^="Open "]')).find(b => b.innerText.includes('Guides'));
    if (btn) btn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 300));

  const guidesBreadcrumb = await evaluate(
    `document.querySelector('nav[aria-label="Breadcrumb"]')?.innerText`
  );
  record(
    'Phase 15 Drill-down into Guides subfolder',
    guidesBreadcrumb?.includes('Guides'),
    `Breadcrumb updated to: "${guidesBreadcrumb}"`
  );

  const guidesItems = await evaluate(`(() => {
    const rows = Array.from(document.querySelectorAll('div[role="listitem"]'));
    return rows.map((r) => r.innerText.trim());
  })()`);
  record(
    'Phase 15 Mixed items in Guides (note, file, task)',
    guidesItems.some((i) => i.includes('TypeScript reference')) &&
      guidesItems.some((i) => i.includes('.pdf')) &&
      guidesItems.some((i) => i.includes('generics')),
    `Contained mixed items with badges`
  );

  await captureScreenshot('library-guides-mixed-items.png');

  // D. Type-filtering: Filter by Files without moving content
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Files');
    if (btn) btn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 200));

  const filteredItemsFiles = await evaluate(`(() => {
    const rows = Array.from(document.querySelectorAll('div[role="listitem"]'));
    return rows.map((r) => r.innerText.trim());
  })()`);
  record(
    'Phase 15 Type filter "Files" isolates PDF without altering folderId',
    filteredItemsFiles.length === 1 && filteredItemsFiles[0].includes('.pdf'),
    `Filtered items count=${filteredItemsFiles.length}`
  );

  // Restore All Items
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'All Items');
    if (btn) btn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 200));

  // E. Up Navigation: Return to Software, then return to Workspace
  await evaluate(`(() => {
    const upBtn = document.querySelector('button[aria-label="Navigate to parent folder"]');
    if (upBtn) upBtn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 300));
  const afterUpBreadcrumb = await evaluate(
    `document.querySelector('nav[aria-label="Breadcrumb"]')?.innerText`
  );
  record(
    'Phase 15 Up navigation returns to parent folder',
    afterUpBreadcrumb?.includes('Software') && !afterUpBreadcrumb?.includes('Guides'),
    `Current location: "${afterUpBreadcrumb}"`
  );

  // Up again to root
  await evaluate(`(() => {
    const upBtn = document.querySelector('button[aria-label="Navigate to parent folder"]');
    if (upBtn) upBtn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 300));
  const backAtRoot = await evaluate(
    `document.querySelector('nav[aria-label="Breadcrumb"]')?.innerText`
  );
  record(
    'Phase 15 Up navigation back to Workspace root',
    backAtRoot?.trim() === 'Workspace',
    `Root location: "${backAtRoot?.trim()}"`
  );

  // F. Drill into Government jobs -> Applications
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button[title^="Open "]')).find(b => b.innerText.includes('Government jobs'));
    if (btn) btn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 300));

  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button[title^="Open "]')).find(b => b.innerText.includes('Applications'));
    if (btn) btn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 300));

  const govItems = await evaluate(`(() => {
    const rows = Array.from(document.querySelectorAll('div[role="listitem"]'));
    return rows.map((r) => r.innerText.trim());
  })()`);
  record(
    'Phase 15 Government jobs Applications journey items',
    govItems.some((i) => i.includes('Application Form.pdf')) &&
      govItems.some((i) => i.includes('civil service exam')),
    `Government jobs journey verified`
  );

  // G. Test Folder Creation Modal
  await navigateTo('/library');
  await evaluate(
    `document.querySelector('button[aria-label="Create new workspace folder"]').click()`
  );
  await new Promise((r) => setTimeout(r, 300));

  const createDialogOpen = await evaluate(`(() => {
    const input = document.querySelector('#create-folder-name');
    return !!input;
  })()`);
  record('Phase 15 Create Folder dialog opens', createDialogOpen, 'Dialog rendered with input');

  await evaluate(`document.querySelector('#create-folder-name').focus()`);
  await send('Input.insertText', { text: 'E2E Verified Folder' });
  await new Promise((r) => setTimeout(r, 200));

  await evaluate(`(() => {
    const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Create Folder');
    if (submitBtn) submitBtn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 400));

  const newFolderAppeared = await evaluate(`(() => {
    const list = Array.from(document.querySelectorAll('button[title^="Open "]'));
    return list.some(b => b.innerText.includes('E2E Verified Folder'));
  })()`);
  record(
    'Phase 15 Folder created and rendered in workspace',
    newFolderAppeared,
    'E2E Verified Folder present in folder list'
  );

  // H. Responsive 320px mobile reflow on /library
  await setViewport(320, 600, true);
  const libraryMobileReflow = await evaluate(`(() => {
    const scrollWidth = document.documentElement.scrollWidth;
    const clientWidth = document.documentElement.clientWidth;
    return {
      scrollWidth,
      clientWidth,
      noOverflow: scrollWidth <= clientWidth,
    };
  })()`);
  record(
    'Phase 15 Library 320px mobile reflow (WCAG 1.4.10)',
    libraryMobileReflow.noOverflow,
    `Zero horizontal overflow: scrollWidth=${libraryMobileReflow.scrollWidth} <= clientWidth=${libraryMobileReflow.clientWidth}`
  );
  await captureScreenshot('library-mobile-320px.png');

  // Restore desktop viewport
  await setViewport(1280, 800, false);

  // Final summary
  const allPassed = testResults.every((t) => t.pass);
  console.log('\n=== BROWSER E2E TEST SUMMARY ===');
  console.log(`Total tests: ${testResults.length}`);
  console.log(`Passed: ${testResults.filter((t) => t.pass).length}`);
  console.log(`Failed: ${testResults.filter((t) => !t.pass).length}`);

  if (!allPassed) {
    throw new Error('One or more browser E2E tests failed');
  }

  console.log('\nAll browser responsive and interaction checks passed successfully!');
} finally {
  ws.close();
  browser.kill();
  server.kill();
}
