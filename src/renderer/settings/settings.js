// Settings UI. Dumb on purpose: collects form values into the settings shape and
// asks the main process to validate + save (single source of truth in src/core).
(() => {
  const WEEK = [
    ['mon', '月'],
    ['tue', '火'],
    ['wed', '水'],
    ['thu', '木'],
    ['fri', '金'],
    ['sat', '土'],
    ['sun', '日'],
  ];
  const $ = (sel) => document.querySelector(sel);
  const weeklyEditors = {};

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
      `<span class="tilde">〜</span>` +
      `<input class="b-end time" value="${esc(b.end)}" placeholder="13:00" />` +
      `<button type="button" class="remove ghost" title="この休憩を削除">×</button>`;
    row.querySelector('.remove').addEventListener('click', () => row.remove());
    return row;
  }

  function dayEditor(rec = { enabled: false }) {
    const el = document.createElement('span');
    el.className = 'day-editor';
    el.innerHTML =
      `<label class="enabled"><input type="checkbox" class="d-enabled" ${rec.enabled ? 'checked' : ''} /><span>有効</span></label>` +
      `<span class="when" ${rec.enabled ? '' : 'hidden'}>` +
      `<input class="d-start time" value="${esc(rec.start ?? '9:00')}" placeholder="9:00" />` +
      `<span class="tilde">〜</span>` +
      `<input class="d-end time" value="${esc(rec.end ?? '17:00')}" placeholder="17:00" />` +
      `<span class="breaks"></span>` +
      `<button type="button" class="add-break ghost">+ 休憩</button>` +
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
    for (const [key, label] of WEEK) {
      const row = document.createElement('div');
      row.className = 'week-row';
      const name = document.createElement('span');
      name.className = 'day-name';
      name.textContent = label;
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
    del.title = 'この上書きを削除';
    del.textContent = '×';
    del.addEventListener('click', () => row.remove());
    row.append(name, editor, del);
    // keep rows sorted by date
    const after = [...root.querySelectorAll('.override-row')].find((r) => r.dataset.date > dateKey);
    root.insertBefore(row, after ?? null);
  }

  // ---- collect / load / save ----
  function collect() {
    const weekly = {};
    for (const [key] of WEEK) weekly[key] = weeklyEditors[key].readValue();
    const overrides = {};
    for (const row of document.querySelectorAll('#overrides .override-row')) {
      overrides[row.dataset.date] = row.editor.readValue();
    }
    return {
      version: 1,
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

  function showErrors(errors) {
    const ul = $('#errors');
    ul.textContent = '';
    for (const e of errors) {
      const li = document.createElement('li');
      li.textContent = e.message;
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

  async function load() {
    const [settings, displays] = await Promise.all([window.api.getSettings(), window.api.listDisplays()]);

    const sel = $('#f-display');
    sel.textContent = '';
    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = 'プライマリ（自動）';
    sel.appendChild(auto);
    for (const d of displays) {
      const opt = document.createElement('option');
      opt.value = String(d.id);
      opt.textContent = d.label;
      sel.appendChild(opt);
    }

    const ap = settings.appearance;
    sel.value = ap.displayId == null ? '' : String(ap.displayId);
    if (sel.selectedIndex < 0) sel.value = ''; // configured display is detached → auto
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

  $('#f-opacity').addEventListener('input', syncRangeLabels);
  $('#f-track-opacity').addEventListener('input', syncRangeLabels);

  $('#add-override').addEventListener('click', () => {
    const v = $('#override-date').value;
    if (!v) return;
    addOverrideRow(v, { enabled: true, start: '9:00', end: '17:00', breaks: [] });
  });

  $('#save').addEventListener('click', async () => {
    const result = await window.api.saveSettings(collect());
    showErrors(result.errors);
    setStatus(result.ok ? '保存して適用しました' : '保存できませんでした（エラーを確認してください）');
  });

  load();
})();
