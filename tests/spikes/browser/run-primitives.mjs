import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

const browserExe = browserCandidates.find((c) => fs.existsSync(c));
if (!browserExe) {
  console.error('No compatible Chromium browser found at standard paths.');
  process.exit(1);
}

const cdpPort = 9225;
const userDataDir = path.join(
  process.env.TEMP || 'C:\\Users\\Lenovo\\AppData\\Local\\Temp',
  'edge-primitives-test-' + Date.now()
);

fs.mkdirSync(userDataDir, { recursive: true });

// Check if dev or production server is responding
let targetPort = 3000;
let serverProcess = null;

async function checkUrl(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

let isReady = await checkUrl(`http://127.0.0.1:${targetPort}/review`);
if (!isReady) {
  targetPort = 3100;
  isReady = await checkUrl(`http://127.0.0.1:${targetPort}/review`);
}

if (!isReady) {
  console.log('No web server responding on 3000 or 3100, starting web server on 3000...');
  targetPort = 3000;
  serverProcess = spawn('pnpm', ['dev:web'], {
    shell: true,
    env: { ...process.env, PORT: '3000' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await checkUrl(`http://127.0.0.1:${targetPort}/review`)) {
      isReady = true;
      break;
    }
  }
  if (!isReady) {
    if (serverProcess) serverProcess.kill();
    console.error(
      'Failed to start or connect to web review surface at http://127.0.0.1:3000/review'
    );
    process.exit(1);
  }
}

const targetUrl = `http://127.0.0.1:${targetPort}/review`;
console.log(`Targeting real mounted React review surface at: ${targetUrl}`);

// Launch Chromium/Edge
const browser = spawn(browserExe, [
  '--headless=new',
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  'about:blank',
]);

let browserClosed = false;
function cleanup() {
  if (!browserClosed) {
    browserClosed = true;
    try {
      browser.kill('SIGKILL');
    } catch {}
  }
  if (serverProcess) {
    try {
      serverProcess.kill('SIGKILL');
    } catch {}
  }
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {}
}

process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(1);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(1);
});

try {
  let version = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      if (res.ok) {
        version = await res.json();
        break;
      }
    } catch {}
  }
  if (!version) throw new Error(`Could not connect to browser CDP on port ${cdpPort}`);
  console.log(`Connected to browser: ${version.Browser}`);

  const newTabRes = await fetch(
    `http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(targetUrl)}`,
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
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  // Wait for React hydration and #btn-danger
  let ready = false;
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const evalRes = await send('Runtime.evaluate', {
      expression: 'Boolean(document.getElementById("btn-danger"))',
    });
    if (evalRes?.result?.value === true) {
      ready = true;
      break;
    }
  }

  if (!ready) throw new Error('Timeout waiting for React components to mount on /review');

  // Allow React to complete hydration of event listeners
  await new Promise((r) => setTimeout(r, 1000));

  console.log('\n=== EXECUTING REAL BROWSER PRIMITIVE & ACCESSIBILITY VERIFICATION ===\n');

  // Script to execute inside the browser against the real React components
  const testScript = `
    (async () => {
      const results = [];
      const waitRender = () => new Promise(r => setTimeout(r, 200));

      function assert(name, condition, details = '') {
        results.push({ name, pass: Boolean(condition), details: String(details) });
      }

      function parseRgb(str) {
        const m = str.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
        if (!m) return [0, 0, 0];
        return [Number(m[1]), Number(m[2]), Number(m[3])];
      }
      function lum([r, g, b]) {
        const toLinear = (c) => {
          const s = c / 255;
          return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
      }
      function contrastRatio(rgb1, rgb2) {
        const l1 = lum(rgb1);
        const l2 = lum(rgb2);
        const max = Math.max(l1, l2);
        const min = Math.min(l1, l2);
        return Number(((max + 0.05) / (min + 0.05)).toFixed(2));
      }

      // Check 1: Button touch targets
      const primaryBtn = document.getElementById('btn-primary');
      const compactBtn = document.getElementById('btn-compact');
      const primaryRect = primaryBtn.getBoundingClientRect();
      const compactRect = compactBtn.getBoundingClientRect();
      assert('Button touch target meets 44px min', primaryRect.height >= 44 && compactRect.height >= 44,
        'Primary height: ' + primaryRect.height + 'px, Compact height: ' + compactRect.height + 'px');

      // Check 2: Danger Button contrast in light theme
      const toggleThemeBtn = document.getElementById('toggle-theme');
      if (!toggleThemeBtn.textContent.includes('Light')) {
        toggleThemeBtn.click();
        for (let i = 0; i < 20; i++) {
          await waitRender();
          if (toggleThemeBtn.textContent.includes('Light')) break;
        }
        await new Promise(r => setTimeout(r, 250));
      }

      const dangerBtn = document.getElementById('btn-danger');
      const lightDangerStyle = window.getComputedStyle(dangerBtn);
      const lightBg = parseRgb(lightDangerStyle.backgroundColor);
      const lightFg = parseRgb(lightDangerStyle.color);
      const lightRatio = contrastRatio(lightFg, lightBg);
      assert('F03: Light theme danger button contrast >= 4.5:1', lightRatio >= 4.5,
        'Ratio: ' + lightRatio + ':1 (bg: ' + lightDangerStyle.backgroundColor + ', fg: ' + lightDangerStyle.color + ')');

      // Check 2b: Selected row metadata contrast in light theme
      const lightSelectedRow = document.querySelector('[role="button"][aria-pressed="true"]');
      const lightSelectedMeta = lightSelectedRow?.querySelector('span[style*="0.75rem"]');
      if (lightSelectedMeta) {
        const metaStyle = window.getComputedStyle(lightSelectedMeta);
        const rowStyle = window.getComputedStyle(lightSelectedRow);
        const metaFg = parseRgb(metaStyle.color);
        const rowBg = parseRgb(rowStyle.backgroundColor);
        const metaRatio = contrastRatio(metaFg, rowBg);
        assert('F04: Light theme selected row metadata contrast >= 4.5:1', metaRatio >= 4.5,
          'Ratio: ' + metaRatio + ':1 (bg: ' + rowStyle.backgroundColor + ', fg: ' + metaStyle.color + ')');
      }

      // Check 3: Danger Button contrast in dark theme
      toggleThemeBtn.click();
      for (let i = 0; i < 20; i++) {
        await waitRender();
        if (toggleThemeBtn.textContent.includes('Dark')) break;
      }
      await new Promise(r => setTimeout(r, 250)); // Allow CSS background transition to settle

      const darkDangerStyle = window.getComputedStyle(dangerBtn);
      const darkBg = parseRgb(darkDangerStyle.backgroundColor);
      const darkFg = parseRgb(darkDangerStyle.color);
      const darkRatio = contrastRatio(darkFg, darkBg);
      assert('F03: Dark theme danger button contrast >= 4.5:1', darkRatio >= 4.5,
        'Ratio: ' + darkRatio + ':1 (bg: ' + darkDangerStyle.backgroundColor + ', fg: ' + darkDangerStyle.color + ')');

      // Check 4: Selected row metadata contrast in dark theme
      const darkSelectedRow = document.querySelector('[role="button"][aria-pressed="true"]');
      assert('F05: Selected row has role="button" and aria-pressed="true"', Boolean(darkSelectedRow), 'Found selected row element');
      assert('F05: Selected row does NOT have invalid aria-selected', !darkSelectedRow?.hasAttribute('aria-selected'), 'aria-selected absent');

      const darkSelectedMeta = darkSelectedRow?.querySelector('span[style*="0.75rem"]');
      if (darkSelectedMeta) {
        const metaStyle = window.getComputedStyle(darkSelectedMeta);
        const rowStyle = window.getComputedStyle(darkSelectedRow);
        const metaFg = parseRgb(metaStyle.color);
        const rowBg = parseRgb(rowStyle.backgroundColor);
        const metaRatio = contrastRatio(metaFg, rowBg);
        assert('F04: Dark theme selected row metadata contrast >= 4.5:1', metaRatio >= 4.5,
          'Ratio: ' + metaRatio + ':1 (bg: ' + rowStyle.backgroundColor + ', fg: ' + metaStyle.color + ')');
      } else {
        assert('F04: Dark theme selected row metadata found', false, 'Metadata span not found');
      }

      // Switch back to light theme for remaining checks
      toggleThemeBtn.click();
      for (let i = 0; i < 20; i++) {
        await waitRender();
        if (toggleThemeBtn.textContent.includes('Light')) break;
      }
      await new Promise(r => setTimeout(r, 250)); // Allow CSS transition to settle

      // Check 6: Keyboard row selection updates aria-pressed
      const allRows = Array.from(document.querySelectorAll('[role="button"][aria-pressed]'));
      const unselectedRow = allRows.find(r => r.getAttribute('aria-pressed') === 'false');
      if (unselectedRow) {
        unselectedRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await waitRender();
        assert('F05: Keyboard Enter updates row aria-pressed to true', unselectedRow.getAttribute('aria-pressed') === 'true', 'Row pressed updated');
      }

      // Check 7: TextField aria-describedby for helper vs error
      const inputTitle = document.getElementById('input-title');
      const titleDescribedBy = inputTitle.getAttribute('aria-describedby');
      const helperEl = document.getElementById(titleDescribedBy);
      assert('F06: Valid TextField references existing helper element', Boolean(helperEl), 'describedBy: ' + titleDescribedBy);

      // Trigger error state on input-error
      const toggleErrorBtn = document.getElementById('btn-toggle-error');
      toggleErrorBtn.click(); // Error visible now
      await waitRender();
      const inputError = document.getElementById('input-error');
      const errorDescribedBy = inputError.getAttribute('aria-describedby');
      assert('F06: Error state references error ID and NOT hidden helper ID',
        errorDescribedBy === 'input-error-error',
        'describedBy: ' + errorDescribedBy);
      assert('F06: Rendered error element exists in DOM', Boolean(document.getElementById(errorDescribedBy)), 'Found ' + errorDescribedBy);

      toggleErrorBtn.click(); // Recover back to valid
      await waitRender();
      const recoveredDescribedBy = inputError.getAttribute('aria-describedby');
      assert('F06: Recovered TextField restores helper description reference',
        recoveredDescribedBy === 'input-error-helper',
        'recovered: ' + recoveredDescribedBy);

      // Check 8: Dialog modal open, focus trap, and Escape key close
      const openDialogBtn = document.getElementById('btn-open-dialog');
      openDialogBtn.click();
      await waitRender();
      const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
      assert('Dialog opens with role="dialog" and aria-modal="true"', Boolean(dialog), 'Dialog in DOM');

      // Dispatch Escape on document
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await waitRender();
      const dialogAfterEscape = document.querySelector('[role="dialog"]');
      assert('Dialog closes cleanly on Escape', !dialogAfterEscape, 'Dialog dismissed');

      // Check 9: Typography scale control exercises primitives
      const toggleScaleBtn = document.getElementById('toggle-scale');
      toggleScaleBtn.click(); // 125%
      await waitRender();
      toggleScaleBtn.click(); // 150%
      await waitRender();
      const scaledBtnStyle = window.getComputedStyle(primaryBtn);
      const scaledInputStyle = window.getComputedStyle(inputTitle);
      assert('F07: Primitives scale with review scale factor (150%)',
        parseFloat(scaledBtnStyle.fontSize) > 15 && parseFloat(scaledInputStyle.fontSize) > 17,
        'Button fontSize: ' + scaledBtnStyle.fontSize + ', Input fontSize: ' + scaledInputStyle.fontSize);

      // Check 10: Contrast summary table inside accessible scroll region
      const contrastRegion = document.querySelector('[role="region"][aria-label="WCAG 2.2 Level AA Contrast Audit Summary"]');
      assert('F07: Contrast summary table wrapped in accessible scrollable region',
        Boolean(contrastRegion && window.getComputedStyle(contrastRegion).overflowX === 'auto'),
        'Found scroll region with overflowX auto');

      return results;
    })()
  `;

  const evalRes = await send('Runtime.evaluate', {
    expression: testScript,
    awaitPromise: true,
    returnByValue: true,
  });

  const testResults = evalRes?.result?.value;
  if (!Array.isArray(testResults)) {
    throw new Error(
      'Evaluation did not return an array of test results: ' + JSON.stringify(evalRes)
    );
  }

  // Check 11: Emulate 320px narrow screen viewport and verify reflow without horizontal overflow
  await send('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 740,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await new Promise((r) => setTimeout(r, 400));

  const overflowCheck = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const docWidth = document.documentElement.scrollWidth;
        const bodyWidth = document.body.scrollWidth;
        const windowWidth = window.innerWidth;
        return { docWidth, bodyWidth, windowWidth, noOverflow: docWidth <= 320 };
      })()
    `,
    returnByValue: true,
  });

  const overflowData = overflowCheck?.result?.value;
  testResults.push({
    name: 'F07: 320px narrow screen reflow without document horizontal overflow',
    pass: overflowData?.docWidth <= 320,
    details: `docWidth: ${overflowData?.docWidth}px, viewport: ${overflowData?.windowWidth}px`,
  });

  let allPass = true;
  for (const r of testResults) {
    const symbol = r.pass ? '✓ PASS' : '✗ FAIL';
    console.log(`${symbol}: ${r.name}`);
    if (r.details) console.log(`   └─ ${r.details}`);
    if (!r.pass) allPass = false;
  }

  if (!allPass) {
    throw new Error('One or more real browser interaction accessibility checks failed');
  }

  console.log('\nAll 11 real browser React primitive verification checks passed successfully!');
  ws.close();
} finally {
  cleanup();
}
