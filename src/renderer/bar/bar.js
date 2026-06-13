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
  document.body.addEventListener('click', () => {
    // The window only receives clicks while expanded (main toggles
    // setIgnoreMouseEvents), but guard anyway.
    if (last && last.expanded) window.dayglass.openSettings();
  });

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function render() {
    if (!last) return;
    const { state, appearance, expanded } = last;
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
    const full = horizontal ? h : w;
    // Expanded: the axis becomes a slim centered bar with labels around it.
    const axisThickness = expanded ? Math.min(10, full) : full;
    const axisOffset = expanded ? (full - axisThickness) / 2 : 0;

    const rect = (fromFrac, toFrac, color) => {
      ctx.fillStyle = color;
      if (horizontal) {
        ctx.fillRect(fromFrac * w, axisOffset, (toFrac - fromFrac) * w, axisThickness);
      } else {
        ctx.fillRect(axisOffset, fromFrac * h, axisThickness, (toFrac - fromFrac) * h);
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
          if (horizontal) ctx.fillRect(f * w - 0.5, axisOffset, 1, axisThickness);
          else ctx.fillRect(axisOffset, f * h - 0.5, axisThickness, 1);
        }
      }
      if (expanded) renderActiveLabels(state, horizontal, w, h, axisOffset, axisThickness);
    } else if (expanded) {
      // Outside the interval (track only): explain what this strip is.
      if (horizontal) {
        addLabel('区間外｜クリックで設定を開く', { right: '6px', bottom: '3px' }).classList.add('hint');
      } else {
        addLabel('区間外', { bottom: '4px' }, true).classList.add('hint');
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

  function renderActiveLabels(state, horizontal, w, h, axisOffset, axisThickness) {
    const below = `${axisOffset + axisThickness + 4}px`;
    if (horizontal) {
      addLabel(state.labels.start, { left: '6px', top: below });
      addLabel(state.labels.end, { right: '6px', top: below });
      const x = Math.min(Math.max(state.nowFrac * w - 40, 64), Math.max(64, w - 230));
      addLabel(`${state.labels.now}｜残り ${state.labels.remaining}`, { left: `${x}px`, top: below });
      addLabel('クリックで設定を開く', { right: '6px', bottom: '3px' }).classList.add('hint');
    } else {
      addLabel(state.labels.start, { top: '4px' }, true);
      addLabel(state.labels.end, { bottom: '4px' }, true);
      const y = Math.min(Math.max(state.nowFrac * h - 14, 26), h - 76);
      const nowEl = addLabel(`${state.labels.now}\n残り ${state.labels.remaining}`, { top: `${y}px` }, true);
      nowEl.style.whiteSpace = 'pre-line';
      addLabel('クリックで設定', { bottom: '22px' }, true).classList.add('hint');
    }
  }
})();
