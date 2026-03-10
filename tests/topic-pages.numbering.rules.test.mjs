import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PAGES_ROOT = path.join(ROOT, 'pages');

async function listFilesRecursive(dir) {
  /** @type {string[]} */
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await listFilesRecursive(full)));
    } else if (e.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function relFromRoot(absPath) {
  return path.relative(ROOT, absPath).replace(/\\/g, '/');
}

test('Topic pages: page-number badge styling must come from one canonical topic stylesheet', async () => {
  // Rule: A topic may have a canonical stylesheet at pages/<topic>/style.css.
  // Disallow per-page style.css at pages/<topic>/עמוד-*/style.css to avoid drift.
  if (!(await fs.stat(PAGES_ROOT).catch(() => null))) {
    assert.fail('Missing pages/ directory');
  }

  const files = await listFilesRecursive(PAGES_ROOT);
  const cssFiles = files.filter((f) => f.toLowerCase().endsWith('.css'));

  const forbidden = cssFiles.filter((abs) => /\/עמוד-\d+\/style\.css$/u.test(relFromRoot(abs)));
  assert.deepEqual(
    forbidden,
    [],
    `Per-page topic stylesheets are forbidden (must use pages/<topic>/style.css only). Found:\n${forbidden
      .map((f) => ' - ' + relFromRoot(f))
      .join('\n')}`
  );
});

test('Topic pages: must link the shared topic stylesheet (../style.css)', async () => {
  const files = await listFilesRecursive(PAGES_ROOT);
  const htmlFiles = files.filter((f) => f.toLowerCase().endsWith('.html'));

  const indexFiles = htmlFiles.filter((f) => path.basename(f).toLowerCase() === 'index.html');
  assert.ok(indexFiles.length > 0, 'No pages/**/index.html files found');

  for (const abs of indexFiles) {
    const rel = relFromRoot(abs);
    const html = await fs.readFile(abs, 'utf8');

    // If the page is nested one level under a topic, it must link ../style.css.
    // (We keep this strict so page badges stay consistent across the topic.)
    if (/^pages\/[^/]+\/עמוד-\d+\/index\.html$/u.test(rel)) {
      assert.ok(
        /<link\b[^>]*\brel\s*=\s*"stylesheet"[^>]*\bhref\s*=\s*"\.\.\/style\.css"[^>]*>/iu.test(html) ||
          /<link\b[^>]*\bhref\s*=\s*"\.\.\/style\.css"[^>]*\brel\s*=\s*"stylesheet"[^>]*>/iu.test(html),
        `${rel}: missing shared topic stylesheet link ../style.css`
      );

      assert.ok(!/href\s*=\s*"style\.css"/iu.test(html), `${rel}: must not link a local style.css (use ../style.css)`);
    }
  }
});

test('Topic pages: page-badge must use canonical blue (var(--title-blue))', async () => {
  // Rule: page numbering UI must be visually uniform across the project.
  // For topic pages, the circular badge `.page-badge` must use var(--title-blue)
  // (no red accents / per-topic number color drift).

  const entries = await fs.readdir(PAGES_ROOT, { withFileTypes: true });
  const topicDirs = entries.filter((e) => e.isDirectory()).map((e) => path.join(PAGES_ROOT, e.name));
  assert.ok(topicDirs.length > 0, 'No topic directories found under pages/');

  /** @type {string[]} */
  const offenders = [];

  for (const dir of topicDirs) {
    const cssPath = path.join(dir, 'style.css');
    const st = await fs.stat(cssPath).catch(() => null);
    if (!st) continue;

    const rel = relFromRoot(cssPath);
    const css = await fs.readFile(cssPath, 'utf8');

    // Only enforce if the topic actually defines a page badge.
    if (!/\.page-badge\s*\{/u.test(css)) continue;

    const hasBlueBorder = /\.page-badge\s*\{[^}]*\bborder\s*:\s*[^;]*var\(--title-blue\)/isu.test(css);
    const hasBlueText = /\.page-badge\s*\{[^}]*\bcolor\s*:\s*var\(--title-blue\)\s*;/isu.test(css);
    const mentionsAccentRed = /--accent-red\b|var\(--accent-red\)/iu.test(css);

    if (!hasBlueBorder || !hasBlueText || mentionsAccentRed) {
      offenders.push(
        `${rel}: .page-badge must use var(--title-blue) for border+color and must not depend on --accent-red`
      );
    }
  }

  assert.deepEqual(offenders, [], offenders.join('\n'));
});
