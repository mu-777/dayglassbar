// The bar overlay window (spec 4.2 / 4.4).
//
// Hover mechanism (spec 4.4 — goal-level requirement, realized here as a design
// decision recorded in docs/design.md):
//   - The window normally ignores ALL mouse input (setIgnoreMouseEvents(true)),
//     so fast edge gestures — maximized-window tabs, close buttons, scrollbars —
//     pass straight through.
//   - The main process polls the global cursor position (idle: every 250ms,
//     near the bar: every 60ms). When the cursor stays inside the bar for
//     `hover.dwellMs`, the window becomes interactive and expands; when the
//     cursor leaves it for two consecutive fast polls, it collapses.
import path from 'node:path';
import { BrowserWindow, screen, app } from 'electron';
import { getBarState } from '../core/schedule.js';
import { computeBarBounds, pointInBounds } from '../core/geometry.js';

const POLL_IDLE_MS = 250;
const POLL_NEAR_MS = 60;

// Dev-only escape hatch for environments that don't composite the transparent,
// always-on-top, click-through overlay (notably WSLg). When the env var is set,
// the bar is created as an ordinary opaque, focusable window so it actually shows
// on screen for visual checks. Unset by default → production behavior is unchanged.
const WSL_VISIBLE = /^(1|true|yes|on)$/i.test(process.env.DAYGLASSBAR_WSL_VISIBLE || '');

export function createBarController({ store, timeSource }) {
  let win = null;
  let expanded = false;
  let insideSinceMs = null;
  let outsideStreak = 0;
  let pollTimer = null;
  let tickTimer = null;
  let lastMode = null;
  let quitting = false;

  app.on('before-quit', () => {
    quitting = true;
  });

  const appearance = () => store.get().appearance;
  const hover = () => store.get().behavior.hover;

  function pickDisplay() {
    // Fall back to the primary display when the configured one is unavailable
    // (spec 4.2: disconnected display → primary, restored on reconnect).
    const wanted = appearance().displayId;
    const displays = screen.getAllDisplays();
    return displays.find((d) => d.id === wanted) || screen.getPrimaryDisplay();
  }

  function currentBounds() {
    const t = expanded ? hover().expandedThickness : appearance().thickness;
    return computeBarBounds(pickDisplay().workArea, appearance().edge, t);
  }

  function applyBounds() {
    if (!win || win.isDestroyed()) return;
    const b = currentBounds();
    // Workaround: with resizable:false some platforms ignore programmatic
    // resizes, so toggle it around setBounds.
    win.setResizable(true);
    win.setBounds(b);
    win.setResizable(false);
  }

  function create() {
    win = new BrowserWindow({
      ...currentBounds(),
      frame: false,
      transparent: !WSL_VISIBLE,
      backgroundColor: WSL_VISIBLE ? '#1e1e1e' : undefined,
      alwaysOnTop: true,
      skipTaskbar: !WSL_VISIBLE,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      focusable: WSL_VISIBLE,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: path.join(app.getAppPath(), 'src', 'preload', 'bar-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    if (process.platform === 'darwin') {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    }
    if (!WSL_VISIBLE) win.setIgnoreMouseEvents(true, { forward: true });
    win.on('close', (e) => {
      if (!quitting) e.preventDefault(); // the bar cannot be closed, only quit via the tray
    });
    win.webContents.on('did-finish-load', () => pushState());
    win.loadFile('src/renderer/bar/index.html');
  }

  // Recompute from the wall clock and push to the renderer. Never accumulate
  // elapsed time (CLAUDE.md invariant #1) — this single line is why sleep /
  // resume / clock changes are handled correctly.
  function pushState() {
    if (!win || win.isDestroyed()) return;
    const settings = store.get();
    const ap = settings.appearance;
    const state = getBarState(settings.schedule, timeSource.now(), {
      tickIntervalMinutes: ap.ticks.enabled ? ap.ticks.intervalMinutes : 0,
    });
    if (state.mode === 'hidden') {
      if (win.isVisible()) win.hide(); // OFF day: fully hidden (spec 5)
    } else if (!win.isVisible()) {
      win.showInactive();
      win.setAlwaysOnTop(true, 'screen-saver');
    }
    lastMode = state.mode;
    win.webContents.send('bar:state', { state, appearance: ap, expanded });
  }

  function setExpanded(next) {
    if (!win || win.isDestroyed() || expanded === next) return;
    expanded = next;
    if (!WSL_VISIBLE) {
      if (next) win.setIgnoreMouseEvents(false);
      else win.setIgnoreMouseEvents(true, { forward: true });
    }
    applyBounds();
    pushState();
  }

  function poll() {
    let delay = POLL_IDLE_MS;
    try {
      if (win && !win.isDestroyed() && win.isVisible()) {
        const pt = screen.getCursorScreenPoint();
        const inside = pointInBounds(pt, win.getBounds());
        if (inside) {
          outsideStreak = 0;
          delay = POLL_NEAR_MS;
          if (!expanded) {
            if (insideSinceMs == null) insideSinceMs = Date.now();
            if (Date.now() - insideSinceMs >= hover().dwellMs) setExpanded(true);
          }
        } else {
          insideSinceMs = null;
          if (expanded) {
            delay = POLL_NEAR_MS;
            outsideStreak += 1;
            if (outsideStreak >= 2) {
              outsideStreak = 0;
              setExpanded(false);
            }
          }
        }
      } else {
        insideSinceMs = null;
      }
    } catch {
      // screen API hiccups while displays are being attached/detached — retry next poll
    }
    pollTimer = setTimeout(poll, delay);
  }

  function onDisplaysChanged() {
    applyBounds();
    pushState();
  }

  function start() {
    create();
    tickTimer = setInterval(pushState, 1000);
    poll();
    screen.on('display-added', onDisplaysChanged);
    screen.on('display-removed', onDisplaysChanged);
    screen.on('display-metrics-changed', onDisplaysChanged);
    store.onChange(() => {
      if (expanded) setExpanded(false);
      applyBounds();
      pushState();
    });
  }

  function dispose() {
    if (tickTimer) clearInterval(tickTimer);
    if (pollTimer) clearTimeout(pollTimer);
    if (win && !win.isDestroyed()) win.destroy();
  }

  return { start, dispose };
}
