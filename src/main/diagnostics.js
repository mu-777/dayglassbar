// Diagnostics dump (support aid). Bundles the app's logs + runtime environment +
// current settings into a single .zip the user can save and hand to support. No
// network, no cloud — the user decides how to send it. Secrets are deliberately
// excluded: OAuth tokens/accounts live in userData/calendar-accounts.enc (CLAUDE.md
// invariant #7) and are never read here; settings.json holds no secrets by design.
//
// Log instrumentation itself is added separately; this picks up whatever log files
// already exist under userData/logs, so it stays useful as logging is filled in.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createZip } from '../core/zip.js';

function listFiles(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name);
  } catch {
    return []; // dir absent (e.g. before any logging happens) → nothing to add
  }
}

// Build the diagnostics archive as { reportId, filename, buffer }. `app`/`screen` are
// injected (the Electron singletons) so the shape stays explicit and not import-coupled.
export function buildDiagnosticsZip({ app, screen, store, now = new Date() }) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const reportId = `${stamp}-${Math.random().toString(36).slice(2, 8)}`;

  const primaryId = screen.getPrimaryDisplay().id;
  const env = {
    reportId,
    generatedAt: now.toISOString(),
    app: { name: app.getName(), version: app.getVersion() },
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
    os: { platform: process.platform, release: os.release(), arch: process.arch },
    locale: app.getLocale(),
    // Geometry matters for edge-placement bugs (the bar lives on workArea, invariant #5).
    displays: screen.getAllDisplays().map((d) => ({
      id: d.id,
      primary: d.id === primaryId,
      bounds: d.bounds,
      workArea: d.workArea,
      scaleFactor: d.scaleFactor,
    })),
  };

  const entries = [
    { name: 'environment.json', data: JSON.stringify(env, null, 2) },
    { name: 'settings.json', data: JSON.stringify(store.get(), null, 2) }, // no secrets (see header)
  ];

  const logsDir = path.join(app.getPath('userData'), 'logs');
  for (const name of listFiles(logsDir)) {
    try {
      entries.push({ name: `logs/${name}`, data: fs.readFileSync(path.join(logsDir, name)) });
    } catch {
      /* skip an unreadable file rather than fail the whole dump */
    }
  }

  return { reportId, filename: `dayglassbar-diagnostics-${reportId}.zip`, buffer: createZip(entries, now) };
}
