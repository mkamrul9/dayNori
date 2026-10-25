/* Phase 67 Daynori prototype — simulated state only. Not production. */
(function () {
  'use strict';

  const ICONS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    clipboard:
      '<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>',
    library:
      '<path d="M4 19.5V5a2 2 0 0 1 2-2h12"/><path d="M8 22V8"/><path d="M12 22V8"/><path d="M16 22V8"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    /* Gear silhouette — not the Today sun glyph (shared semantic family with design-tokens). */
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    sliders: '<path d="M4 7h4m4 0h8M4 17h8m4 0h4M8 4v6m4-6v6m0 4v6m4-6v6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4"/><path d="M12 17h.01"/>',
    spark:
      '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
    pin: '<path d="M12 17v5"/><path d="M9 3h6l1 7H8L9 3z"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/>',
    note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  };

  function icon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.help}</svg>`;
  }

  const state = {
    direction: localStorage.getItem('dn67-direction') || 'warm',
    theme: localStorage.getItem('dn67-theme') || 'light',
    route: 'welcome',
    authError: '',
    authEmail: 'demo@daynori.test',
    syncStatus: 'synced',
    journalHidden: false,
    pinned: ['expenses'],
    hidden: [],
    draftNote: '',
    draftNoteTitle: 'Project ideas',
    draftJournal: '',
    draftJournalTitle: '',
    draftTaskTitle: 'Finish reading plan',
    tourStep: 0,
    tourPaused: false,
    assistantConsent: false,
    assistantProposal: null,
    planView: 'tasks',
    libraryFilter: 'all',
    saveFailed: false,
    offline: false,
    emptyAccount: false,
    keyboardSim: false,
    focusReturnSelector: null,
    featureQuery: '',
    helpQuery: '',
    searchQuery: '',
    promptDismissed: false,
  };

  const PRIMARY = [
    { id: 'today', label: 'Today', icon: 'sun' },
    { id: 'plan', label: 'Plan', icon: 'clipboard' },
    { id: 'library', label: 'Library', icon: 'library' },
    { id: 'journal', label: 'Journal', icon: 'book' },
  ];

  const FEATURES = [
    { id: 'today', label: 'Today', hideable: false },
    { id: 'plan', label: 'Plan', hideable: false },
    { id: 'library', label: 'Library', hideable: false },
    { id: 'journal', label: 'Journal', hideable: true },
    { id: 'expenses', label: 'Expenses', hideable: true, pinnable: true },
    { id: 'custom-sections', label: 'Custom sections', hideable: true, pinnable: true },
    { id: 'notes', label: 'Notes', hideable: true, pinnable: true },
    { id: 'settings', label: 'Settings', hideable: false, protected: true },
    { id: 'help', label: 'Help', hideable: false, protected: true },
    { id: 'search', label: 'Search', hideable: false, protected: true },
    { id: 'all-features', label: 'All features', hideable: false, protected: true },
    { id: 'vault', label: 'Vault', status: 'not-released' },
    { id: 'rooms', label: 'Rooms', status: 'not-released' },
  ];

  const SEARCH_FIXTURES = [
    { title: 'Finish reading plan', type: 'Task', module: 'plan' },
    { title: 'Project ideas', type: 'Note', module: 'library' },
    { title: 'Morning stretch', type: 'Routine', module: 'plan' },
    { title: 'TypeScript reference', type: 'Knowledge', module: 'library' },
  ];

  const HELP_ARTICLES = [
    {
      id: 'find',
      title: 'Find all features',
      body: 'Open All features from the shell, search by name, then open a destination.',
      keywords: 'all features search find open',
    },
    {
      id: 'hide',
      title: 'Hide or pin modules',
      body: 'Hide removes shortcuts only. Content and reminders stay. Restore from All features.',
      keywords: 'hide pin journal restore tabs',
    },
    {
      id: 'tour',
      title: 'Action-based learning (prototype)',
      body: 'Tour steps pause, resume, skip, and exit without inventing delivery.',
      keywords: 'tour learn pause resume help',
    },
    {
      id: 'feedback',
      title: 'Contact / feedback (concept)',
      body: 'Synthetic only — no inbox is monitored from this prototype.',
      keywords: 'feedback contact suggestion',
    },
  ];

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function persistDraftFields() {
    const noteTitle = document.getElementById('note-title');
    const noteBody = document.getElementById('note-body');
    const jTitle = document.getElementById('j-title');
    const jBody = document.getElementById('j-body');
    const taskTitle = document.getElementById('task-title');
    const email = document.getElementById('email');
    const prop = document.getElementById('prop-title');
    if (noteTitle) state.draftNoteTitle = noteTitle.value;
    if (noteBody) state.draftNote = noteBody.value;
    if (jTitle) state.draftJournalTitle = jTitle.value;
    if (jBody) state.draftJournal = jBody.value;
    if (taskTitle) state.draftTaskTitle = taskTitle.value;
    if (email) state.authEmail = email.value;
    if (prop && state.assistantProposal !== null) state.assistantProposal = prop.value;
  }

  function applyChrome() {
    document.documentElement.dataset.direction = state.direction;
    document.documentElement.dataset.theme = state.theme;
    localStorage.setItem('dn67-direction', state.direction);
    localStorage.setItem('dn67-theme', state.theme);
    const dw = document.getElementById('dir-warm');
    const dc = document.getElementById('dir-crisp');
    const tl = document.getElementById('theme-light');
    const td = document.getElementById('theme-dark');
    if (dw) dw.setAttribute('aria-pressed', String(state.direction === 'warm'));
    if (dc) dc.setAttribute('aria-pressed', String(state.direction === 'crisp'));
    if (tl) tl.setAttribute('aria-pressed', String(state.theme === 'light'));
    if (td) td.setAttribute('aria-pressed', String(state.theme === 'dark'));
  }

  function setChrome(direction, theme) {
    if (direction === 'warm' || direction === 'crisp') state.direction = direction;
    if (theme === 'light' || theme === 'dark') state.theme = theme;
    applyChrome();
    render({ skipAnnounce: true });
  }

  function primaryTabs() {
    return PRIMARY.filter((t) => !(t.id === 'journal' && state.journalHidden));
  }

  function openFeature(id) {
    if (id === 'journal' && state.journalHidden) {
      announce('Journal is hidden. Restore it from All features.');
      go('features');
      return;
    }
    if (['today', 'plan', 'library', 'journal', 'settings', 'help', 'search'].includes(id)) {
      go(id);
      return;
    }
    if (id === 'all-features') {
      go('features');
      return;
    }
    if (id === 'notes') {
      go('library');
      announce('Notes open inside Library (illustrative).');
      return;
    }
    if (id === 'expenses' || id === 'custom-sections') {
      go('today');
      announce(id + ' destination is illustrative here — open from All features in production.');
      return;
    }
    go('features');
  }

  function closeCreate() {
    const returnSel = state.focusReturnSelector;
    const prior = state._routeBeforeCreate || 'today';
    state.route = prior === 'create' ? 'today' : prior;
    state._routeBeforeCreate = null;
    render({ skipAnnounce: true });
    announce('Create closed');
    if (returnSel) {
      const el = document.querySelector(returnSel);
      if (el && typeof el.focus === 'function') el.focus();
    }
    state.focusReturnSelector = null;
  }

  function go(route, opts) {
    persistDraftFields();
    opts = opts || {};

    if (
      (route === 'journal' || route === 'journal-write') &&
      state.journalHidden
    ) {
      announce('Journal is hidden. Three primary tabs remain. Restore from All features.');
      route = 'features';
    }

    if (route === 'create') {
      state._routeBeforeCreate = state.route === 'create' ? state._routeBeforeCreate || 'today' : state.route;
      state.focusReturnSelector = opts.focusReturn || '[data-create-trigger]';
    }

    state.route = route;
    if (opts.focusReturn) state.focusReturnSelector = opts.focusReturn;
    render({ skipAnnounce: opts.skipAnnounce });
    if (!opts.skipAnnounce) announce('Navigated to ' + route);

    if (route === 'create') {
      const sheet = document.querySelector('.sheet');
      const first = sheet && sheet.querySelector('button, [href], input, textarea, select');
      if (first) first.focus();
    } else {
      const main = document.getElementById('main-content');
      if (main) main.focus({ preventScroll: true });
    }
  }

  function announce(msg) {
    const live = document.getElementById('live');
    if (live) {
      live.textContent = '';
      setTimeout(() => {
        live.textContent = msg;
      }, 20);
    }
  }

  function shell(title, bodyHtml, options) {
    options = options || {};
    const tabs = primaryTabs();
    const showShell = !['welcome', 'signin', 'signup', 'recovery'].includes(state.route);

    if (!showShell) {
      return `<div class="content" id="main-content" tabindex="-1">${bodyHtml}</div>`;
    }

    const side = tabs
      .map(
        (t) =>
          `<button type="button" class="nav-item ${state.route === t.id || (t.id === 'journal' && state.route === 'journal-write') ? 'active' : ''}" data-go="${t.id}" aria-current="${state.route === t.id ? 'page' : 'false'}">${icon(t.icon)} ${t.label}</button>`
      )
      .join('');

    const pins = state.pinned
      .filter((id) => !state.hidden.includes(id))
      .map((id) => {
        const f = FEATURES.find((x) => x.id === id);
        return f
          ? `<button type="button" class="nav-item" data-open-feature="${f.id}">${icon('pin')} ${f.label}</button>`
          : '';
      })
      .join('');

    const bottom = tabs
      .map(
        (t) =>
          `<button type="button" class="tab" data-go="${t.id}" aria-current="${state.route === t.id ? 'page' : 'false'}">${icon(t.icon)}<span>${t.label}</span></button>`
      )
      .join('');

    const syncBadge =
      state.syncStatus === 'device'
        ? '<span class="badge warn">Saved on this device</span>'
        : state.syncStatus === 'waiting'
          ? '<span class="badge info">Waiting to sync</span>'
          : '<span class="badge ok">Synchronized</span>';

    return `
      <div class="layout">
        <aside class="sidebar desktop-only" aria-label="Primary">
          <div class="brand"><span class="brand-mark" aria-hidden="true">D</span> Daynori</div>
          ${side}
          <div class="nav-section">Pinned</div>
          ${pins || '<p class="muted" style="padding:0 12px">No pins yet</p>'}
          <div class="nav-section">Utilities</div>
          <button type="button" class="nav-item" data-go="features">${icon('sliders')} All features</button>
          <button type="button" class="nav-item" data-go="help">${icon('help')} Help</button>
          <button type="button" class="nav-item" data-go="settings">${icon('settings')} Settings</button>
        </aside>
        <div class="main">
          <div class="topbar">
            <h1>${title}</h1>
            <button type="button" class="icon-btn" data-go="search" aria-label="Search">${icon('search')}</button>
            <button type="button" class="icon-btn" data-go="create" data-create-trigger aria-label="Create">${icon('plus')}</button>
            <button type="button" class="icon-btn mobile-only" data-go="features" aria-label="All features">${icon('sliders')}</button>
            <button type="button" class="icon-btn" data-go="settings" aria-label="Settings">${icon('settings')}</button>
          </div>
          <div class="content" id="main-content" tabindex="-1">
            <div class="status-line" aria-live="polite">${syncBadge}${state.offline ? '<span class="badge warn">Offline (simulated)</span>' : ''}${options.extraStatus || ''}</div>
            ${bodyHtml}
          </div>
          <nav class="bottom-nav mobile-only" aria-label="Main">
            <div class="tabs">${bottom}</div>
          </nav>
        </div>
      </div>`;
  }

  function viewWelcome() {
    return shell(
      'Welcome',
      `
      <div class="card editor-full">
        <div class="brand" style="padding:0 0 12px"><span class="brand-mark" aria-hidden="true">D</span> Daynori</div>
        <p class="muted">A personal notebook with clear organizing tools. This screen is a <strong>prototype</strong> — forms do not create real accounts.</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px">
          <button type="button" class="btn" data-go="signup">Create account</button>
          <button type="button" class="btn secondary" data-go="signin">Sign in</button>
        </div>
        <p class="muted" style="margin-top:16px">First useful action: Create account or Sign in. No unrelated permission prompts.</p>
      </div>`
    );
  }

  function viewAuth(mode) {
    const title = mode === 'signup' ? 'Create account' : mode === 'recovery' ? 'Recover access' : 'Sign in';
    return shell(
      title,
      `
      <div class="card editor-full">
        <form id="auth-form" novalidate>
          <div class="field ${state.authError ? 'invalid' : ''}">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" autocomplete="username" required value="${escapeHtml(state.authEmail)}" />
          </div>
          ${
            mode !== 'recovery'
              ? `<div class="field ${state.authError ? 'invalid' : ''}">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" required />
            <span class="muted">Password managers and paste are supported (not disabled).</span>
          </div>`
              : ''
          }
          ${state.authError ? `<p class="field error" role="alert">${state.authError}</p>` : ''}
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <button type="submit" class="btn">${mode === 'recovery' ? 'Send recovery link (simulated)' : title}</button>
            <button type="button" class="btn ghost" data-go="welcome">Back</button>
            ${mode === 'signin' ? '<button type="button" class="btn ghost" data-go="recovery">Forgot password</button>' : ''}
          </div>
        </form>
        <div class="grid-2" style="margin-top:16px">
          <button type="button" class="btn secondary" data-demo="auth-loading">Show loading</button>
          <button type="button" class="btn secondary" data-demo="auth-unavailable">Service unavailable</button>
          <button type="button" class="btn secondary" data-demo="auth-invalid">Validation error</button>
        </div>
        <div id="auth-status" class="muted" style="margin-top:12px" aria-live="polite"></div>
      </div>`
    );
  }

  function viewToday() {
    if (state.emptyAccount) {
      return shell(
        'Today',
        `<div class="card empty">
          <h2>Nothing planned yet</h2>
          <p>Capture a thought or add a task for today.</p>
          <button type="button" class="btn" data-go="create" data-create-trigger>Create</button>
        </div>`
      );
    }
    return shell(
      'Today',
      `
      <div class="card">
        <p class="muted">Sunday, 25 Oct 2026 · Asia/Dhaka</p>
        <h2 style="margin:4px 0 12px;font-size:22px">Next: Finish reading plan</h2>
        <button type="button" class="btn" data-go="create" data-create-trigger>${icon('plus')} Create</button>
      </div>
      <div class="card">
        <h3 style="margin-top:0">Today’s tasks</h3>
        <div class="list-row"><input type="checkbox" aria-label="Finish reading plan"/><div class="body"><strong>Finish reading plan</strong><div class="muted">High · due today</div></div></div>
        <div class="list-row"><input type="checkbox" aria-label="Email landlord"/><div class="body"><strong>Email landlord</strong><div class="muted bn-sample">বাড়িওয়ালাকে ইমেইল</div></div></div>
      </div>
      <div class="card">
        <h3 style="margin-top:0">Today’s routines</h3>
        <div class="list-row"><input type="checkbox" aria-label="Morning stretch"/><div class="body"><strong>Morning stretch</strong><div class="muted">Occurrence for today only</div></div></div>
      </div>
      <details class="card">
        <summary>History and secondary (collapsed)</summary>
        <p class="muted">Completed yesterday · 3 items. Overdue group collapsed by default.</p>
      </details>
      ${
        state.journalHidden || state.promptDismissed
          ? ''
          : `<div class="card"><p class="muted">Optional journal prompt</p><p>What felt quiet today?</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn" data-go="journal-write">Write</button>
          <button type="button" class="btn secondary" data-demo="dismiss-prompt">Dismiss prompt</button>
        </div></div>`
      }
      <p class="muted">Path demonstration: shell → All features → Expenses is two navigation actions.</p>
    `
    );
  }

  function viewPlan() {
    const seg = ['tasks', 'routines', 'calendar']
      .map(
        (v) =>
          `<button type="button" role="tab" aria-selected="${state.planView === v}" data-plan="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`
      )
      .join('');
    let body = '';
    if (state.planView === 'tasks') {
      body = `<div class="list-row"><div class="body"><strong>Finish reading plan</strong><div class="muted">Date-only deadline · Today</div></div><button type="button" class="btn secondary" data-go="task-editor">Open</button></div>`;
    } else if (state.planView === 'routines') {
      body = `<div class="list-row"><div class="body"><strong>Morning stretch</strong><div class="muted">Weekdays · timezone Asia/Dhaka</div></div><button type="button" class="btn secondary" data-demo="complete-occurrence">Complete today</button></div>`;
    } else {
      body = `<p class="muted">Narrow default: agenda. Month grid reachable below.</p>
        <div class="list-row"><div class="body"><strong>09:00 · Standup notes</strong><div class="muted">Projected from task — opens canonical task</div></div><button type="button" class="btn secondary" data-go="task-editor">Open source</button></div>
        <button type="button" class="btn ghost" data-demo="month">Show month option</button>`;
    }
    return shell(
      'Plan',
      `<div class="seg" role="tablist" aria-label="Plan views">${seg}</div><div class="card" style="margin-top:12px">${body}</div>`
    );
  }

  function viewTaskEditor() {
    return shell(
      'Task',
      `
      <div class="card editor-full">
        <div class="field"><label for="task-title">Title</label><input id="task-title" value="${escapeHtml(state.draftTaskTitle)}" /></div>
        <details>
          <summary>Details (progressive disclosure)</summary>
          <div class="field"><label for="task-due">Deadline</label>
            <select id="task-due"><option>Date only — 25 Oct 2026</option><option>Timed — 25 Oct 2026, 17:00</option></select>
          </div>
          <div class="field"><label for="task-pri">Priority</label><select id="task-pri"><option>None</option><option selected>High</option></select></div>
          <div class="field"><label for="task-folder">Folder</label><select id="task-folder"><option>Inbox</option><option>Software</option></select></div>
        </details>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button type="button" class="btn" data-demo="save-task">Save</button>
          <button type="button" class="btn secondary" data-demo="save-fail">Simulate save failure</button>
          <button type="button" class="btn ghost" data-go="plan">Back</button>
        </div>
        ${state.saveFailed ? '<p class="field error" role="alert">Could not save. Your title is preserved. <button type="button" class="btn secondary" data-demo="save-task">Retry</button></p>' : ''}
        ${state.keyboardSim ? '<div class="kbd-sim" aria-label="Simulated on-screen keyboard"><p class="muted">Keyboard-open editor (simulated reduced viewport). Focused field and Save remain visible — not physical Android keyboard evidence.</p><input aria-label="Focused field" value="' + escapeHtml(state.draftTaskTitle) + '" /><div class="keys">Simulated keyboard area</div></div>' : '<button type="button" class="btn ghost" data-demo="keyboard">Simulate keyboard-open</button>'}
      </div>`
    );
  }

  function viewLibrary() {
    return shell(
      'Library',
      `
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <button type="button" class="btn" data-go="note-editor">${icon('note')} Write note</button>
        <button type="button" class="btn secondary" data-go="search">${icon('search')} Search</button>
      </div>
      <div class="seg" role="tablist" aria-label="Type filter">
        ${['all', 'notes', 'knowledge', 'files']
          .map(
            (f) =>
              `<button type="button" role="tab" aria-selected="${state.libraryFilter === f}" data-lib="${f}">${f}</button>`
          )
          .join('')}
      </div>
      <div class="card" style="margin-top:12px">
        <p class="muted">Workspace › Software › Guides</p>
        <div class="list-row"><div class="body"><strong>TypeScript reference</strong><div class="muted">Knowledge</div></div></div>
        <div class="list-row"><div class="body"><strong>handbook.pdf</strong><div class="muted">File · preview concept (no real upload)</div></div></div>
        <div class="list-row"><div class="body"><strong>Read generics chapter</strong><div class="muted">Task in same folder</div></div></div>
        <p class="muted bn-sample">দীর্ঘ শিরোনাম উদাহরণ: সফটওয়্যার প্রজেক্টের জন্য TypeScript নোটস এবং গাইড</p>
      </div>
      <div class="card">
        <h3 style="margin-top:0">Move demonstration</h3>
        <p>Item moved to <strong>Software › Projects</strong>. Breadcrumb updates; filter does not move content.</p>
        <button type="button" class="btn secondary" data-demo="clear-filter">Clear filters</button>
      </div>
      <div class="card">
        <h3 style="margin-top:0">Upload concepts (simulated)</h3>
        <p class="muted">Progress · cancel/retry · unsupported type error · quota notice. No bytes leave this page.</p>
        <button type="button" class="btn secondary" data-demo="upload-error">Show upload error</button>
        <div id="upload-msg" aria-live="polite"></div>
      </div>`
    );
  }

  function viewNoteEditor() {
    const body =
      state.draftNote ||
      'Capture a thought.\n\nবাংলা নমুনা: আজকের কাজগুলো ছোট ছোট ধাপে ভাগ করি।';
    return shell(
      'Note',
      `
      <div class="card editor-full">
        <div class="field"><label for="note-title">Title</label><input id="note-title" value="${escapeHtml(state.draftNoteTitle)}" /></div>
        <div class="field"><label for="note-body">Body</label>
          <textarea id="note-body" class="bn-sample">${escapeHtml(body)}</textarea>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn" data-demo="save-note">Save</button>
          <button type="button" class="btn secondary" data-demo="save-note-fail">Simulate save failure</button>
          <button type="button" class="btn ghost" data-go="library">Back to Library</button>
        </div>
        <p class="muted">Closing does not discard the draft. Retry never duplicates the note. Reopen restores title and body from synthetic state.</p>
      </div>`
    );
  }

  function viewJournal() {
    return shell(
      'Journal',
      `
      <div class="card">
        <button type="button" class="btn" data-go="journal-write">Write</button>
        <p class="muted">Quiet timeline. No mandatory mood, streak, or title.</p>
      </div>
      <div class="card">
        <div class="list-row"><div class="body"><strong>25 Oct 2026</strong><div class="muted">Private preview hidden · “Untitled entry”</div></div><button type="button" class="btn secondary" data-go="journal-write">Reopen</button></div>
        <div class="list-row"><div class="body"><strong>24 Oct 2026 · Evening</strong><div class="muted">Second entry same date (backdated morning entry also possible)</div></div></div>
      </div>`
    );
  }

  function viewJournalWrite() {
    const body = state.draftJournal || 'The writing surface is the focus.\n\nPrompts are dismissible.';
    return shell(
      'Write',
      `
      <div class="card editor-full">
        <div class="field"><label for="j-date">Date (optional)</label><input id="j-date" type="date" value="2026-10-25" /></div>
        <div class="field"><label for="j-title">Title (optional)</label><input id="j-title" placeholder="Untitled" value="${escapeHtml(state.draftJournalTitle)}" /></div>
        <div class="field"><label for="j-body">Entry</label>
          <textarea id="j-body">${escapeHtml(body)}</textarea>
        </div>
        ${
          state.promptDismissed
            ? ''
            : `<div class="card" style="background:var(--amber-subtle)">
          <p style="margin:0 0 8px">Optional prompt: What felt quiet today?</p>
          <button type="button" class="btn secondary" data-demo="dismiss-prompt">Dismiss</button>
        </div>`
        }
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button type="button" class="btn" data-demo="save-journal">Save entry</button>
          <button type="button" class="btn secondary" data-demo="save-journal-fail">Simulate save failure</button>
          <button type="button" class="btn ghost" data-go="journal">Timeline</button>
        </div>
        <p class="muted">Recoverable draft stays if save fails. Long entries grow the textarea.</p>
        ${state.saveFailed ? '<p class="field error" role="alert">Could not save journal entry. Draft kept. <button type="button" class="btn secondary" data-demo="save-journal">Retry</button></p>' : ''}
      </div>`
    );
  }

  function viewFeatures() {
    const q = state.featureQuery || '';
    const rows = FEATURES.filter((f) => {
      if (q && !f.label.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    })
      .map((f) => {
        const hidden = state.hidden.includes(f.id) || (f.id === 'journal' && state.journalHidden);
        const pinned = state.pinned.includes(f.id);
        let status = '';
        if (f.status === 'not-released') status = '<span class="badge">Not released yet</span>';
        else if (hidden) status = '<span class="badge warn">Hidden by you — content kept</span>';
        else if (f.protected) status = '<span class="badge ok">Always reachable</span>';
        return `<div class="list-row">
          <div class="body"><strong>${f.label}</strong><div>${status}</div>
          <p class="muted">Path: shell → All features → ${f.label}</p></div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${f.status === 'not-released' ? '' : `<button type="button" class="btn secondary" data-open-feature="${f.id}">Open</button>`}
            ${f.hideable && !hidden ? `<button type="button" class="btn ghost" data-hide="${f.id}">Hide</button>` : ''}
            ${hidden && f.hideable ? `<button type="button" class="btn ghost" data-restore="${f.id}">Restore</button>` : ''}
            ${f.pinnable && !pinned ? `<button type="button" class="btn ghost" data-pin="${f.id}">Pin</button>` : ''}
            ${pinned ? `<button type="button" class="btn ghost" data-unpin="${f.id}">Unpin</button>` : ''}
          </div>
        </div>`;
      })
      .join('');

    return shell(
      'All features',
      `
      <p class="muted">Two-action reachability from shell. Developer tools are not listed for ordinary users.</p>
      <div class="field"><label for="feat-q">Search features</label><input id="feat-q" value="${escapeHtml(q)}" placeholder="Search by name…" /></div>
      <div class="card">${rows || '<p class="empty" role="status">No features match that search.</p>'}</div>
      <p class="muted">Hidden Journal leaves three primary tabs (Today, Plan, Library). Settings/Help/Search/All features stay reachable.</p>`
    );
  }

  function viewSettings() {
    return shell(
      'Settings',
      `
      <div class="card"><h3 style="margin-top:0">Account</h3><p class="muted">Signed in as demo@daynori.test (synthetic)</p></div>
      <div class="card"><h3 style="margin-top:0">Appearance and accessibility</h3>
        <p>Direction and theme use the review bar. Text size and reduced motion belong here in production.</p>
      </div>
      <div class="card"><h3 style="margin-top:0">Notifications</h3><p class="muted">Permission denied state is honest; reminders can remain scheduled.</p></div>
      <div class="card"><h3 style="margin-top:0">Workspace and visible features</h3>
        <button type="button" class="btn secondary" data-go="features">Manage in All features</button>
      </div>
      <div class="card"><h3 style="margin-top:0">Privacy and data</h3>
        <p>Recovery export and portability remain available. Journal preview hidden by default.</p>
        <button type="button" class="btn secondary" data-demo="export-concept">Export recovery data (concept)</button>
      </div>
      <div class="card"><h3 style="margin-top:0">Help and feedback</h3>
        <button type="button" class="btn secondary" data-go="help">Open Help</button>
      </div>
      <div class="card">
        <h3 style="margin-top:0">Not in ordinary Settings</h3>
        <p class="muted">Component galleries, vault harnesses, synthetic AI/Drive/rooms/billing panels, token inspectors — operator area only (Phase 66). This prototype does not expose them.</p>
      </div>`
    );
  }

  function viewHelp() {
    const steps = [
      'Find Create in the header',
      'Choose Note',
      'Enter a title',
      'Save — status explains device vs sync',
    ];
    const q = (state.helpQuery || '').toLowerCase();
    const articles = HELP_ARTICLES.filter(
      (a) => !q || a.title.toLowerCase().includes(q) || a.keywords.includes(q) || a.body.toLowerCase().includes(q)
    );

    let articlesHtml = articles
      .map((a) => {
        if (a.id === 'tour') {
          return `<div class="card" data-help-article="${a.id}">
        <h3 style="margin-top:0">${a.title}</h3>
        <p>Step ${state.tourStep + 1} of ${steps.length}: <strong>${steps[state.tourStep]}</strong>${state.tourPaused ? ' (paused)' : ''}</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button type="button" class="btn" data-tour="next"${state.tourPaused ? ' disabled' : ''}>Continue</button>
          <button type="button" class="btn secondary" data-tour="back">Back</button>
          <button type="button" class="btn ghost" data-tour="skip">Skip</button>
          <button type="button" class="btn ghost" data-tour="pause">${state.tourPaused ? 'Resume' : 'Pause'}</button>
          <button type="button" class="btn ghost" data-tour="exit">Exit</button>
        </div>
        <p class="muted">If a target control is missing, learning recovers with an explanation — no invented delivery.</p>
      </div>`;
        }
        if (a.id === 'feedback') {
          return `<div class="card" data-help-article="${a.id}">
        <h3 style="margin-top:0">${a.title}</h3>
        <div class="field"><label for="fb">Suggestion</label><textarea id="fb" placeholder="Synthetic only — no inbox is monitored from this prototype"></textarea></div>
        <button type="button" class="btn secondary" data-demo="feedback">Review before send (simulated)</button>
        <p class="muted">${a.body}</p>
      </div>`;
        }
        return `<div class="card" data-help-article="${a.id}">
        <h3 style="margin-top:0">${a.title}</h3>
        <p>${a.body}</p>
      </div>`;
      })
      .join('');

    if (!articlesHtml) {
      articlesHtml = `<div class="card"><p class="empty" role="status">No how-tos match “${escapeHtml(state.helpQuery)}”.</p></div>`;
    }

    return shell(
      'Help',
      `
      <div class="field"><label for="help-q">Search how-tos</label><input id="help-q" value="${escapeHtml(state.helpQuery)}" placeholder="e.g. hide journal" /></div>
      ${articlesHtml}`
    );
  }

  function viewAssistant() {
    return shell(
      'Assistant',
      `
      <p class="muted">Optional labeled launcher — not mascot production (Phase 96). Responses are synthetic.</p>
      ${
        !state.assistantConsent
          ? `<div class="card">
          <h3 style="margin-top:0">Consent and sources</h3>
          <p>Use only content you select. No live providers are called.</p>
          <label><input type="checkbox" id="src-notes" checked /> Notes</label><br/>
          <label><input type="checkbox" id="src-tasks" checked /> Tasks</label>
          <div style="margin-top:12px"><button type="button" class="btn" data-demo="assistant-consent">Continue</button></div>
        </div>`
          : `<div class="card">
          <p><strong>Synthetic answer:</strong> Your note “Project ideas” mentions splitting work into small steps.</p>
          <p class="muted">Citation example: Note · Project ideas (fixture)</p>
          <button type="button" class="btn" data-demo="assistant-propose">Propose a task</button>
          <button type="button" class="btn secondary" data-demo="assistant-offline">Unavailable / offline</button>
        </div>
        ${
          state.assistantProposal
            ? `<div class="card">
            <h3 style="margin-top:0">Review proposal</h3>
            <div class="field"><label for="prop-title">Task title</label><input id="prop-title" value="${escapeHtml(state.assistantProposal)}" /></div>
            <p class="muted">Edit freely. Nothing is created until you confirm.</p>
            <button type="button" class="btn" data-demo="assistant-confirm">Confirm create (illustrative)</button>
            <button type="button" class="btn ghost" data-demo="assistant-cancel">Cancel</button>
          </div>`
            : ''
        }
        <div class="card">
          <h3 style="margin-top:0">Voice transcript concept</h3>
          <p class="muted">Review transcript, then use typed fallback. No microphone access in this prototype.</p>
          <textarea readonly>Synthetic transcript: add a task to finish the reading plan</textarea>
        </div>`
      }`
    );
  }

  function viewSearch() {
    const q = (state.searchQuery || '').trim().toLowerCase();
    const hits = !q
      ? []
      : SEARCH_FIXTURES.filter(
          (f) => f.title.toLowerCase().includes(q) || f.type.toLowerCase().includes(q)
        );
    let results;
    if (!q) {
      results = '<p class="muted">Type to search authorized workspace fixtures. Hidden-module content excluded by default.</p>';
    } else if (!hits.length) {
      results = `<p class="empty" role="status">No results for “${escapeHtml(state.searchQuery)}”.</p>
        <button type="button" class="btn secondary" data-demo="clear-search">Clear search</button>`;
    } else {
      results = hits
        .map(
          (h) =>
            `<div class="list-row"><div class="body"><strong>${escapeHtml(h.title)}</strong><div class="muted">${h.type}</div></div>
            <button type="button" class="btn secondary" data-open-feature="${h.module}">Open</button></div>`
        )
        .join('');
    }
    return shell(
      'Search',
      `<div class="field"><label for="sq">Search</label><input id="sq" value="${escapeHtml(state.searchQuery)}" placeholder="Authorized workspace content" /></div>
      <div class="card">${results}</div>
      <p class="muted">Include-hidden is a later search-phase control.</p>`
    );
  }

  function viewCreate() {
    return (
      `
      <div class="overlay open" role="presentation" data-overlay-dismiss>
        <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="create-title">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h2 id="create-title">Create</h2>
            <button type="button" class="icon-btn" data-close-create aria-label="Close create">${icon('x')}</button>
          </div>
          <button type="button" class="nav-item" data-go="note-editor">${icon('note')} Note</button>
          <button type="button" class="nav-item" data-go="task-editor">${icon('clipboard')} Task</button>
          <button type="button" class="nav-item" data-go="journal-write">${icon('book')} Journal</button>
          <p class="muted">Press Escape or Close to dismiss. Focus returns to the Create control.</p>
        </div>
      </div>` + shell('Today', '<p class="muted">Create sheet open — Escape dismisses.</p>')
    );
  }

  function viewStates() {
    return shell(
      'State gallery',
      `
      <table class="matrix">
        <thead><tr><th>State</th><th>Example in prototype</th></tr></thead>
        <tbody>
          <tr><td>Empty</td><td><button type="button" class="btn secondary" data-demo="empty">Toggle empty Today</button></td></tr>
          <tr><td>Loading</td><td>Auth “Show loading”</td></tr>
          <tr><td>Invalid input</td><td>Auth validation error</td></tr>
          <tr><td>Save failure + retry</td><td>Task / note / journal editors</td></tr>
          <tr><td>Offline</td><td><button type="button" class="btn secondary" data-demo="offline">Toggle offline</button></td></tr>
          <tr><td>Personally hidden</td><td>All features → Hide Journal</td></tr>
          <tr><td>Not released</td><td>Vault / Rooms badges</td></tr>
          <tr><td>Sync statuses</td><td>
            <button type="button" class="btn ghost" data-sync="device">Device</button>
            <button type="button" class="btn ghost" data-sync="waiting">Waiting</button>
            <button type="button" class="btn ghost" data-sync="synced">Synced</button>
          </td></tr>
        </tbody>
      </table>`
    );
  }

  function render(opts) {
    opts = opts || {};
    applyChrome();
    const root = document.getElementById('app');
    let html = '';
    switch (state.route) {
      case 'welcome':
        html = viewWelcome();
        break;
      case 'signin':
        html = viewAuth('signin');
        break;
      case 'signup':
        html = viewAuth('signup');
        break;
      case 'recovery':
        html = viewAuth('recovery');
        break;
      case 'today':
        html = viewToday();
        break;
      case 'plan':
        html = viewPlan();
        break;
      case 'task-editor':
        html = viewTaskEditor();
        break;
      case 'library':
        html = viewLibrary();
        break;
      case 'note-editor':
        html = viewNoteEditor();
        break;
      case 'journal':
        html = viewJournal();
        break;
      case 'journal-write':
        html = viewJournalWrite();
        break;
      case 'features':
        html = viewFeatures();
        break;
      case 'settings':
        html = viewSettings();
        break;
      case 'help':
        html = viewHelp();
        break;
      case 'assistant':
        html = viewAssistant();
        break;
      case 'search':
        html = viewSearch();
        break;
      case 'create':
        html = viewCreate();
        break;
      case 'states':
        html = viewStates();
        break;
      default:
        html = viewWelcome();
    }
    root.innerHTML = html;
    bind();
  }

  function restoreInputFocus(id, pos) {
    const again = document.getElementById(id);
    if (again) {
      again.focus();
      if (typeof pos === 'number' && again.setSelectionRange) {
        again.setSelectionRange(pos, pos);
      }
    }
  }

  function bind() {
    document.querySelectorAll('[data-go]').forEach((el) => {
      el.addEventListener('click', () => {
        const route = el.getAttribute('data-go');
        if (route === 'create') {
          go('create', { focusReturn: '[data-create-trigger]' });
        } else {
          go(route);
        }
      });
    });
    document.querySelectorAll('[data-close-create]').forEach((el) => {
      el.addEventListener('click', () => closeCreate());
    });
    document.querySelectorAll('[data-overlay-dismiss]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        if (ev.target === el) closeCreate();
      });
    });
    document.querySelectorAll('[data-plan]').forEach((el) => {
      el.addEventListener('click', () => {
        state.planView = el.getAttribute('data-plan');
        render({ skipAnnounce: true });
      });
    });
    document.querySelectorAll('[data-lib]').forEach((el) => {
      el.addEventListener('click', () => {
        state.libraryFilter = el.getAttribute('data-lib');
        render({ skipAnnounce: true });
      });
    });
    document.querySelectorAll('[data-hide]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-hide');
        if (id === 'journal') state.journalHidden = true;
        if (!state.hidden.includes(id)) state.hidden.push(id);
        announce(id + ' hidden. Content and reminders kept. Primary tabs: ' + primaryTabs().length);
        render({ skipAnnounce: true });
      });
    });
    document.querySelectorAll('[data-restore]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-restore');
        if (id === 'journal') state.journalHidden = false;
        state.hidden = state.hidden.filter((x) => x !== id);
        announce(id + ' restored');
        render({ skipAnnounce: true });
      });
    });
    document.querySelectorAll('[data-pin]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-pin');
        if (!state.pinned.includes(id)) state.pinned.push(id);
        announce(id + ' pinned to sidebar');
        render({ skipAnnounce: true });
      });
    });
    document.querySelectorAll('[data-unpin]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-unpin');
        state.pinned = state.pinned.filter((x) => x !== id);
        announce(id + ' unpinned');
        render({ skipAnnounce: true });
      });
    });
    document.querySelectorAll('[data-open-feature]').forEach((el) => {
      el.addEventListener('click', () => openFeature(el.getAttribute('data-open-feature')));
    });
    document.querySelectorAll('[data-sync]').forEach((el) => {
      el.addEventListener('click', () => {
        state.syncStatus = el.getAttribute('data-sync');
        render({ skipAnnounce: true });
      });
    });
    document.querySelectorAll('[data-tour]').forEach((el) => {
      el.addEventListener('click', () => {
        const a = el.getAttribute('data-tour');
        if (a === 'next' && !state.tourPaused) state.tourStep = Math.min(3, state.tourStep + 1);
        if (a === 'back') state.tourStep = Math.max(0, state.tourStep - 1);
        if (a === 'skip') state.tourStep = 3;
        if (a === 'pause') state.tourPaused = !state.tourPaused;
        if (a === 'exit') {
          state.tourStep = 0;
          state.tourPaused = false;
          announce('Tour exited');
        }
        render({ skipAnnounce: true });
      });
    });
    document.querySelectorAll('[data-demo]').forEach((el) => {
      el.addEventListener('click', () => {
        const d = el.getAttribute('data-demo');
        const status = document.getElementById('auth-status');
        if (d === 'auth-loading' && status) status.textContent = 'Signing in… (simulated)';
        if (d === 'auth-unavailable' && status) {
          persistDraftFields();
          status.textContent = 'Service unavailable. Retry keeps your email. (simulated)';
        }
        if (d === 'auth-invalid') {
          persistDraftFields();
          state.authError = 'Enter a valid email and password.';
          render({ skipAnnounce: true });
        }
        if (d === 'save-task') {
          persistDraftFields();
          state.saveFailed = false;
          state.syncStatus = 'waiting';
          announce('Saved on this device. Waiting to sync. Title preserved: ' + state.draftTaskTitle);
          render({ skipAnnounce: true });
        }
        if (d === 'save-fail') {
          persistDraftFields();
          state.saveFailed = true;
          render({ skipAnnounce: true });
        }
        if (d === 'save-note') {
          persistDraftFields();
          state.saveFailed = false;
          state.syncStatus = 'device';
          announce('Note saved on this device');
          render({ skipAnnounce: true });
        }
        if (d === 'save-note-fail') {
          persistDraftFields();
          state.saveFailed = true;
          announce('Note save failed (simulated). Draft kept.');
          render({ skipAnnounce: true });
        }
        if (d === 'save-journal') {
          persistDraftFields();
          state.saveFailed = false;
          state.syncStatus = 'synced';
          announce('Journal entry saved (illustrative)');
          go('journal');
        }
        if (d === 'save-journal-fail') {
          persistDraftFields();
          state.saveFailed = true;
          announce('Journal save failed. Draft kept.');
          render({ skipAnnounce: true });
        }
        if (d === 'keyboard') {
          persistDraftFields();
          state.keyboardSim = true;
          render({ skipAnnounce: true });
        }
        if (d === 'offline') {
          state.offline = !state.offline;
          render({ skipAnnounce: true });
        }
        if (d === 'empty') {
          state.emptyAccount = !state.emptyAccount;
          go('today');
        }
        if (d === 'upload-error') {
          const m = document.getElementById('upload-msg');
          if (m)
            m.innerHTML =
              '<p class="field error" role="alert">Unsupported type. Try PDF or image. Entered filename preserved.</p>';
        }
        if (d === 'assistant-consent') {
          state.assistantConsent = true;
          render({ skipAnnounce: true });
        }
        if (d === 'assistant-propose') {
          state.assistantProposal = 'Finish reading plan';
          render({ skipAnnounce: true });
        }
        if (d === 'assistant-confirm') {
          persistDraftFields();
          announce('Illustrative result only — no task created in the real app. Title was: ' + state.assistantProposal);
          state.assistantProposal = null;
          render({ skipAnnounce: true });
        }
        if (d === 'assistant-cancel') {
          state.assistantProposal = null;
          announce('Proposal cancelled. No object created.');
          render({ skipAnnounce: true });
        }
        if (d === 'assistant-offline')
          announce('Assistant unavailable offline (simulated). Typed fallback remains.');
        if (d === 'feedback') announce('Review screen concept only — no message was sent.');
        if (d === 'export-concept') announce('Export concept only — no files written.');
        if (d === 'complete-occurrence')
          announce('Today’s occurrence completed. Tomorrow stays independent.');
        if (d === 'dismiss-prompt') {
          state.promptDismissed = true;
          announce('Prompt dismissed');
          render({ skipAnnounce: true });
        }
        if (d === 'month')
          announce('Month grid option reachable; agenda remains default on narrow layouts.');
        if (d === 'clear-filter') {
          state.libraryFilter = 'all';
          render({ skipAnnounce: true });
        }
        if (d === 'clear-search') {
          state.searchQuery = '';
          render({ skipAnnounce: true });
        }
      });
    });

    const form = document.getElementById('auth-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        persistDraftFields();
        state.authError = '';
        announce('Signed in (simulated). Continuing to Today.');
        go('today');
      });
    }

    const featQ = document.getElementById('feat-q');
    if (featQ) {
      featQ.addEventListener('input', () => {
        state.featureQuery = featQ.value;
        const pos = featQ.selectionStart;
        render({ skipAnnounce: true });
        restoreInputFocus('feat-q', pos);
      });
    }

    const helpQ = document.getElementById('help-q');
    if (helpQ) {
      helpQ.addEventListener('input', () => {
        state.helpQuery = helpQ.value;
        const pos = helpQ.selectionStart;
        render({ skipAnnounce: true });
        restoreInputFocus('help-q', pos);
      });
    }

    const sq = document.getElementById('sq');
    if (sq) {
      sq.addEventListener('input', () => {
        state.searchQuery = sq.value;
        const pos = sq.selectionStart;
        render({ skipAnnounce: true });
        restoreInputFocus('sq', pos);
      });
    }
  }

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && state.route === 'create') {
      ev.preventDefault();
      closeCreate();
    }
  });

  document.getElementById('dir-warm').addEventListener('click', () => {
    state.direction = 'warm';
    render({ skipAnnounce: true });
  });
  document.getElementById('dir-crisp').addEventListener('click', () => {
    state.direction = 'crisp';
    render({ skipAnnounce: true });
  });
  document.getElementById('theme-light').addEventListener('click', () => {
    state.theme = 'light';
    render({ skipAnnounce: true });
  });
  document.getElementById('theme-dark').addEventListener('click', () => {
    state.theme = 'dark';
    render({ skipAnnounce: true });
  });
  document.getElementById('btn-states').addEventListener('click', () => go('states'));
  document.getElementById('btn-assistant').addEventListener('click', () => go('assistant'));

  window.__dn67 = {
    go,
    setChrome,
    getState: () => ({ ...state }),
    openFeature,
    closeCreate,
  };

  applyChrome();
  render({ skipAnnounce: true });
})();
