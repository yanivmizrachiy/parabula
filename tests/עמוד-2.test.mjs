import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

async function readText(relPath) {
  const fullPath = path.join(ROOT, relPath);
  return fs.readFile(fullPath, 'utf8');
}

function countMatches(re, text) {
  const m = text.match(re);
  return m ? m.length : 0;
}

test('Pythagoras topic page 2 (עמוד-10.html): has 6 SVG triangle problems and solutions footer', async () => {
  const html = await readText('עמוד-10.html');

  // Required unified wrapper (must match page 1 layout)
  assert.ok(/class="pyt-body"/u.test(html), 'עמוד-10.html: missing .pyt-body');

  // Grid + 6 items
  assert.ok(/class="pyt-tri-grid"/u.test(html), 'עמוד-10.html: missing .pyt-tri-grid');
  assert.equal(countMatches(/class="problem-block\b/gu, html), 6, 'עמוד-10.html: expected 6 .problem-block entries');

  // Must be SVG based
  assert.equal(countMatches(/<svg\b/gu, html), 6, 'עמוד-10.html: expected 6 <svg> elements');

  // MathJax inline math only (no $ delimiters)
  assert.ok(!/\$/u.test(html), 'עמוד-10.html: must not contain $ math delimiters');
  assert.ok(/\\\(x\\\)/u.test(html), 'עמוד-10.html: expected MathJax inline \(x\)');

  // Footer requirement
  assert.ok(/class="pyt-footer"/u.test(html), 'עמוד-10.html: missing .pyt-footer');
  assert.ok(html.includes('תשובות:'), 'עמוד-10.html: missing "תשובות:" label');
  assert.equal(countMatches(/class="pyt-solution\b/gu, html), 6, 'עמוד-10.html: expected 6 .pyt-solution entries');

  // Navigation: active topic link must have aria-current
  assert.ok(
    /<a\s+class="topic-link\s+is-active"[^>]*aria-current="page"[^>]*>\s*משפט פיתגורס\s*<\/a>/u.test(html),
    'עמוד-10.html: active topic link must include aria-current="page"'
  );
});

test('Pythagoras topic page 2 CSS: triangle containers use 44px multiples', async () => {
  const css = await readText(path.join('styles', 'pages', 'עמוד-10.css'));

  // Unified layout must match page 1 sizing primitives
  assert.ok(/\.page-10\s*\{[\s\S]*?--problem-block-height\s*:\s*314px\s*;[\s\S]*?\}/u.test(css), 'styles/pages/עמוד-10.css: .page-10 must set --problem-block-height: 314px');
  assert.ok(/\.page-10\s+\.solution-space\s*\{[\s\S]*?background-size\s*:\s*22px\s+22px\s*;[\s\S]*?\}/u.test(css), 'styles/pages/עמוד-10.css: .solution-space must use 22px grid');
});
