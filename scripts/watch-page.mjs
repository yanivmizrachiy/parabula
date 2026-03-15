#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { watch } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = { testFile: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--testFile' || a === '--test-file') {
      out.testFile = String(argv[i + 1] || '');
      i++;
      continue;
    }
    if (a.startsWith('--testFile=')) {
      out.testFile = a.slice('--testFile='.length);
      continue;
    }
    if (a.startsWith('--test-file=')) {
      out.testFile = a.slice('--test-file='.length);
      continue;
    }
  }
  return out;
}

function toPosix(p) {
  return String(p || '').replace(/\\/g, '/');
}

function isRelevant(relPosix) {
  if (!relPosix) return false;

  const base = path.posix.basename(relPosix);
  if (/^עמוד-\d+\.html$/u.test(base)) return true;

  if (relPosix.startsWith('styles/pages/') && relPosix.toLowerCase().endsWith('.css')) return true;

  if (relPosix.startsWith('preview/')) {
    const ext = path.posix.extname(relPosix).toLowerCase();
    if (['.html', '.css', '.js', '.mjs'].includes(ext)) return true;
  }

  return false;
}

function runNodeTest(testFileRel) {
  const nodeArgs = ['--test'];
  if (testFileRel) nodeArgs.push(testFileRel);

  return spawn(process.execPath, nodeArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });
}

const { testFile } = parseArgs(process.argv.slice(2));

if (!testFile) {
  console.error('Missing required argument: --testFile <path>');
  console.error('Example: node scripts/watch-page.mjs --testFile tests/עמוד-2.test.mjs');
  process.exit(2);
}

const testFileRel = toPosix(testFile);

let running = false;
let pending = false;
let debounceTimer = null;

function scheduleRun(reason) {
  pending = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void maybeRun(reason);
  }, 150);
}

async function maybeRun(reason) {
  if (!pending) return;
  if (running) return;

  pending = false;
  running = true;

  process.stdout.write(`\n[watch] running tests (${reason})…\n`);

  await new Promise((resolve) => {
    const child = runNodeTest(testFileRel);
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });

  running = false;

  if (pending) {
    scheduleRun('changes while running');
  }
}

// Initial run
scheduleRun('initial');

// Watch for relevant changes
try {
  watch(
    ROOT,
    { recursive: true },
    (_eventType, filename) => {
      if (!filename) return;
      const rel = toPosix(path.relative(ROOT, path.resolve(ROOT, filename)));
      if (!isRelevant(rel)) return;
      scheduleRun(rel);
    }
  );

  process.stdout.write(`[watch] watching: עמוד-*.html, styles/pages/*.css, preview/*\n`);
  process.stdout.write(`[watch] test file: ${testFileRel}\n`);
} catch (err) {
  console.error('Failed to start watcher:', err);
  process.exit(1);
}
