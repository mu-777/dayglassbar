// Pure painter for the bar. All state is computed in the main process from the
// wall clock and pushed here via 'bar:state' — this file holds no time logic.
//
// Axis orientation (spec 4.2):
//   horizontal (top/bottom): S at the left, E at the right → fill shrinks toward the right
//   vertical (left/right):   S at the top, E at the bottom → fill shrinks toward the bottom
(() => {
  const canvas = document.getElementById('canvas');
  const labelsEl = document.getElementById('labels');
  const ctx = canvas.getContext('2d');
  let last = null;

  window.dayglass.onState((payload) => {
    last = payload;
    render();
  });
  window.addEventListener('resize', render);
  // No click handling: the bar stays click-through even while expanded (main
  // never disables setIgnoreMouseEvents), so clicks pass through to whatever is
  // under the bar. Settings are opened from the tray, not by clicking the bar.

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // The few words the bar shows on hover are localized in the main process and
  // pushed in the payload (see src/main/bar-window.js). Fall back to English.
  const FALLBACK_STRINGS = { outside: 'Outside', remainingFmt: '{v} left' };

  function render() {
    if (!last) return;
    const { state, appearance, expanded, strings = FALLBACK_STRINGS } = last;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    labelsEl.hidden = !expanded;
    labelsEl.textContent = '';
    if (state.mode === 'hidden') return; // main hides the window too; belt & suspenders

    const horizontal = appearance.edge === 'top' || appearance.edge === 'bottom';
    // The fill always spans the full window thickness. Expanding only grows the
    // window (main widens it to hover.expandedThickness); the bar grows with it
    // and labels overlay on top — so a hovered bar is wider AND fully painted,
    // never a thin sliver inside a wide gap.
    const rect = (fromFrac, toFrac, color) => {
      ctx.fillStyle = color;
      if (horizontal) {
        ctx.fillRect(fromFrac * w, 0, (toFrac - fromFrac) * w, h);
      } else {
        ctx.fillRect(0, fromFrac * h, w, (toFrac - fromFrac) * h);
      }
    };

    if (appearance.track.enabled) {
      rect(0, 1, hexToRgba(appearance.color, appearance.track.opacity));
    }

    if (state.mode === 'active') {
      for (const seg of state.segments) {
        const color =
          seg.kind === 'break'
            ? hexToRgba(appearance.breakColor, appearance.opacity)
            : hexToRgba(appearance.color, appearance.opacity);
        rect(seg.from, seg.to, color);
      }
      if (state.ticks && state.ticks.length) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        for (const f of state.ticks) {
          if (horizontal) ctx.fillRect(f * w - 0.5, 0, 1, h);
          else ctx.fillRect(0, f * h - 0.5, w, 1);
        }
      }
      if (expanded) renderActiveLabels(state, strings, horizontal, w, h);
    } else if (expanded) {
      // Outside the interval (track only): label what this strip is.
      if (horizontal) {
        addLabel(strings.outside, { right: '6px', top: '50%', transform: 'translateY(-50%)' }).classList.add('hint');
      } else {
        addLabel(strings.outside, { bottom: '4px' }, true).classList.add('hint');
      }
    }
  }

  function addLabel(text, style = {}, centered = false) {
    const el = document.createElement('span');
    el.className = centered ? 'label center' : 'label';
    el.textContent = text;
    Object.assign(el.style, style);
    labelsEl.appendChild(el);
    return el;
  }

  function renderActiveLabels(state, strings, horizontal, w, h) {
    // Labels overlay on top of the full-thickness fill (no room beside it now).
    const remaining = strings.remainingFmt.replace('{v}', state.labels.remaining);
    if (horizontal) {
      const mid = { top: '50%', transform: 'translateY(-50%)' };
      addLabel(state.labels.start, { left: '6px', ...mid });
      addLabel(state.labels.end, { right: '6px', ...mid });
      const x = Math.min(Math.max(state.nowFrac * w - 40, 64), Math.max(64, w - 200));
      addLabel(`${state.labels.now}｜${remaining}`, { left: `${x}px`, ...mid });
    } else {
      addLabel(state.labels.start, { top: '4px' }, true);
      addLabel(state.labels.end, { bottom: '4px' }, true);
      const y = Math.min(Math.max(state.nowFrac * h - 14, 26), h - 40);
      const nowEl = addLabel(`${state.labels.now}\n${remaining}`, { top: `${y}px` }, true);
      nowEl.style.whiteSpace = 'pre-line';
    }
  }
})();
