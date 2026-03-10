import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

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

function hasSelectorBlock(css, selector) {
  // Very lightweight heuristic: selector followed by '{' (ignores minified edge cases but fits this repo's style).
  const re = new RegExp(`${selector}\\s*\\{`, 'u');
  return re.test(css);
}

test('A4 pages: do not override header/page-number UI in page CSS', async () => {
  const dir = path.join(ROOT, 'styles', 'pages');
  const all = await listFilesRecursive(dir);
  const cssFiles = all.filter((f) => f.toLowerCase().endsWith('.css'));
  assert.ok(cssFiles.length > 0, 'No styles/pages/*.css files found');

  /** @type {string[]} */
  const offenders = [];

  for (const abs of cssFiles) {
    const rel = relFromRoot(abs);
    const css = await fs.readFile(abs, 'utf8');

    // Uniform numbering UI: forbid any direct styling of the page number circle.
    if (hasSelectorBlock(css, '\\.(?:page-number)')) {
      offenders.push(`${rel}: must not style .page-number (it is owned by styles/a4-base.css)`);
    }

    // Uniform placement: forbid per-page changes to the header wrapper.
    if (hasSelectorBlock(css, '\\.(?:header-container)')) {
      offenders.push(`${rel}: must not style .header-container (keep header placement uniform)`);
    }
  }

  assert.deepEqual(offenders, [], `Found forbidden header/numbering overrides:\n${offenders.map((s) => ' - ' + s).join('\n')}`);
});
