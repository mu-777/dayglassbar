/* Hero demo: drives the desktop scene so the bar visibly drains and then
   hover-expands, on a loop. Geometry is percentage-based (no pixel measuring),
   so it stays correct at any size. Honors prefers-reduced-motion. */

'use strict';

(function () {
  const scene = document.getElementById('dgbScene');
  if (!scene) return;

  const bar = document.getElementById('dgbBar');
  const fill = document.getElementById('dgbFill');
  const brk = document.getElementById('dgbBreak');
  const nowTag = document.getElementById('dgbNowTag');
  const nowEl = document.getElementById('dgbNow');
  const remEl = document.getElementById('dgbRem');
  const clockEl = document.getElementById('dgbClock');

  // The day segment, in minutes since midnight.
  const START = 540, END = 1020;        // 9:00–17:00
  const SPAN = END - START;
  const BREAK = [720, 780];             // lunch 12:00–13:00
  const NOW_FROM = 600, NOW_TO = 870;   // "now" sweeps 10:00 → 14:30

  // Loop phases (ms): sweep forward, hold expanded, rewind back.
  const SWEEP = 8000, HOVER = 3800, REWIND = 1200;
  const CYCLE = SWEEP + HOVER + REWIND;

  const pct = (v) => (Math.max(0, Math.min(1, v)) * 100).toFixed(2) + '%';
  const lerp = (a, b, t) => a + (b - a) * t;

  function fmt(min) {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h + ':' + String(m).padStart(2, '0');
  }
  function remText(min) {
    const rem = Math.max(0, Math.round(END - min));
    const h = Math.floor(rem / 60), m = rem % 60;
    if (document.documentElement.dataset.lang === 'ja') {
      return h > 0 ? `残り ${h}時間${m}分` : `残り ${m}分`;
    }
    if (h > 0 && m > 0) return `${h}h ${m}m left`;
    if (h > 0) return `${h}h left`;
    return `${m}m left`;
  }

  function render(nowMin, hover) {
    const f = (nowMin - START) / SPAN; // 0..1 position of "now" down the bar

    // remaining fill = from now down to the end
    fill.style.top = pct(f);
    fill.style.height = pct(1 - f);

    // break band: only the portion still on the remaining (lower) side shows
    const bt = (BREAK[0] - START) / SPAN;
    const bb = (BREAK[1] - START) / SPAN;
    const vt = Math.max(bt, f);
    if (vt < bb) {
      brk.style.display = '';
      brk.style.top = pct(vt);
      brk.style.height = pct(bb - vt);
    } else {
      brk.style.display = 'none';
    }

    nowTag.style.top = pct(f);
    nowEl.textContent = fmt(nowMin);
    remEl.textContent = remText(nowMin);
    clockEl.textContent = fmt(nowMin);
    bar.classList.toggle('is-hover', hover);
  }

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    render(840, true); // a representative still frame: 14:00, expanded
    return;
  }

  let t0 = null;
  function frame(ts) {
    if (t0 === null) t0 = ts;
    const e = (ts - t0) % CYCLE;
    let nowMin, hover;
    if (e < SWEEP) {
      nowMin = lerp(NOW_FROM, NOW_TO, e / SWEEP);
      hover = false;
    } else if (e < SWEEP + HOVER) {
      nowMin = NOW_TO;
      hover = true;
    } else {
      nowMin = lerp(NOW_TO, NOW_FROM, (e - SWEEP - HOVER) / REWIND);
      hover = false;
    }
    render(nowMin, hover);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
