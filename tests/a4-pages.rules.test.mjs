import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function isA4PageFile(relPath) {
  return /^עמוד-\d+\.html$/u.test(relPath);
}

async function readText(relPath) {
  const fullPath = path.join(ROOT, relPath);
  return fs.readFile(fullPath, 'utf8');
}

async function listRootHtmlFiles() {
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.html'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, 'he'));
}

function stripHtml(text) {
  return String(text)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTopicOrderHints(html) {
  const topicBlockMatch = html.match(/<div\s+class="preview-nav-topics"[\s\S]*?<\/div>/iu);
  const block = topicBlockMatch ? topicBlockMatch[0] : '';
  if (!block) return [];

  const names = [];
  const re = /<a\s+class="topic-link[^"]*"[\s\S]*?>([\s\S]*?)<\/a>/giu;
  let m;
  while ((m = re.exec(block))) {
    const name = stripHtml(m[1]);
    if (!name) continue;
    names.push(name);
  }
  return names;
}

function parseNavHref(html, label) {
  const aRe = new RegExp(`<a\\b[^>]*\\bclass="nav-link[^"]*"[^>]*\\bhref="([^"]+)"[^>]*>\\s*${label}\\s*<\\/a>`, 'iu');
  const spanDisabledRe = new RegExp(
    `<span\\b[^>]*\\bclass="nav-link[^"]*\\bis-disabled\\b[^"]*"[^>]*>\\s*${label}\\s*<\\/span>`,
    'iu'
  );
  const a = html.match(aRe);
  if (a) return { href: stripHtml(a[1]), disabled: false };
  const disabled = spanDisabledRe.test(html);
  return { href: '', disabled };
}

function matchOne(re, text, fileLabel) {
  const m = text.match(re);
  assert.ok(m, `${fileLabel}: expected to match ${String(re)}`);
  return m;
}

function mustNotMatch(re, text, fileLabel, message) {
  assert.ok(!re.test(text), `${fileLabel}: ${message}`);
}

function escapeRegExpLiteral(text) {
  // Escape only actual regex metacharacters. Do not escape '-' (can become an invalid escape under /u).
  return String(text).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

test('Global HTML rule: no inline CSS (<style> or style="...")', async () => {
  const htmlFiles = await listRootHtmlFiles();
  assert.ok(htmlFiles.length > 0, 'No .html files found in repo root');

  for (const file of htmlFiles) {
    const html = await readText(file);

    mustNotMatch(/<style\b/i, html, file, 'Inline <style> tag is forbidden');
    mustNotMatch(/\sstyle\s*=\s*(['"])/i, html, file, 'Inline style="..." attribute is forbidden');
  }
});

test('A4 pages: required structure, CSS links, preview nav, and consistent numbering', async () => {
  const htmlFiles = await listRootHtmlFiles();
  const pageFiles = htmlFiles.filter(isA4PageFile);
  assert.ok(pageFiles.length > 0, 'No עמוד-*.html files found');

  /** @type {Map<string, {total: number, pages: Map<number, string>}>} */
  const topicToPages = new Map();

  for (const file of pageFiles) {
    const html = await readText(file);

    const fileNum = Number(matchOne(/^עמוד-(\d+)\.html$/u, file, file)[1]);

    // Required base structure
    assert.ok(/<main\s+class="a4-page\b[^"]*\bpage-\d+\b[^"]*"/u.test(html), `${file}: missing <main class="a4-page page-N">`);
    assert.ok(/<header\s+class="header-container"/u.test(html), `${file}: missing .header-container`);
    assert.ok(/class="page-title"/u.test(html), `${file}: missing .page-title`);

    // CSS links (robust matching across formatting/attribute order)
    assert.ok(
      /<link\b[^>]*\brel\s*=\s*"stylesheet"[^>]*\bhref\s*=\s*"styles\/a4-base\.css"[^>]*>/u.test(html) ||
        /<link\b[^>]*\bhref\s*=\s*"styles\/a4-base\.css"[^>]*\brel\s*=\s*"stylesheet"[^>]*>/u.test(html),
      `${file}: missing styles/a4-base.css stylesheet link`
    );

    const pageCssHref = `styles/pages/עמוד-${fileNum}.css`;
    const pageCssHrefRe = escapeRegExpLiteral(pageCssHref);
    assert.ok(
      new RegExp(`<link\\b[^>]*\\brel\\s*=\\s*"stylesheet"[^>]*\\bhref\\s*=\\s*"${pageCssHrefRe}"[^>]*>`, 'u').test(html) ||
        new RegExp(`<link\\b[^>]*\\bhref\\s*=\\s*"${pageCssHrefRe}"[^>]*\\brel\\s*=\\s*"stylesheet"[^>]*>`, 'u').test(html),
      `${file}: missing ${pageCssHref} stylesheet link`
    );

    // Preview nav requirements
    assert.ok(/<nav\s+class="preview-nav"/u.test(html), `${file}: missing .preview-nav`);
    assert.ok(/class="preview-nav-topics"/u.test(html), `${file}: missing .preview-nav-topics`);
    const topicLinks = [...html.matchAll(/<a\s+class="topic-link[^"]*"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/giu)];
    assert.ok(topicLinks.length >= 2, `${file}: expected >= 2 .topic-link entries`);

    // Topic/page meta
    const navMeta = matchOne(/<div\s+class="nav-meta"[^>]*>([\s\S]*?)<\/div>/iu, html, file)[1]
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const metaMatch = matchOne(/^(.*?)\s*—\s*עמוד\s*(\d+)\s*\/\s*(\d+)\s*$/u, navMeta, file);
    const topicName = metaMatch[1].trim();
    const pageIndex = Number(metaMatch[2]);
    const pageTotal = Number(metaMatch[3]);

    // Title should reflect per-topic numbering (pageIndex), not the file's global number.
    const title = matchOne(/<title[^>]*>([\s\S]*?)<\/title>/iu, html, file)[1].replace(/\s+/g, ' ').trim();
    assert.ok(title.includes(`עמוד ${pageIndex}`), `${file}: <title> must include per-topic page index "עמוד ${pageIndex}"`);
    assert.ok(title.includes(topicName), `${file}: <title> must include topic name "${topicName}"`);

    assert.ok(topicName.length > 0, `${file}: topic name in .nav-meta is empty`);
    assert.ok(Number.isInteger(pageIndex) && pageIndex > 0, `${file}: invalid page index in .nav-meta`);
    assert.ok(Number.isInteger(pageTotal) && pageTotal > 0, `${file}: invalid page total in .nav-meta`);
    assert.ok(pageIndex <= pageTotal, `${file}: page index > page total in .nav-meta`);

    const circleNum = matchOne(/<div\s+class="page-number"[^>]*>\s*(\d+)\s*<\/div>/iu, html, file)[1];
    assert.equal(Number(circleNum), pageIndex, `${file}: .page-number must equal nav-meta page index`);

    if (!topicToPages.has(topicName)) {
      topicToPages.set(topicName, { total: pageTotal, pages: new Map() });
    }

    const topicInfo = topicToPages.get(topicName);
    assert.equal(topicInfo.total, pageTotal, `${file}: pageTotal mismatch within topic "${topicName}"`);
    assert.ok(!topicInfo.pages.has(pageIndex), `${file}: duplicate page index ${pageIndex} within topic "${topicName}" (already used by ${topicInfo.pages.get(pageIndex)})`);
    topicInfo.pages.set(pageIndex, file);

    // Topic links should contain the current topic somewhere marked active
    const hasActive = /class="topic-link[^"]*\bis-active\b[^"]*"/u.test(html);
    assert.ok(hasActive, `${file}: expected an active .topic-link (is-active) for current topic`);
  }

  // Strict: for each topic, require complete 1..total coverage.
  for (const [topicName, info] of topicToPages.entries()) {
    for (let i = 1; i <= info.total; i++) {
      assert.ok(info.pages.has(i), `Topic "${topicName}": missing page index ${i} / ${info.total}`);
    }
  }
});

test('A4 pages: preview prev/next links match global reading order', async () => {
  const htmlFiles = await listRootHtmlFiles();
  const pageFiles = htmlFiles.filter(isA4PageFile);
  assert.ok(pageFiles.length > 0, 'No עמוד-*.html files found');

  /** @type {{file: string, topic: string, pageIndex: number, pageTotal: number, topicOrderHints: string[], prev: {href: string, disabled: boolean}, next: {href: string, disabled: boolean}}[]} */
  const entries = [];

  let bestTopicOrder = [];

  for (const file of pageFiles) {
    const html = await readText(file);

    const navMeta = matchOne(/<div\s+class="nav-meta"[^>]*>([\s\S]*?)<\/div>/iu, html, file)[1];
    const navMetaText = stripHtml(navMeta);
    const m = matchOne(/^(.*?)\s*—\s*עמוד\s*(\d+)\s*\/\s*(\d+)\s*$/u, navMetaText, file);
    const topic = m[1].trim() || 'אחר';
    const pageIndex = Number(m[2]);
    const pageTotal = Number(m[3]);

    const hints = parseTopicOrderHints(html);
    if (hints.length > bestTopicOrder.length) bestTopicOrder = hints;

    const prev = parseNavHref(html, 'הקודם');
    const next = parseNavHref(html, 'הבא');

    entries.push({ file, topic, pageIndex, pageTotal, topicOrderHints: hints, prev, next });
  }

  /** @type {Map<string, {name: string, total: number, pages: {file: string, pageIndex: number}[]}>} */
  const topicsMap = new Map();

  for (const e of entries) {
    const key = e.topic || 'אחר';
    if (!topicsMap.has(key)) topicsMap.set(key, { name: key, total: e.pageTotal, pages: [] });
    topicsMap.get(key).pages.push({ file: e.file, pageIndex: e.pageIndex });
  }

  const topics = Array.from(topicsMap.values());
  for (const t of topics) t.pages.sort((a, b) => a.pageIndex - b.pageIndex);

  topics.sort((a, b) => {
    const aIsOther = a.name === 'אחר';
    const bIsOther = b.name === 'אחר';
    if (aIsOther !== bIsOther) return aIsOther ? 1 : -1;

    const ai = bestTopicOrder.indexOf(a.name);
    const bi = bestTopicOrder.indexOf(b.name);
    const aKnown = ai >= 0;
    const bKnown = bi >= 0;
    if (aKnown && bKnown) return ai - bi;
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    return a.name.localeCompare(b.name, 'he');
  });

  const flat = topics.flatMap((t) => t.pages.map((p) => p.file));
  assert.equal(flat.length, entries.length, 'Flattened order must include all pages');

  /** @type {Map<string, {prev: {href: string, disabled: boolean}, next: {href: string, disabled: boolean}}>} */
  const navByFile = new Map(entries.map((e) => [e.file, { prev: e.prev, next: e.next }]));

  for (let i = 0; i < flat.length; i++) {
    const file = flat[i];
    const nav = navByFile.get(file);
    assert.ok(nav, `Missing nav info for ${file}`);

    const expectedPrev = i > 0 ? flat[i - 1] : '';
    const expectedNext = i < flat.length - 1 ? flat[i + 1] : '';

    if (!expectedPrev) {
      assert.ok(nav.prev.disabled, `${file}: first page must have disabled "הקודם"`);
    } else {
      assert.equal(nav.prev.href, expectedPrev, `${file}: "הקודם" must link to ${expectedPrev}`);
    }

    if (!expectedNext) {
      assert.ok(nav.next.disabled, `${file}: last page must have disabled "הבא"`);
    } else {
      assert.equal(nav.next.href, expectedNext, `${file}: "הבא" must link to ${expectedNext}`);
    }
  }
});
