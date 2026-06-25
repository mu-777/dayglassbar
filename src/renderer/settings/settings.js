// Settings UI. Dumb on purpose: collects form values into the settings shape and
// asks the main process to validate + save (single source of truth in src/core).
// Localization: the whole i18n catalog (all languages) is fetched once via the
// preload bridge; switching the language dropdown re-renders the form live (the
// in-progress edits are captured with collect() and re-applied) without saving.
(() => {
  const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const $ = (sel) => document.querySelector(sel);
  const weeklyEditors = {};

  // ---- i18n (catalog shipped from main) ----
  let MESSAGES = {};
  let LANGUAGES = ['en'];
  let LANGUAGE_NAMES = {};
  let DEFAULT_LANG = 'en';
  let LANG = 'en';
  let displays = [];

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
    document.title = t('settings.windowTitle');
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
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
    row.querySelector('.remove').addEventListener('click', () => row.remove());
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
    el.querySelector('.add-break').addEventListener('click', () => breaks.appendChild(breakRow()));
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
      row.append(name, editor);
      root.appendChild(row);
    }
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
    del.addEventListener('click', () => row.remove());
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
    const [settings, disp, i18n] = await Promise.all([
      window.api.getSettings(),
      window.api.listDisplays(),
      window.api.getI18n(),
    ]);
    MESSAGES = i18n.messages;
    LANGUAGES = i18n.languages;
    LANGUAGE_NAMES = i18n.languageNames;
    DEFAULT_LANG = i18n.defaultLanguage;
    LANG = LANGUAGES.includes(settings.language) ? settings.language : DEFAULT_LANG;
    displays = disp;
    render(settings);
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
  });

  $('#save').addEventListener('click', async () => {
    const result = await window.api.saveSettings(collect());
    showErrors(result.errors);
    setStatus(result.ok ? t('status.saved') : t('status.saveFailed'));
  });

  $('#export').addEventListener('click', async () => {
    const result = await window.api.exportSettings();
    if (result.canceled) return;
    showErrors([]);
    setStatus(result.ok ? t('status.exported') : t('status.exportFailed', { error: result.error ?? t('error.unknown') }));
  });

  $('#import').addEventListener('click', async () => {
    const result = await window.api.importSettings();
    if (result.canceled) return;
    if (result.ok) {
      showErrors([]);
      await load(); // reflect the imported (now persisted) settings + language in the form
      setStatus(t('status.imported'));
    } else {
      showErrors(result.errors ?? [{ message: result.error ?? t('error.importGeneric') }]);
      setStatus(t('status.importFailed'));
    }
  });

  load();
})();
