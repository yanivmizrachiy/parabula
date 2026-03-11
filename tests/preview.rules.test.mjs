import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readText } from './_test-utils.mjs';

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

test('Golden Preview: solid museum background + top-aligned host', async () => {
  const css = await readText(path.join('styles', 'preview.css'));

  assert.ok(/background-color\s*:\s*#eef0f2\b/iu.test(css), 'styles/preview.css: expected museum background #eef0f2');
  assert.ok(
    /\.reader-pageHost\s*\{[\s\S]*?display\s*:\s*block\s*;[\s\S]*?padding-top\s*:\s*20px\s*;[\s\S]*?\}/u.test(css),
    'styles/preview.css: expected .reader-pageHost to be display:block with padding-top:20px'
  );
  assert.ok(/background-image\s*:\s*none/iu.test(css), 'styles/preview.css: expected background-image: none guards (no patterns outside A4)');
});

test('Rules doc must explicitly require /preview topic buttons', async () => {
  const rules = await readText('rules.html');

  assert.ok(rules.includes('/preview'), 'rules.html: expected to mention /preview');
  assert.ok(
    /Reader[^\n]*\/preview[\s\S]*מעבר בין נושאים[\s\S]*כפתורי נושא/iu.test(rules),
    'rules.html: missing explicit requirement for topic buttons inside /preview Reader'
  );
});

test('Preview server must not serve rules.html', async () => {
  const serverCode = await readText(path.join('preview', 'server.mjs'));

  // Regression guard: rules.html is a repo-internal document and must not be exposed via preview.
  assert.ok(/rules\.html/u.test(serverCode), 'preview/server.mjs: expected to reference rules.html');
  assert.ok(
    /isForbiddenForServing\s*\([\s\S]*?rules\.html/u.test(serverCode) ||
      /relPath\s*===\s*['"]rules\.html['"]/u.test(serverCode) ||
      /pathname\s*===\s*['"]\/rules\.html['"]/u.test(serverCode),
    'preview/server.mjs: missing explicit deny rule for rules.html'
  );
  assert.ok(
    /rules\.html[\s\S]*statusCode\s*=\s*404/u.test(serverCode) ||
      /isForbiddenForServing\([\s\S]*?\)\s*\{[\s\S]*statusCode\s*=\s*404/u.test(serverCode),
    'preview/server.mjs: expected 404 response for rules.html'
  );
});

test('preview/index.html must not contain content after </html>', async () => {
  const html = await readText(path.join('preview', 'index.html'));
  const closeTag = '</html>';
  const lastIdx = html.lastIndexOf(closeTag);

  assert.ok(lastIdx !== -1, 'preview/index.html: missing </html> close tag');

  const tail = html.slice(lastIdx + closeTag.length);
  assert.ok(/^\s*$/u.test(tail), 'preview/index.html: found non-whitespace content after </html>');
});

test('Golden Preview: fitA4InHost must be height-first (viewport minus topbar)', async () => {
  const html = await readText(path.join('preview', 'index.html'));

  assert.ok(/function\s+fitA4InHost\s*\(/u.test(html), 'preview/index.html: missing fitA4InHost()');
  assert.ok(/window\.innerHeight/u.test(html), 'preview/index.html: expected fitA4InHost to use window.innerHeight');
  assert.ok(
    /--reader-topbar-h/u.test(html) || /topbar\.getBoundingClientRect\(\)\.height/u.test(html),
    'preview/index.html: expected topbar height usage for scaling'
  );
  assert.ok(/-\s*40\b/u.test(html), 'preview/index.html: expected 40px safety margin in scaling');
});
