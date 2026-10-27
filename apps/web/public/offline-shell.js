/**
 * Public offline organizer shell (ADR 0077).
 * Embeds no user-specific state. Restores account-scoped IndexedDB after
 * trusted-device consent + durable offline_boot context validation.
 * Never treats editable localStorage alone as authorization.
 */
(function () {
  'use strict';

  var DB_NAME = 'daynori_web_storage';
  var CONSENT_KEY = 'daynori_trusted_device_consent';
  var BOOT_KEY = 'primary';

  var loadingEl = document.getElementById('loading');
  var fallbackEl = document.getElementById('fallback');
  var fallbackReason = document.getElementById('fallback-reason');
  var appEl = document.getElementById('app');
  var listEl = document.getElementById('list');
  var connStatus = document.getElementById('conn-status');

  var bootState = {
    userId: null,
    workspaceId: null,
    records: {
      notes: [],
      tasks: [],
      routines: [],
      journal: [],
      pending: [],
      drafts: [],
    },
  };

  function showFallback(reason) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (appEl) appEl.style.display = 'none';
    if (fallbackReason) fallbackReason.textContent = reason;
    if (fallbackEl) fallbackEl.style.display = 'block';
  }

  function showApp() {
    if (loadingEl) loadingEl.style.display = 'none';
    if (fallbackEl) fallbackEl.style.display = 'none';
    if (appEl) appEl.style.display = 'block';
    updateConnStatus();
  }

  function updateConnStatus() {
    if (!connStatus) return;
    connStatus.textContent = navigator.onLine
      ? 'Online · revalidate before sync'
      : 'Offline · local data';
  }

  function hasTrustedConsent() {
    try {
      return localStorage.getItem(CONSENT_KEY) === 'true';
    } catch (_e) {
      return false;
    }
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB unavailable in this browser.'));
        return;
      }
      // Open without forcing an upgrade — shell must not migrate schemas offline.
      var req = indexedDB.open(DB_NAME);
      req.onerror = function () {
        reject(req.error || new Error('Failed to open local storage.'));
      };
      req.onblocked = function () {
        reject(new Error('Local storage open blocked by another tab.'));
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
    });
  }

  function idbGet(db, storeName, key) {
    return new Promise(function (resolve, reject) {
      if (!db.objectStoreNames.contains(storeName)) {
        resolve(undefined);
        return;
      }
      var tx = db.transaction(storeName, 'readonly');
      var req = tx.objectStore(storeName).get(key);
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  function idbGetAll(db, storeName) {
    return new Promise(function (resolve, reject) {
      if (!db.objectStoreNames.contains(storeName)) {
        resolve([]);
        return;
      }
      var tx = db.transaction(storeName, 'readonly');
      var req = tx.objectStore(storeName).getAll();
      req.onsuccess = function () {
        resolve(req.result || []);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  function filterWs(rows, workspaceId) {
    return (rows || []).filter(function (r) {
      return r && r.workspaceId === workspaceId;
    });
  }

  function filterUserPending(rows, workspaceId, userId) {
    return (rows || []).filter(function (r) {
      return r && r.workspaceId === workspaceId && r.userId === userId;
    });
  }

  function titleOf(row) {
    if (!row) return '(untitled)';
    if (typeof row.title === 'string' && row.title.trim()) return row.title;
    if (typeof row.name === 'string' && row.name.trim()) return row.name;
    if (typeof row.body === 'string' && row.body.trim()) {
      return row.body.slice(0, 80) + (row.body.length > 80 ? '…' : '');
    }
    if (typeof row.content === 'string' && row.content.trim()) {
      return row.content.slice(0, 80) + (row.content.length > 80 ? '…' : '');
    }
    return row.id || '(item)';
  }

  function renderList(tab) {
    if (!listEl) return;
    var rows = [];
    var emptyMsg = 'No local records in this section.';

    if (tab === 'notes') {
      rows = bootState.records.notes;
      emptyMsg = 'No notes stored on this device yet.';
    } else if (tab === 'tasks') {
      rows = bootState.records.tasks;
      emptyMsg = 'No tasks stored on this device yet.';
    } else if (tab === 'routines') {
      rows = bootState.records.routines;
      emptyMsg = 'No routines stored on this device yet.';
    } else if (tab === 'journal') {
      rows = bootState.records.journal;
      emptyMsg = 'No journal entries stored on this device yet.';
    } else if (tab === 'queue') {
      rows = bootState.records.pending.concat(
        bootState.records.drafts.map(function (d) {
          return {
            id: d.id,
            title: 'Draft · ' + (d.draftType || 'unsaved'),
            clientTimestamp: d.updatedAt || d.quarantinedAt,
            _kind: 'draft',
          };
        })
      );
      emptyMsg = 'No pending mutations or quarantined drafts on this device.';
    }

    if (!rows.length) {
      listEl.innerHTML = '<div class="empty">' + emptyMsg + '</div>';
      return;
    }

    listEl.innerHTML = rows
      .slice(0, 100)
      .map(function (row) {
        var meta =
          row._kind === 'draft'
            ? 'Local draft'
            : row.operationId
              ? 'Queued · ' + String(row.operationId).slice(0, 12)
              : row.entryDate || row.updatedAt || row.clientTimestamp || '';
        return (
          '<div class="row"><div class="title">' +
          escapeHtml(titleOf(row)) +
          '</div><div class="meta">' +
          escapeHtml(String(meta || '')) +
          '</div></div>'
        );
      })
      .join('');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function bindTabs() {
    var buttons = document.querySelectorAll('nav.tabs button');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) {
          b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
        });
        renderList(btn.getAttribute('data-tab') || 'notes');
      });
    });
  }

  async function boot() {
    if (!hasTrustedConsent()) {
      showFallback(
        'Trusted-device consent is missing or revoked. Local organizer storage is not available.'
      );
      return;
    }

    var db;
    try {
      db = await openDb();
    } catch (err) {
      showFallback(
        (err && err.message) || 'Local storage could not be opened on this device.'
      );
      return;
    }

    try {
      if (!db.objectStoreNames.contains('offline_boot')) {
        showFallback(
          'Offline boot context store is missing. Open Daynori online once after updating, then retry offline.'
        );
        db.close();
        return;
      }

      var boot = await idbGet(db, 'offline_boot', BOOT_KEY);
      if (
        !boot ||
        typeof boot.userId !== 'string' ||
        typeof boot.workspaceId !== 'string' ||
        !boot.userId ||
        !boot.workspaceId
      ) {
        showFallback(
          'No durable offline boot context for a previously authorized account on this device.'
        );
        db.close();
        return;
      }

      var headers = filterWs(await idbGetAll(db, 'item_headers'), boot.workspaceId);
      var notes = filterWs(await idbGetAll(db, 'notes'), boot.workspaceId);
      var tasks = filterWs(await idbGetAll(db, 'tasks'), boot.workspaceId);
      var routines = filterWs(await idbGetAll(db, 'routines'), boot.workspaceId);
      var journal = filterWs(await idbGetAll(db, 'journal_entries'), boot.workspaceId);
      var pending = filterUserPending(
        await idbGetAll(db, 'pending_mutations'),
        boot.workspaceId,
        boot.userId
      );
      var drafts = (await idbGetAll(db, 'drafts')).filter(function (d) {
        return d && d.userId === boot.userId && d.workspaceId === boot.workspaceId;
      });
      var authQ = [];
      if (db.objectStoreNames.contains('auth_quarantine')) {
        authQ = (await idbGetAll(db, 'auth_quarantine')).filter(function (d) {
          return d && d.userId === boot.userId;
        });
      }

      var localCount =
        headers.length +
        notes.length +
        tasks.length +
        routines.length +
        journal.length +
        pending.length +
        drafts.length;

      if (localCount === 0) {
        showFallback(
          'Boot context exists, but no namespaced local records were found for that account/workspace.'
        );
        db.close();
        return;
      }

      bootState.userId = boot.userId;
      bootState.workspaceId = boot.workspaceId;
      bootState.records.notes = notes.length ? notes : headers.filter(function (h) {
        return h.type === 'note' || h.itemType === 'note';
      });
      bootState.records.tasks = tasks.length ? tasks : headers.filter(function (h) {
        return h.type === 'task' || h.itemType === 'task';
      });
      bootState.records.routines = routines;
      bootState.records.journal = journal;
      bootState.records.pending = pending;
      bootState.records.drafts = drafts.concat(authQ);

      db.close();
      showApp();
      bindTabs();
      renderList('notes');
    } catch (err) {
      try {
        db.close();
      } catch (_e) {
        /* ignore */
      }
      showFallback(
        (err && err.message) || 'Local organizer data could not be read (storage may be corrupt).'
      );
    }
  }

  var retryBtn = document.getElementById('retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', function () {
      if (loadingEl) loadingEl.style.display = 'block';
      if (fallbackEl) fallbackEl.style.display = 'none';
      boot();
    });
  }

  var reloadBtn = document.getElementById('reload-online');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', function () {
      if (navigator.onLine) {
        window.location.href = '/';
      } else {
        updateConnStatus();
        alert('Still offline. Reconnect to the network, then try again to revalidate authorization.');
      }
    });
  }

  window.addEventListener('online', updateConnStatus);
  window.addEventListener('offline', updateConnStatus);

  function loadEssentialHelp() {
    var panel = document.getElementById('essential-help');
    var body = document.getElementById('essential-help-body');
    if (!panel || !body) return;
    fetch('/help-essential.json')
      .then(function (res) {
        if (!res.ok) throw new Error('essential help missing');
        return res.json();
      })
      .then(function (data) {
        var articles = (data && data.articles) || [];
        if (!articles.length) return;
        body.innerHTML = articles
          .slice(0, 6)
          .map(function (a) {
            return (
              '<div class="row" style="border:none;padding:8px 0"><div class="title">' +
              escapeHtml(a.title || a.id) +
              '</div><div class="meta">' +
              escapeHtml(a.summary || '') +
              '</div></div>'
            );
          })
          .join('');
        panel.style.display = 'block';
      })
      .catch(function () {
        /* essential subset optional when cache incomplete */
      });
  }

  boot().then(function () {
    /* boot is async void in practice */
  });
  // Always attempt public essential Help (cached allowlisted JSON).
  setTimeout(loadEssentialHelp, 0);
})();
