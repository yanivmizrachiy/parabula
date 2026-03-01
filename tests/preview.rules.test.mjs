import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

async function readText(relPath) {
  const fullPath = path.join(ROOT, relPath);
  return fs.readFile(fullPath, 'utf8');
}

test('/preview Reader must have persistent topic buttons UI', async () => {
  const html = await readText(path.join('preview', 'index.html'));

  assert.ok(/id="topicButtons"/u.test(html), 'preview/index.html: missing id="topicButtons"');
  assert.ok(/class="reader-topics"/u.test(html), 'preview/index.html: missing .reader-topics nav');
  assert.ok(/function\s+buildTopicButtons\s*\(/u.test(html), 'preview/index.html: missing buildTopicButtons()');
  assert.ok(/function\s+setActiveTopicButtons\s*\(/u.test(html), 'preview/index.html: missing setActiveTopicButtons()');
  assert.ok(/openFileInCurrentMode\(/u.test(html), 'preview/index.html: missing openFileInCurrentMode() helper');
});

test('Preview CSS must style topic bar and not hide navigation elements', async () => {
  const css = await readText(path.join('styles', 'preview.css'));

  assert.ok(/\.reader-topics\b/u.test(css), 'styles/preview.css: missing .reader-topics style');
  assert.ok(/\.reader-topicBtn\b/u.test(css), 'styles/preview.css: missing .reader-topicBtn style');

  // Regression guard: previously a rule hid the sidebar entirely.
  assert.ok(!/\.reader-sidebar\s*\{\s*display\s*:\s*none\s*;?\s*\}/u.test(css), 'styles/preview.css: must not set .reader-sidebar { display: none }');
});

test('Rules doc must explicitly require /preview topic buttons', async () => {
  const rules = await readText('rules.html');

  assert.ok(rules.includes('/preview'), 'rules.html: expected to mention /preview');
  assert.ok(
    /Reader[^\n]*\/preview[\s\S]*מעבר בין נושאים[\s\S]*כפתורי נושא/iu.test(rules),
    'rules.html: missing explicit requirement for topic buttons inside /preview Reader'
  );
});
