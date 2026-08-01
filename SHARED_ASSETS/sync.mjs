#!/usr/bin/env node
/**
 * Copy shared artwork into each app's local asset directory.
 *
 * Why a copy rather than a direct reference: Metro cannot resolve assets outside the
 * Expo project root. `watchFolders` is not enough -- Expo's asset plugin resolves paths
 * relative to projectRoot, so a `../../../SHARED_ASSETS/...` require fails to bundle
 * ("None of these files exist"). Verified by running `expo export`, not assumed.
 *
 * POUCH_APP/frontend does NOT need this: Vite resolves the alias straight out of
 * SHARED_ASSETS with no copy. Only the console gets a synced mirror.
 *
 * The mirror IS committed, deliberately -- CLAUDE.md documents `npx expo start --web`
 * and `npx expo run:android`, which bypass the npm pre* hooks that would generate it,
 * so a fresh clone has to work without running this first. Edit the originals under
 * SHARED_ASSETS; `--check` fails if the mirror has drifted.
 *
 * Usage:  node SHARED_ASSETS/sync.mjs [--check]
 *         --check  exit non-zero if the mirror is stale (for CI)
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync }
  from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CHECK = process.argv.includes('--check');

/** Mirrors: [source dir under SHARED_ASSETS, destination dir] */
const MIRRORS = [
  // The design firm's own delivery, not a hand-curated subset. SHARED_ASSETS/buttons/
  // used to hold a 22-file copy that was byte-identical to the first 22 of these;
  // it was deleted rather than kept in step, so there is one source again.
  [
    join(HERE, 'FOLLI_IMAGES', 'CONSOLE_IMAGES', 'buttons'),
    join(ROOT, 'FOLLI_CONSOLE', 'assets', 'buttons'),
  ],
];

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => statSync(join(dir, f)).isFile())
    .sort();
}

let stale = 0;

for (const [src, dest] of MIRRORS) {
  if (!existsSync(src)) {
    console.error(`missing source: ${src}`);
    process.exit(1);
  }

  const srcFiles = listFiles(src);
  const destFiles = listFiles(dest);
  const differs =
    srcFiles.join('|') !== destFiles.join('|') ||
    srcFiles.some((f) => {
      const a = readFileSync(join(src, f));
      const b = existsSync(join(dest, f)) ? readFileSync(join(dest, f)) : null;
      return b === null || !a.equals(b);
    });

  if (!differs) {
    console.log(`up to date: ${dest.replace(ROOT + '\\', '').replace(ROOT + '/', '')}`);
    continue;
  }

  if (CHECK) {
    console.error(`STALE: ${dest} — run: node SHARED_ASSETS/sync.mjs`);
    stale++;
    continue;
  }

  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(
    `synced ${srcFiles.length} files -> ` +
      dest.replace(ROOT + '\\', '').replace(ROOT + '/', ''),
  );
}

process.exit(stale > 0 ? 1 : 0);
