// Print the CHANGELOG.md section for one version, for use as a GitHub Release body.
// Called by .github/workflows/build.yml when it publishes a release:
//   node tools/extract-changelog.mjs "${TAG#v}" > RELEASE_NOTES.md
//
// Emits everything between `## [<version>]` and the next `## ` heading (link-reference
// lines like `[0.1.0]: …` are dropped). If the section is missing or empty it prints a
// safe fallback so the release still publishes rather than failing the workflow.
//
// `--strict` turns that fallback into an error (exit 1, nothing on stdout). This is the
// pre-flight gate in .github/workflows/release.yml: the tag is only created once the
// changelog actually has content for the version, so a bumped package.json with an
// unwritten `[Unreleased]` fails loudly instead of publishing an empty release.
// Dependency-free (fs only), like the other tools/ scripts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const version = (args.find((a) => !a.startsWith('--')) || '').trim();
if (!version) {
  console.error('usage: node tools/extract-changelog.mjs [--strict] <version>');
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lines = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').split('\n');

const heading = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\]`);
const start = lines.findIndex((l) => heading.test(l));

let body = '';
if (start !== -1) {
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^## /.test(l));
  body = (end === -1 ? rest : rest.slice(0, end))
    .filter((l) => !/^\[[^\]]+\]:\s/.test(l)) // drop link-reference definitions
    .join('\n')
    .replace(/<!--[\s\S]*?-->/g, '') // drop any HTML comments (guidance notes)
    .trim();
}

if (!body && strict) {
  console.error(
    start === -1
      ? `extract-changelog: CHANGELOG.md has no "## [${version}]" section`
      : `extract-changelog: the "## [${version}]" section of CHANGELOG.md is empty`,
  );
  process.exit(1);
}

process.stdout.write(body ? body + '\n' : `Release v${version}. See CHANGELOG.md for details.\n`);
