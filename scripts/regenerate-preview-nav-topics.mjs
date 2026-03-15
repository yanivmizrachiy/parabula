import fs from 'node:fs/promises';
import path from 'node:path';

function pageNumberFromFilename(filename) {
  const match = filename.match(/^עמוד-(\d+)\.html$/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function stripHtml(text) {
  return String(text)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractNavMeta(html) {
  const match = html.match(/<div\s+class="nav-meta"[^>]*>([\s\S]*?)<\/div>/iu);
  if (!match) return null;

  const navMetaText = stripHtml(match[1]);
  const m = navMetaText.match(/^(.*?)\s*—\s*עמוד\s*(\d+)\s*\/\s*(\d+)\s*$/u);
  if (!m) return null;

  return {
    topic: m[1].trim(),
    pageIndex: Number(m[2]),
    pageTotal: Number(m[3]),
  };
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

function buildTopicsBlock({ topics, currentTopic, currentPageHref, indent }) {
  const baseIndent = indent ?? '      ';
  const childIndent = `${baseIndent}  `;

  const lines = [];
  lines.push(`${baseIndent}<div class="preview-nav-topics" aria-label="מעבר בין נושאים">`);

  for (const topic of topics) {
    const isActive = topic.name === currentTopic;
    const className = isActive ? 'topic-link is-active' : 'topic-link';
    const aria = isActive ? ' aria-current="page"' : '';
    const href = isActive ? currentPageHref : topic.href;
    lines.push(`${childIndent}<a class="${className}" href="${href}"${aria}>${topic.name}</a>`);
  }

  lines.push(`${baseIndent}</div>`);
  return lines.join('\n');
}

async function main() {
  const workspaceRoot = process.cwd();
  const dirEntries = await fs.readdir(workspaceRoot, { withFileTypes: true });

  const pageFiles = dirEntries
    .filter((d) => d.isFile() && /^עמוד-\d+\.html$/.test(d.name))
    .map((d) => d.name)
    .map((name) => ({ name, num: pageNumberFromFilename(name) }))
    .filter((p) => Number.isFinite(p.num))
    .sort((a, b) => a.num - b.num);

  const pages = [];
  for (const page of pageFiles) {
    const filePath = path.join(workspaceRoot, page.name);
    const html = await fs.readFile(filePath, 'utf8');
    const navMeta = extractNavMeta(html);
    const topicOrderHints = parseTopicOrderHints(html);
    pages.push({ ...page, filePath, html, navMeta, topicOrderHints });
  }

  // Stable order hint: choose the longest existing list (mirrors tests behavior)
  let bestTopicOrder = [];
  for (const page of pages) {
    const hints = page.topicOrderHints ?? [];
    if (hints.length > bestTopicOrder.length) bestTopicOrder = hints;
  }

  // Determine canonical href per topic: prefer pageIndex=1, else smallest file number.
  /** @type {Map<string, {href: string, fileNum: number, pageIndex: number}>} */
  const topicToStart = new Map();
  for (const page of pages) {
    const topic = page.navMeta?.topic;
    if (!topic) continue;

    const fileNum = page.num;
    const pageIndex = page.navMeta?.pageIndex ?? Number.NaN;

    const existing = topicToStart.get(topic);
    const isBetter =
      !existing ||
      (pageIndex === 1 && existing.pageIndex !== 1) ||
      (pageIndex === existing.pageIndex && fileNum < existing.fileNum);

    if (isBetter) {
      topicToStart.set(topic, { href: page.name, fileNum, pageIndex });
    }
  }

  const allTopics = Array.from(topicToStart.keys());
  const orderedNames = [];
  for (const name of bestTopicOrder) {
    if (topicToStart.has(name) && !orderedNames.includes(name)) orderedNames.push(name);
  }

  const missing = allTopics.filter((t) => !orderedNames.includes(t)).sort((a, b) => a.localeCompare(b, 'he'));
  orderedNames.push(...missing);

  const topics = orderedNames.map((name) => ({ name, href: topicToStart.get(name).href }));

  let updated = 0;
  for (const page of pages) {
    const currentTopic = page.navMeta?.topic;
    if (!currentTopic) continue;

    const existingBlockMatch = page.html.match(/(^[\t ]*)<div\s+class="preview-nav-topics"[\s\S]*?<\/div>/imu);
    const indentRaw = existingBlockMatch ? existingBlockMatch[1] : '      ';
    // Guard against pathological whitespace indentation that can cause visible layout glitches.
    const indent = indentRaw.length > 12 ? '      ' : indentRaw;
    const newBlock = buildTopicsBlock({ topics, currentTopic, currentPageHref: page.name, indent });

    // Replace including leading indentation at line start.
    const blockRegex = /^[\t ]*<div\s+class="preview-nav-topics"[\s\S]*?<\/div>/imu;
    let patched = page.html;

    if (blockRegex.test(patched)) {
      patched = patched.replace(blockRegex, newBlock);
    } else {
      // Insert right after .preview-nav-top (before closing </nav>)
      const navTopRe = /(<div\s+class="preview-nav-top"[\s\S]*?<\/div>)/iu;
      if (navTopRe.test(patched)) {
        patched = patched.replace(navTopRe, `$1\n${newBlock}`);
      } else {
        // Fallback: insert before closing nav
        patched = patched.replace(/<\/nav>/iu, `${newBlock}\n</nav>`);
      }
    }

    if (patched !== page.html) {
      await fs.writeFile(page.filePath, patched, 'utf8');
      updated += 1;
    }
  }

  console.log(`regenerate-preview-nav-topics: updated ${updated} pages, topics=${topics.length}`);
  for (const topic of topics) {
    console.log(`- ${topic.name} -> ${topic.href}`);
  }
}

await main();
