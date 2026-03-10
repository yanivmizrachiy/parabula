import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { listFilesRecursive, relFromRoot, ROOT } from './_test-utils.mjs';
const PAGES_ROOT = path.join(ROOT, 'pages');
const SITE_ROOT = path.join(ROOT, 'site');

function extractPageBadgeNumber(html) {
  const m = String(html).match(/<div\s+class="page-badge"[^>]*>\s*(\d+)\s*<\/div>/iu);
  return m ? Number(m[1]) : null;
}

function extractPageIndexFromRelPath(relPath) {
  const m = String(relPath).match(/\/עמוד-(\d+)(?:\/index\.html|\.html)$/u);
  return m ? Number(m[1]) : null;
}

test('Topic pages: page-badge number must match the page folder number (pages/<topic>/עמוד-X/index.html)', async () => {
  const st = await fs.stat(PAGES_ROOT).catch(() => null);
  assert.ok(st, 'Missing pages/ directory');

  const files = await listFilesRecursive(PAGES_ROOT);
  const indexFiles = files.filter((f) => /\/עמוד-\d+\/index\.html$/u.test(relFromRoot(f)));
  assert.ok(indexFiles.length > 0, 'No topic page index.html files found under pages/**/עמוד-*/index.html');

  /** @type {string[]} */
  const offenders = [];

  for (const abs of indexFiles) {
    const rel = relFromRoot(abs);
    if (!/^pages\/[^/]+\/עמוד-\d+\/index\.html$/u.test(rel)) continue;

    const expected = extractPageIndexFromRelPath(rel);
    const html = await fs.readFile(abs, 'utf8');
    const actual = extractPageBadgeNumber(html);

    if (!Number.isInteger(expected) || expected <= 0) {
      offenders.push(`${rel}: could not parse expected page index from path`);
      continue;
    }

    if (!Number.isInteger(actual)) {
      offenders.push(`${rel}: missing .page-badge numeric value`);
      continue;
    }

    if (actual !== expected) {
      offenders.push(`${rel}: .page-badge is ${actual} but must be ${expected}`);
    }
  }

  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('Generated site topic pages: page-badge number must match the output filename (site/<topic>/עמוד-X.html)', async () => {
  const st = await fs.stat(SITE_ROOT).catch(() => null);
  assert.ok(st, 'Missing site/ directory (build output)');

  const files = await listFilesRecursive(SITE_ROOT);
  const pageFiles = files.filter((f) => /\/עמוד-\d+\.html$/u.test(relFromRoot(f)));
  assert.ok(pageFiles.length > 0, 'No site/**/עמוד-*.html files found');

  /** @type {string[]} */
  const offenders = [];

  for (const abs of pageFiles) {
    const rel = relFromRoot(abs);
    if (!/^site\/[^/]+\/עמוד-\d+\.html$/u.test(rel)) continue;

    const expected = extractPageIndexFromRelPath(rel);
    const html = await fs.readFile(abs, 'utf8');
    const actual = extractPageBadgeNumber(html);

    if (!Number.isInteger(expected) || expected <= 0) {
      offenders.push(`${rel}: could not parse expected page index from path`);
      continue;
    }

    if (!Number.isInteger(actual)) {
      offenders.push(`${rel}: missing .page-badge numeric value`);
      continue;
    }

    if (actual !== expected) {
      offenders.push(`${rel}: .page-badge is ${actual} but must be ${expected}`);
    }
  }

  assert.deepEqual(offenders, [], offenders.join('\n'));
});
