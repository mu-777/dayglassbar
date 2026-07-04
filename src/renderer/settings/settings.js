// Settings UI. Dumb on purpose: collects form values into the settings shape and
// asks the main process to validate + save (single source of truth in src/core).
// Localization: the whole i18n catalog (all languages) is fetched once via the
// preload bridge; switching the language dropdown re-renders the form live (the
// in-progress edits are captured with collect() and re-applied) without saving.
(() => {
  const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const $ = (sel) => document.querySelector(sel);
  const weeklyEditors = {};
  // main opens this window with ?firstRun=1 on the very first launch (see main/index.js):
  // show the one-time "settings live in the tray" guide.
  const FIRST_RUN = new URLSearchParams(location.search).get('firstRun') === '1';
  // Donation link target (single source of truth).
  const KOFI_URL = 'https://ko-fi.com/mu_777';

  // ---- i18n (catalog shipped from main) ----
  let MESSAGES = {};
  let LANGUAGES = ['en'];
  let LANGUAGE_NAMES = {};
  let DEFAULT_LANG = 'en';
  let LANG = 'en';
  let displays = [];
  let calendarState = { accounts: [], encryptionAvailable: true };
  let appVersion = '';
  // D-7: unsaved-changes indicator — a small dot prefixed to the window title. Cleared on
  // load()/save/import/reset success; set on any form edit (see the delegated listeners
  // near the bottom of this file).
  let dirty = false;

  function setDirty(v) {
    dirty = Boolean(v);
    updateTitle();
  }

  function updateTitle() {
    document.title = (dirty ? '● ' : '') + t('settings.windowTitle');
  }

  function t(key, params) {
    const table = MESSAGES[LANG] || MESSAGES[DEFAULT_LANG] || {};
    let s = table[key];
    if (s == null && MESSAGES[DEFAULT_LANG]) s = MESSAGES[DEFAULT_LANG][key];
    if (s == null) return key;
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
    return s;
  }

  // Apply translations to every statically-marked element. Called on first render
  // and on every live language switch.
  function applyStaticI18n() {
    document.documentElement.lang = LANG;
    updateTitle();
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
    for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
    for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
    // Version carries a param (the number isn't translatable), so it's set here rather
    // than via a plain data-i18n attribute — and re-localized on every language switch.
    const ver = $('#app-version-text');
    if (ver) ver.textContent = appVersion ? t('app.version', { version: appVersion }) : '';
    // Any previous "check for updates" result is stale after a re-render (new language,
    // reload, …) — clear it rather than leave a translated-in-the-old-language leftover.
    const ur = $('#update-result');
    if (ur) ur.textContent = '';
  }

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ---- day editor (shared by weekly rows and overrides) ----
  function breakRow(b = { start: '12:00', end: '13:00' }) {
    const row = document.createElement('span');
    row.className = 'break-row';
    row.innerHTML =
      `<input class="b-start time" value="${esc(b.start)}" placeholder="12:00" />` +
      `<span class="tilde">${esc(t('sep.range'))}</span>` +
      `<input class="b-end time" value="${esc(b.end)}" placeholder="13:00" />` +
      `<button type="button" class="remove ghost" title="${esc(t('title.removeBreak'))}">×</button>`;
    row.querySelector('.remove').addEventListener('click', () => { row.remove(); setDirty(true); });
    return row;
  }

  function dayEditor(rec = { enabled: false }) {
    const el = document.createElement('span');
    el.className = 'day-editor';
    el.innerHTML =
      `<label class="enabled"><input type="checkbox" class="d-enabled" ${rec.enabled ? 'checked' : ''} /><span>${esc(t('label.enabled'))}</span></label>` +
      `<span class="when" ${rec.enabled ? '' : 'hidden'}>` +
      `<input class="d-start time" value="${esc(rec.start ?? '9:00')}" placeholder="9:00" />` +
      `<span class="tilde">${esc(t('sep.range'))}</span>` +
      `<input class="d-end time" value="${esc(rec.end ?? '17:00')}" placeholder="17:00" />` +
      `<span class="breaks"></span>` +
      `<button type="button" class="add-break ghost">${esc(t('btn.addBreak'))}</button>` +
      `</span>`;
    const when = el.querySelector('.when');
    const breaks = el.querySelector('.breaks');
    for (const b of rec.breaks || []) breaks.appendChild(breakRow(b));
    el.querySelector('.d-enabled').addEventListener('change', (e) => {
      when.hidden = !e.target.checked;
    });
    el.querySelector('.add-break').addEventListener('click', () => { breaks.appendChild(breakRow()); setDirty(true); });
    el.readValue = () => {
      if (!el.querySelector('.d-enabled').checked) return { enabled: false };
      return {
        enabled: true,
        start: el.querySelector('.d-start').value.trim(),
        end: el.querySelector('.d-end').value.trim(),
        breaks: [...breaks.querySelectorAll('.break-row')].map((r) => ({
          start: r.querySelector('.b-start').value.trim(),
          end: r.querySelector('.b-end').value.trim(),
        })),
      };
    };
    return el;
  }

  // ---- weekly ----
  const WEEKDAYS_ONLY = ['mon', 'tue', 'wed', 'thu', 'fri'];

  function buildWeekly(weekly) {
    const root = $('#weekly');
    root.textContent = '';
    for (const key of WEEK) {
      const row = document.createElement('div');
      row.className = 'week-row';
      const name = document.createElement('span');
      name.className = 'day-name';
      name.textContent = t(`weekday.short.${key}`);
      const editor = dayEditor(weekly[key]);
      weeklyEditors[key] = editor;
      row.append(name, editor, buildCopyActions(key));
      root.appendChild(row);
    }
  }

  // Two small "copy this day's schedule elsewhere" buttons (D-2) — a quick way to set up
  // a typical Mon–Fri week, or apply one day's edits to every day, without retyping.
  function buildCopyActions(sourceKey) {
    const wrap = document.createElement('span');
    wrap.className = 'copy-actions';
    const toWeekdays = document.createElement('button');
    toWeekdays.type = 'button';
    toWeekdays.className = 'ghost';
    toWeekdays.textContent = t('btn.copyToWeekdays');
    toWeekdays.title = t('title.copyToWeekdays');
    toWeekdays.addEventListener('click', () =>
      copyDayTo(sourceKey, WEEKDAYS_ONLY.filter((k) => k !== sourceKey)));
    const toAll = document.createElement('button');
    toAll.type = 'button';
    toAll.className = 'ghost';
    toAll.textContent = t('btn.copyToAll');
    toAll.title = t('title.copyToAll');
    toAll.addEventListener('click', () => copyDayTo(sourceKey, WEEK.filter((k) => k !== sourceKey)));
    wrap.append(toWeekdays, toAll);
    return wrap;
  }

  // Apply sourceKey's current (possibly unsaved) values to each target day by rebuilding
  // their editors from scratch — the same construction dayEditor() normally goes through.
  function copyDayTo(sourceKey, targetKeys) {
    const rec = weeklyEditors[sourceKey].readValue();
    for (const k of targetKeys) {
      const newEd = dayEditor(rec);
      weeklyEditors[k].replaceWith(newEd);
      weeklyEditors[k] = newEd;
    }
    setDirty(true);
  }

  // ---- overrides ----
  function addOverrideRow(dateKey, rec) {
    const root = $('#overrides');
    if (root.querySelector(`[data-date="${dateKey}"]`)) return; // one row per date
    const row = document.createElement('div');
    row.className = 'override-row week-row';
    row.dataset.date = dateKey;
    const name = document.createElement('span');
    name.className = 'day-name date';
    name.textContent = dateKey;
    const editor = dayEditor(rec);
    row.editor = editor;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'ghost remove';
    del.title = t('title.removeOverride');
    del.textContent = '×';
    del.addEventListener('click', () => { row.remove(); setDirty(true); });
    row.append(name, editor, del);
    // keep rows sorted by date
    const after = [...root.querySelectorAll('.override-row')].find((r) => r.dataset.date > dateKey);
    root.insertBefore(row, after ?? null);
  }

  // ---- collect / render / save ----
  function collect() {
    const weekly = {};
    for (const key of WEEK) weekly[key] = weeklyEditors[key].readValue();
    const overrides = {};
    for (const row of document.querySelectorAll('#overrides .override-row')) {
      overrides[row.dataset.date] = row.editor.readValue();
    }
    return {
      version: 1,
      language: $('#f-language').value,
      schedule: { weekly, overrides },
      appearance: {
        displayId: $('#f-display').value === '' ? null : Number($('#f-display').value),
        edge: $('#f-edge').value,
        thickness: Number($('#f-thickness').value),
        color: $('#f-color').value,
        opacity: Number($('#f-opacity').value),
        track: { enabled: $('#f-track').checked, opacity: Number($('#f-track-opacity').value) },
        breakColor: $('#f-break-color').value,
        ticks: { enabled: $('#f-ticks').checked, intervalMinutes: Number($('#f-ticks-interval').value) },
        calendar: {
          google: { enabled: $('#f-google-enabled').checked, color: $('#f-google-color').value },
          outlook: {
            enabled: $('#f-outlook-enabled').checked,
            color: $('#f-outlook-color').value,
            method: outlookMethod(),
          },
        },
      },
      behavior: {
        autoLaunch: $('#f-autolaunch').checked,
        hover: {
          dwellMs: Number($('#f-dwell').value),
          expandedThickness: Number($('#f-expanded').value),
        },
      },
    };
  }

  // Turn a language-agnostic validation error ({ code, params }) into a localized
  // string. The label (a weekday or an override date) is composed here.
  function formatError(e) {
    if (!e.code) return e.message || ''; // plain string errors (e.g. file I/O)
    const p = e.params || {};
    const params = { ...p };
    if (p.labelKind === 'weekday') params.label = t(`weekday.long.${p.dayKey}`);
    else if (p.labelKind === 'date') params.label = `${t('v.overrideLabelPrefix')} ${p.date}`;
    if (p.dayKeyA) params.a = t(`weekday.long.${p.dayKeyA}`);
    if (p.dayKeyB) params.b = t(`weekday.long.${p.dayKeyB}`);
    if (p.index != null) params.index = p.index + 1;
    return t(e.code, params);
  }

  function showErrors(errors) {
    const ul = $('#errors');
    ul.textContent = '';
    for (const e of errors) {
      const li = document.createElement('li');
      li.textContent = formatError(e);
      ul.appendChild(li);
    }
    ul.hidden = errors.length === 0;
  }

  let statusTimer = null;
  function setStatus(text) {
    $('#status').textContent = text;
    clearTimeout(statusTimer);
    if (text) {
      statusTimer = setTimeout(() => {
        $('#status').textContent = '';
      }, 3000);
    }
  }

  function syncRangeLabels() {
    $('#v-opacity').textContent = Number($('#f-opacity').value).toFixed(2);
    $('#v-track-opacity').textContent = Number($('#f-track-opacity').value).toFixed(2);
  }

  function buildLanguageSelect() {
    const sel = $('#f-language');
    sel.textContent = '';
    for (const code of LANGUAGES) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = LANGUAGE_NAMES[code] || code;
      sel.appendChild(opt);
    }
    sel.value = LANG;
  }

  // Calendar: per-provider show toggle + color, plus a connection control. OAuth connection
  // state comes from main (calendar:status) — never settings.json — so tokens stay out of the
  // exportable settings. Outlook picks ONE method: local COM (no sign-in) or cloud OAuth.
  const PROVIDER_LABEL = { google: 'Google', microsoft: 'Microsoft' };

  function outlookMethod() {
    const r = document.querySelector('input[name="outlook-method"]:checked');
    return r ? r.value : 'local';
  }

  // Connect/disconnect control for an OAuth providerId, rendered into `container`.
  // `disabled` greys out the connect action (Outlook cloud is not supported yet).
  function buildConn(container, providerId, { disabled = false } = {}) {
    container.textContent = '';
    const acct = calendarState.accounts.find((a) => a.provider === providerId) || { connected: false };
    const status = document.createElement('span');
    status.className = 'cal-status';
    status.textContent = acct.connected
      ? t('calendar.connectedAs', { email: acct.email || PROVIDER_LABEL[providerId] })
      : t('calendar.notConnected');
    const btn = document.createElement('button');
    btn.type = 'button';
    if (acct.connected) {
      btn.className = 'ghost';
      btn.textContent = t('calendar.disconnect');
      btn.addEventListener('click', () => onDisconnect(providerId));
    } else {
      btn.textContent = t('calendar.connect', { provider: PROVIDER_LABEL[providerId] });
      btn.addEventListener('click', () => onConnect(providerId, btn));
      btn.disabled = disabled;
    }
    container.append(status, btn);
    // Surface a connected-but-unhealthy account (e.g. a token refresh that has started
    // failing) instead of letting the color band silently go stale — see calendar/index.js
    // `health`. Not shown for a never-connected account (nothing to warn about yet).
    if (acct.connected && acct.error) {
      const warn = document.createElement('p');
      warn.className = 'note warn';
      warn.textContent = t('calendar.connectError', { error: acct.error });
      container.append(warn);
    }
  }

  // Render both providers' connection UI from calendarState + the chosen Outlook method, plus
  // a "choose calendars" picker for each usable source (Google when connected; Outlook local).
  function renderCalendarConnections() {
    $('#cal-enc-warn').hidden = calendarState.encryptionAvailable !== false;
    $('#cal-enc-warn').textContent = t('calendar.encUnavailable');
    buildConn($('#google-conn'), 'google');
    const googleConnected = (calendarState.accounts.find((a) => a.provider === 'google') || {}).connected;
    if (googleConnected) renderCalendarPicker('google', $('#google-cals'));
    else $('#google-cals').textContent = ''; // a calendar list needs a connected account
    const method = outlookMethod();
    $('#outlook-method-hint').textContent = method === 'cloud' ? t('calendar.methodCloudHint') : t('calendar.localOutlookHint');
    // Cloud (Microsoft Graph OAuth) isn't supported yet: keep the toggle but disable sign-in.
    if (method === 'cloud') {
      buildConn($('#outlook-conn'), 'microsoft', { disabled: true });
      $('#outlook-cals').textContent = ''; // cloud is disabled → no calendar picker
    } else {
      $('#outlook-conn').textContent = ''; // local needs no sign-in
      renderCalendarPicker('outlook-local', $('#outlook-cals'));
    }
  }

  // Calendar picker: lazily loads a source's calendar list (a network/COM call, so on a button
  // press rather than on every settings open) and lets the user check which calendars to show.
  // Selection is persisted immediately via its own IPC — it lives in the encrypted store, not
  // settings.json, so it is independent of the Save button. sourceId: 'google' | 'outlook-local'.
  function renderCalendarPicker(sourceId, container) {
    container.textContent = '';
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = t('calendar.calendarsHint');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost';
    btn.textContent = t('calendar.chooseCalendars');
    const list = document.createElement('div');
    list.className = 'cal-list';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = t('calendar.loadingCalendars');
      const result = await window.api.calendarListCalendars(sourceId);
      btn.disabled = false;
      btn.textContent = label;
      renderCalendarList(list, sourceId, result);
    });
    container.append(note, btn, list);
  }

  // Render checkboxes for the loaded calendars; persist (and re-fetch) on every toggle. An empty
  // selection means "default/primary only", so when nothing is stored yet we pre-check the
  // primary calendar to mirror what the bar actually shows.
  function renderCalendarList(list, sourceId, result) {
    list.textContent = '';
    if (!result || !result.ok) {
      const err = document.createElement('p');
      err.className = 'note warn';
      err.textContent = t('calendar.loadCalendarsFailed', { error: (result && result.error) || t('error.unknown') });
      list.appendChild(err);
      return;
    }
    if (!result.calendars || result.calendars.length === 0) {
      const none = document.createElement('p');
      none.className = 'note';
      none.textContent = t('calendar.noCalendars');
      list.appendChild(none);
      return;
    }
    const selected = result.selected || [];
    const rows = [];
    const persist = () => {
      const ids = rows.filter((r) => r.checkbox.checked).map((r) => r.id);
      window.api.calendarSetSelection(sourceId, ids);
      setStatus(t('calendar.calendarsSaved'));
    };
    for (const c of result.calendars) {
      const label = document.createElement('label');
      label.className = 'check cal-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selected.length ? selected.includes(c.id) : Boolean(c.primary);
      cb.addEventListener('change', persist);
      const span = document.createElement('span');
      span.textContent = c.primary ? `${c.name} ${t('calendar.primaryBadge')}` : c.name;
      label.append(cb, span);
      list.appendChild(label);
      rows.push({ id: c.id, checkbox: cb });
    }
  }

  async function onConnect(providerId, btn) {
    btn.disabled = true;
    setStatus(t('calendar.connecting'));
    const result = await window.api.calendarConnect(providerId);
    if (result.ok) {
      calendarState.accounts = result.accounts;
      // main turns the matching overlay on (and pins Outlook to cloud); reflect it here.
      if (providerId === 'google') $('#f-google-enabled').checked = true;
      else if (providerId === 'microsoft') {
        $('#f-outlook-enabled').checked = true;
        const cloud = document.querySelector('input[name="outlook-method"][value="cloud"]');
        if (cloud) cloud.checked = true;
      }
      showErrors([]);
      setStatus(t('calendar.connected'));
    } else {
      // Persist the reason in the error list (the status line auto-clears after a few seconds).
      const msg = t('calendar.connectFailed', { error: result.error || t('error.unknown') });
      showErrors([{ message: msg }]);
      setStatus(msg);
    }
    renderCalendarConnections();
  }

  async function onDisconnect(providerId) {
    const result = await window.api.calendarDisconnect(providerId);
    calendarState.accounts = result.accounts;
    setStatus(t('calendar.disconnected'));
    renderCalendarConnections();
  }

  function buildDisplaySelect(selectedId) {
    const sel = $('#f-display');
    sel.textContent = '';
    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = t('option.displayAuto');
    sel.appendChild(auto);
    for (const d of displays) {
      const opt = document.createElement('option');
      opt.value = String(d.id);
      const suffix = d.primary ? t('displays.primarySuffix') : '';
      opt.textContent = `${d.width}×${d.height} (${d.x}, ${d.y})${suffix}`;
      sel.appendChild(opt);
    }
    sel.value = selectedId == null ? '' : String(selectedId);
    if (sel.selectedIndex < 0) sel.value = ''; // configured display is detached → auto
  }

  // Render the whole form from a settings object in the current LANG.
  function render(settings) {
    applyStaticI18n();
    $('#onboarding-hint').hidden = !FIRST_RUN; // keep it visible across live language switches
    $('#onboarding-autolaunch').hidden = !FIRST_RUN; // auto-launch disclosure, first run only
    buildLanguageSelect();

    const ap = settings.appearance;
    buildDisplaySelect(ap.displayId);
    $('#f-edge').value = ap.edge;
    $('#f-thickness').value = ap.thickness;
    $('#f-color').value = ap.color;
    $('#f-opacity').value = ap.opacity;
    $('#f-break-color').value = ap.breakColor;
    $('#f-track').checked = ap.track.enabled;
    $('#f-track-opacity').value = ap.track.opacity;
    $('#f-ticks').checked = ap.ticks.enabled;
    $('#f-ticks-interval').value = ap.ticks.intervalMinutes;
    const cal = ap.calendar || {};
    const g = cal.google || { enabled: false, color: '#c98a3a' };
    const o = cal.outlook || { enabled: false, color: '#4a9e9e', method: 'local' };
    $('#f-google-enabled').checked = g.enabled;
    $('#f-google-color').value = g.color;
    $('#f-outlook-enabled').checked = o.enabled;
    $('#f-outlook-color').value = o.color;
    const methodRadio = document.querySelector(`input[name="outlook-method"][value="${o.method === 'cloud' ? 'cloud' : 'local'}"]`);
    if (methodRadio) methodRadio.checked = true;
    renderCalendarConnections();
    $('#f-autolaunch').checked = settings.behavior.autoLaunch;
    $('#f-dwell').value = settings.behavior.hover.dwellMs;
    $('#f-expanded').value = settings.behavior.hover.expandedThickness;
    syncRangeLabels();

    buildWeekly(settings.schedule.weekly);
    $('#overrides').textContent = '';
    for (const key of Object.keys(settings.schedule.overrides).sort()) {
      addOverrideRow(key, settings.schedule.overrides[key]);
    }
  }

  async function load() {
    const [settings, disp, i18n, cal, version] = await Promise.all([
      window.api.getSettings(),
      window.api.listDisplays(),
      window.api.getI18n(),
      window.api.calendarStatus(),
      window.api.getAppVersion(),
    ]);
    MESSAGES = i18n.messages;
    LANGUAGES = i18n.languages;
    LANGUAGE_NAMES = i18n.languageNames;
    DEFAULT_LANG = i18n.defaultLanguage;
    LANG = LANGUAGES.includes(settings.language) ? settings.language : DEFAULT_LANG;
    displays = disp;
    calendarState = cal;
    appVersion = version;
    render(settings);
    setDirty(false); // a freshly loaded/reloaded form has nothing unsaved yet
  }

  // Donation link: show the URL on hover, but open it in the system browser (not a new
  // Electron window) on click. Click-through bar never does this — settings only.
  const supportLink = $('#support-link');
  if (supportLink) {
    supportLink.setAttribute('href', KOFI_URL);
    supportLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.api.openExternal(KOFI_URL);
    });
  }

  // D-7: mark the form dirty on any input/change under <main>, except the calendar picker
  // (.cal-list) — those checkboxes persist immediately via their own IPC call and are never
  // part of the Save button's payload, so they shouldn't imply "you have unsaved changes".
  for (const evt of ['input', 'change']) {
    $('main').addEventListener(evt, (e) => {
      if (e.target.closest('.cal-list')) return;
      setDirty(true);
    });
  }

  $('#f-opacity').addEventListener('input', syncRangeLabels);
  $('#f-track-opacity').addEventListener('input', syncRangeLabels);

  // Live language preview: capture in-progress edits, switch, re-render. No save.
  $('#f-language').addEventListener('change', (e) => {
    const current = collect();
    LANG = e.target.value;
    render(current);
  });

  $('#add-override').addEventListener('click', () => {
    const v = $('#override-date').value;
    if (!v) return;
    addOverrideRow(v, { enabled: true, start: '9:00', end: '17:00', breaks: [] });
    setDirty(true);
  });

  // Switching the Outlook method live-updates the hint and shows/hides the sign-in control.
  for (const r of document.querySelectorAll('input[name="outlook-method"]')) {
    r.addEventListener('change', renderCalendarConnections);
  }

  $('#save').addEventListener('click', async () => {
    const result = await window.api.saveSettings(collect());
    // Validation failures come back as result.errors; a disk write failure (validation
    // passed but store.save() threw) instead comes back as a single result.error string.
    showErrors(result.errors && result.errors.length ? result.errors : result.error ? [{ message: result.error }] : []);
    setStatus(result.ok ? t('status.saved') : t('status.saveFailed'));
    if (result.ok) setDirty(false);
  });

  $('#export').addEventListener('click', async () => {
    const result = await window.api.exportSettings();
    if (result.canceled) return;
    showErrors([]);
    setStatus(result.ok ? t('status.exported') : t('status.exportFailed', { error: result.error ?? t('error.unknown') }));
  });

  $('#diagnostics').addEventListener('click', async () => {
    const result = await window.api.exportDiagnostics();
    if (result.canceled) return;
    showErrors([]);
    setStatus(result.ok ? t('status.diagnosticsSaved') : t('status.diagnosticsFailed', { error: result.error ?? t('error.unknown') }));
  });

  // Manual "check for updates" (F-3): one GitHub API call on click, result shown as plain
  // text or a link — no auto-check, no badge/notification (invariant #4: promote, don't rush).
  $('#check-updates').addEventListener('click', async () => {
    const btn = $('#check-updates');
    const resultEl = $('#update-result');
    btn.disabled = true;
    resultEl.textContent = t('updates.checking');
    const result = await window.api.checkUpdates();
    resultEl.textContent = '';
    if (result.ok && result.hasUpdate) {
      const a = document.createElement('a');
      a.href = result.url;
      a.textContent = t('updates.available', { version: result.latest });
      a.addEventListener('click', (e) => {
        e.preventDefault();
        window.api.openExternal(result.url);
      });
      resultEl.appendChild(a);
    } else if (result.ok) {
      resultEl.textContent = t('updates.upToDate');
    } else {
      resultEl.textContent = t('updates.failed', { error: result.error ?? t('error.unknown') });
    }
    btn.disabled = false;
  });

  $('#import').addEventListener('click', async () => {
    const result = await window.api.importSettings();
    if (result.canceled) return;
    if (result.ok) {
      showErrors([]);
      await load(); // reflect the imported (now persisted) settings + language in the form
      setStatus(t('status.imported'));
      setDirty(false);
    } else {
      showErrors(result.errors ?? [{ message: result.error ?? t('error.importGeneric') }]);
      setStatus(t('status.importFailed'));
    }
  });

  // Reset settings.json to defaults (D-1). Confirm first — this discards the whole schedule
  // and appearance config (calendar connections are untouched, see settings:reset in main).
  $('#reset').addEventListener('click', async () => {
    if (!window.confirm(t('confirm.reset'))) return;
    const result = await window.api.resetSettings();
    if (result.ok) {
      showErrors([]);
      await load(); // reflect the now-default settings in the form
      setStatus(t('status.reset'));
      setDirty(false);
    } else {
      showErrors([{ message: result.error }]);
    }
  });

  load();
})();
