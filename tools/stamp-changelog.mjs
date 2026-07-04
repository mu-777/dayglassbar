// Stamp CHANGELOG.md at release time. Run automatically by the npm `version` lifecycle
// script (`npm version patch|minor|major`) — after package.json is bumped but before the
// version commit/tag — so the changelog and the tag never drift.
//
// It renames the `## [Unreleased]` heading to `## [<newVersion>] - YYYY-MM-DD`, inserts a
// fresh empty `## [Unreleased]` above it, and refreshes the compare/link footer. The content
// under [Unreleased] (written by hand or by Claude before the bump) becomes the release body
// verbatim once GitHub Actions extracts this version's section (see extract-changelog.mjs).
//
// Standalone use (e.g. the very first release, where package.json is already at the target
// version and no bump happens): `node tools/stamp-changelog.mjs` then commit + tag manually.
// Dependency-free (fs only), like the other tools/ scripts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const changelogPath = path.join(root, 'CHANGELOG.md');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

let text = fs.readFileSync(changelogPath, 'utf8');

const unreleased = /^## \[Unreleased\][^\n]*$/m;
if (!unreleased.test(text)) {
  console.error(`stamp-changelog: no "## [Unreleased]" heading found in CHANGELOG.md`);
  process.exit(1);
}
if (new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`, 'm').test(text)) {
  console.error(`stamp-changelog: CHANGELOG.md already has a section for ${version} — nothing to do`);
  process.exit(0);
}

// Rename the current [Unreleased] to the release, and open a fresh empty [Unreleased] above it.
text = text.replace(unreleased, `## [Unreleased]\n\n## [${version}] - ${today}`);

// Refresh the link footer if present (best-effort; harmless if the repo/anchors differ).
const repo = 'https://github.com/mu-777/dayglassbar';
const links =
  `[Unreleased]: ${repo}/compare/v${version}...HEAD\n` +
  `[${version}]: ${repo}/releases/tag/v${version}`;
if (/^\[Unreleased\]:/m.test(text)) {
  text = text.replace(/^\[Unreleased\]:[^\n]*$/m, links);
}

fs.writeFileSync(changelogPath, text);
console.log(`stamp-changelog: [Unreleased] → [${version}] - ${today}`);
