import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

const ROOT = process.cwd();
const PAGE_FILE_RE = /^עמוד-(\d+)\.html$/u;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchOk(url) {
  const res = await fetch(url, { redirect: 'manual' });
  if (res.status !== 200) {
    const body = await res.text().catch(() => '');
    throw new Error(`Expected 200 for ${url}, got ${res.status}${body ? `\n${body.slice(0, 500)}` : ''}`);
  }
  return res;
}

function stripHtml(text) {
  return String(text)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNavMetaFromHtml(html, fileLabel) {
  const navMetaMatch = html.match(/<div\s+class="nav-meta"[^>]*>([\s\S]*?)<\/div>/iu);
  if (!navMetaMatch) throw new Error(`${fileLabel}: missing .nav-meta`);
  const navMetaText = stripHtml(navMetaMatch[1]);

  const m = navMetaText.match(/^(.*?)\s*—\s*עמוד\s*(\d+)\s*\/\s*(\d+)\s*$/u);
  if (!m) throw new Error(`${fileLabel}: invalid .nav-meta format: ${navMetaText}`);

  return {
    topic: m[1].trim(),
    pageIndex: Number(m[2]),
    pageTotal: Number(m[3])
  };
}

function extractTopicsBlock(html) {
  const m = html.match(/<div\s+class="preview-nav-topics"[\s\S]*?<\/div>/iu);
  return m ? m[0] : '';
}

function buildNewPageHtml({
  fileName,
  fileNum,
  topic,
  pageIndex,
  pageTotal,
  prevFile,
  topicsBlock
}) {
  // Ensure current topic is marked active and points to the new file.
  let topicsHtml = topicsBlock || '';
  if (topicsHtml) {
    topicsHtml = topicsHtml.replace(/\bis-active\b/u, '');
    topicsHtml = topicsHtml.replace(/\s+aria-current="page"/gu, '');

    const linkRe = /<a\s+class="topic-link[^\"]*"\s+href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/giu;
    let replaced = false;
    topicsHtml = topicsHtml.replace(linkRe, (full, href, attrs, inner) => {
      const name = stripHtml(inner);
      if (name !== topic) return full;
      replaced = true;
      return `<a class="topic-link is-active" href="${fileName}" aria-current="page">${inner}</a>`;
    });

    if (!replaced) {
      // Fallback: keep block as-is; tests require >=2 links and one active.
      // We'll append a new active link for the topic.
      topicsHtml = topicsHtml.replace(/<\/div>\s*$/u, `\n        <a class="topic-link is-active" href="${fileName}" aria-current="page">${topic}</a>\n      </div>`);
    }
  } else {
    topicsHtml = `<div class="preview-nav-topics" aria-label="מעבר בין נושאים">\n        <a class="topic-link is-active" href="${fileName}" aria-current="page">${topic}</a>\n      </div>`;
  }

  return `<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>עמוד ${pageIndex} — ${topic}</title>

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500&display=swap" rel="stylesheet" />

    <script>
      MathJax = { tex: { inlineMath: [["\\(", "\\)"]] } };
    </script>
    <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>

    <link rel="stylesheet" href="styles/a4-base.css" />
    <link rel="stylesheet" href="styles/pages/עמוד-${fileNum}.css" />
  </head>
  <body>
    <nav class="preview-nav" aria-label="ניווט בין עמודים">
      <div class="preview-nav-top">
        <div class="nav-side">
          <a class="nav-link" href="${prevFile}">הקודם</a>
        </div>
        <div class="nav-meta">${topic} — עמוד ${pageIndex} / ${pageTotal}</div>
        <div class="nav-side">
          <span class="nav-link is-disabled" aria-disabled="true">הבא</span>
        </div>
      </div>
      ${topicsHtml}
    </nav>

    <main class="a4-page page-${fileNum}">
      <header class="header-container">
        <h1 class="page-title">${topic}</h1>
        <div class="page-number">${pageIndex}</div>
      </header>

      <div class="question-block">
        <div class="q-main">
          <div class="bullet-container"><div class="bullet-large"></div></div>
          <div class="q-text">תוכן חדש</div>
        </div>
      </div>
    </main>
  </body>
</html>
`;
}

function updateTopicTotalInHtml(html, topic, newTotal) {
  return html.replace(
    /(<div\s+class="nav-meta"[^>]*>)([\s\S]*?)(<\/div>)/iu,
    (full, open, inner, close) => {
      const text = stripHtml(inner);
      const m = text.match(/^(.*?)\s*—\s*עמוד\s*(\d+)\s*\/\s*(\d+)\s*$/u);
      if (!m) return full;
      const t = m[1].trim();
      const idx = Number(m[2]);
      if (t !== topic) return full;
      return `${open}${topic} — עמוד ${idx} / ${newTotal}${close}`;
    }
  );
}

function updateNextLinkInHtml(html, nextFile) {
  // Replace a disabled 'הבא' span with a link, or update existing link href.
  if (/<span\b[^>]*\bclass="nav-link[^\"]*\bis-disabled\b[^\"]*"[^>]*>\s*הבא\s*<\/span>/iu.test(html)) {
    return html.replace(
      /<span\b[^>]*\bclass="nav-link[^\"]*\bis-disabled\b[^\"]*"[^>]*>\s*הבא\s*<\/span>/iu,
      `<a class="nav-link" href="${nextFile}">הבא</a>`
    );
  }

  // Otherwise update href of the next link in the nav-top right side.
  return html.replace(
    /(<div\s+class="nav-side">\s*)(<a\b[^>]*\bclass="nav-link"[^>]*\bhref=")([^"]+)("[^>]*>\s*הבא\s*<\/a>)/iu,
    `$1$2${nextFile}$4`
  );
}

async function listRootPages() {
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  const pages = entries
    .filter((e) => e.isFile() && PAGE_FILE_RE.test(e.name))
    .map((e) => e.name);

  pages.sort((a, b) => {
    const ai = Number(a.match(PAGE_FILE_RE)?.[1] || 0);
    const bi = Number(b.match(PAGE_FILE_RE)?.[1] || 0);
    return ai - bi;
  });

  return pages;
}

async function startPreviewServer() {
  const child = spawn(process.execPath, ['preview/server.mjs'], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '0'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const start = Date.now();
  const timeoutMs = 15_000;

  while (Date.now() - start < timeoutMs) {
    const m = stdout.match(/Preview server running:\s*(http:\/\/[^\s]+)\//u);
    if (m) {
      const base = m[1];
      return { child, base, getLogs: () => ({ stdout, stderr }) };
    }

    if (child.exitCode != null) {
      const logs = { stdout, stderr };
      throw new Error(`Preview server exited early (code=${child.exitCode}).\nSTDOUT:\n${logs.stdout}\nSTDERR:\n${logs.stderr}`);
    }

    await sleep(50);
  }

  const logs = { stdout, stderr };
  throw new Error(`Timed out waiting for preview server to start.\nSTDOUT:\n${logs.stdout}\nSTDERR:\n${logs.stderr}`);
}

async function stopPreviewServer(child) {
  if (!child || child.exitCode != null) return;

  child.kill('SIGTERM');

  const start = Date.now();
  const timeoutMs = 5_000;
  while (Date.now() - start < timeoutMs) {
    if (child.exitCode != null) return;
    await sleep(50);
  }

  try {
    child.kill('SIGKILL');
  } catch {
    // ignore
  }
}

async function runGuardrails(base, files) {
  const browser = await puppeteer.launch({ headless: 'new' });

  try {
    const page = await browser.newPage();

    // Avoid hanging on external fonts/MathJax; we only need layout stability.
    page.setDefaultNavigationTimeout(45_000);
    page.setDefaultTimeout(45_000);

    const failures = [];

    for (const file of files) {
      const url = `${base}/${encodeURIComponent(file)}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // Best-effort: wait for fonts/MathJax (bounded) so measurements are closer to print.
      await page.evaluate(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const tasks = [];

        try {
          if (document.fonts && document.fonts.ready) {
            tasks.push(document.fonts.ready.catch(() => undefined));
          }
        } catch {
          // ignore
        }

        try {
          const mj = globalThis.MathJax;
          if (mj && mj.startup && mj.startup.promise) {
            tasks.push(mj.startup.promise.catch(() => undefined));
          }
        } catch {
          // ignore
        }

        // Always wait a tiny bit for layout to settle.
        tasks.push(sleep(150));

        await Promise.race([
          Promise.all(tasks),
          sleep(1500)
        ]);
      });

      const result = await page.evaluate(() => {
        function asPxNumber(v) {
          if (!v) return null;
          const s = String(v).trim().toLowerCase();
          if (s === 'auto') return null;
          if (!s.endsWith('px')) return null;
          const n = Number(s.slice(0, -2));
          return Number.isFinite(n) ? n : null;
        }

        function isRasterImageSrc(src) {
          const s = String(src || '').trim().toLowerCase();
          return s.endsWith('.png') || s.endsWith('.jpg') || s.endsWith('.jpeg') || s.endsWith('.webp') || s.endsWith('.gif');
        }

        function nearGrid(valuePx, gridSizePx, tolerancePx = 0.75) {
          if (!Number.isFinite(valuePx)) return true;
          const m = ((valuePx % gridSizePx) + gridSizePx) % gridSizePx;
          return m <= tolerancePx || Math.abs(m - gridSizePx) <= tolerancePx;
        }

        function countOffGridAbsoluteChildren(gridRootEl) {
          if (!gridRootEl) return 0;
          const gridSize = 22;
          const excluded = new Set(['axis', 'axis-x', 'axis-y', 'axis-label', 'label-x', 'label-y']);
          let off = 0;

          const all = Array.from(gridRootEl.querySelectorAll('*'));
          for (const el of all) {
            const cls = String(el.className || '');
            if (cls && cls.split(/\s+/).some((c) => excluded.has(c))) continue;

            const cs = window.getComputedStyle(el);
            if (cs.position !== 'absolute') continue;

            const left = asPxNumber(cs.left);
            const top = asPxNumber(cs.top);
            if (left == null && top == null) continue;

            const leftOk = left == null ? true : nearGrid(left, gridSize);
            const topOk = top == null ? true : nearGrid(top, gridSize);
            if (!leftOk || !topOk) off++;
          }

          return off;
        }

        const pageEl = document.querySelector('main.a4-page');
        const hasTitle = Boolean(pageEl && pageEl.querySelector('.page-title'));
        const hasNumber = Boolean(pageEl && pageEl.querySelector('.page-number'));

        let hasRasterImages = false;
        if (pageEl) {
          const imgs = Array.from(pageEl.querySelectorAll('img'));
          hasRasterImages = imgs.some((img) => isRasterImageSrc(img.getAttribute('src')));
        }

        let overflow = false;
        let overflowX = false;
        let scrollHeight = 0;
        let clientHeight = 0;
        let scrollWidth = 0;
        let clientWidth = 0;
        if (pageEl) {
          scrollHeight = pageEl.scrollHeight;
          clientHeight = pageEl.clientHeight;
          overflow = scrollHeight > clientHeight + 1;

          scrollWidth = pageEl.scrollWidth;
          clientWidth = pageEl.clientWidth;
          overflowX = scrollWidth > clientWidth + 1;
        }

        // Bounding-box checks catch overflow that doesn't affect scroll metrics (e.g. transforms).
        let outOfBounds = false;
        if (pageEl) {
          const pageRect = pageEl.getBoundingClientRect();
          const pad = 0.5;
          const candidates = Array.from(
            pageEl.querySelectorAll('.pyt-footer, .eq-footer, .pyt-solutions, .eq-solutions, .solution-space, img, svg')
          );

          for (const el of candidates) {
            const r = el.getBoundingClientRect();
            if (
              r.left < pageRect.left - pad ||
              r.right > pageRect.right + pad ||
              r.top < pageRect.top - pad ||
              r.bottom > pageRect.bottom + pad
            ) {
              outOfBounds = true;
              break;
            }
          }
        }

        let gridOff = 0;
        if (pageEl) {
          for (const gridRoot of Array.from(pageEl.querySelectorAll('.coordinate-system'))) {
            gridOff += countOffGridAbsoluteChildren(gridRoot);
          }
        }

        return {
          hasTitle,
          hasNumber,
          hasRasterImages,
          overflow,
          overflowX,
          outOfBounds,
          scrollHeight,
          clientHeight,
          scrollWidth,
          clientWidth,
          gridOff
        };
      });

      const problems = [];
      if (!result.hasTitle) problems.push('missing .page-title');
      if (!result.hasNumber) problems.push('missing .page-number');
      if (result.hasRasterImages) problems.push('raster <img> detected (png/jpg/webp/gif)');
      if (result.overflow) {
        problems.push(`A4 overflow (scrollHeight=${result.scrollHeight}, clientHeight=${result.clientHeight})`);
      }
      if (result.overflowX) {
        problems.push(`A4 horizontal overflow (scrollWidth=${result.scrollWidth}, clientWidth=${result.clientWidth})`);
      }
      if (result.outOfBounds) problems.push('A4 out-of-bounds element(s) detected');
      if (result.gridOff > 0) problems.push(`off-grid elements: ${result.gridOff}`);

      if (problems.length > 0) failures.push({ file, problems });
    }

    return failures;
  } finally {
    await browser.close();
  }
}

async function main() {
  const pages = await listRootPages();
  if (pages.length === 0) throw new Error('No עמוד-*.html pages found in repo root');

  const maxNum = Math.max(...pages.map((p) => Number(p.match(PAGE_FILE_RE)?.[1] || 0)));
  const nextFileNum = maxNum + 1;
  const nextFileName = `עמוד-${nextFileNum}.html`;

  const nextHtmlPath = path.join(ROOT, nextFileName);
  const nextCssPath = path.join(ROOT, 'styles', 'pages', `עמוד-${nextFileNum}.css`);

  let server;
  try {
    server = await startPreviewServer();
    const base = server.base;

    // 1) Validate preview endpoints quickly
    await fetchOk(`${base}/preview`);
    const tocRes = await fetchOk(`${base}/api/toc`);
    const toc = await tocRes.json();

    if (!toc || !Array.isArray(toc.flat) || toc.flat.length === 0) {
      throw new Error('Invalid /api/toc payload (missing flat list)');
    }

    // 2) Guardrails across all existing pages (no overflow, title/number present, grid aligned)
    const flatFiles = toc.flat.map((e) => String(e.file || '')).filter(Boolean);
    const failures = await runGuardrails(base, flatFiles);
    if (failures.length > 0) {
      console.log('FAIL: guardrails detected issues; page will NOT be created.');
      for (const f of failures) {
        console.log(`- ${f.file}: ${f.problems.join('; ')}`);
      }
      process.exitCode = 1;
      return;
    }

    // 3) Determine last page in reading order (from /api/toc)
    const lastEntry = toc.flat[toc.flat.length - 1];
    const lastFile = String(lastEntry.file || '').trim();
    if (!lastFile) throw new Error('Unable to determine last page from /api/toc');

    const lastHtml = await fs.readFile(path.join(ROOT, lastFile), 'utf8');
    const lastMeta = parseNavMetaFromHtml(lastHtml, lastFile);

    const topic = lastMeta.topic;
    const newTopicTotal = lastMeta.pageTotal + 1;
    const newTopicIndex = lastMeta.pageIndex + 1;

    const topicBlock = extractTopicsBlock(lastHtml);

    // Find all pages in the same topic according to /api/toc
    const topicObj = Array.isArray(toc.topics) ? toc.topics.find((t) => t && t.name === topic) : null;
    const topicFiles = topicObj && Array.isArray(topicObj.pages) ? topicObj.pages.map((p) => String(p.file || '')).filter(Boolean) : [];

    if (topicFiles.length === 0) throw new Error(`Unable to resolve topic pages for "${topic}" from /api/toc`);

    // 4) Update all pages in the last topic to new total
    for (const file of topicFiles) {
      const full = path.join(ROOT, file);
      const html = await fs.readFile(full, 'utf8');
      const updated = updateTopicTotalInHtml(html, topic, newTopicTotal);
      if (updated !== html) await fs.writeFile(full, updated, 'utf8');
    }

    // 5) Update last page 'הבא' to point to the new file
    const lastHtml2 = await fs.readFile(path.join(ROOT, lastFile), 'utf8');
    const updatedLast = updateNextLinkInHtml(lastHtml2, nextFileName);
    await fs.writeFile(path.join(ROOT, lastFile), updatedLast, 'utf8');

    // 6) Create new page + its CSS
    const newHtml = buildNewPageHtml({
      fileName: nextFileName,
      fileNum: nextFileNum,
      topic,
      pageIndex: newTopicIndex,
      pageTotal: newTopicTotal,
      prevFile: lastFile,
      topicsBlock: topicBlock
    });

    await fs.writeFile(nextHtmlPath, newHtml, 'utf8');

    const css = `/* עמוד ${nextFileNum} — ${topic} */\n\n.page-${nextFileNum} {\n}\n`;
    await fs.writeFile(nextCssPath, css, 'utf8');

    console.log(`OK: created ${nextFileName} and styles/pages/עמוד-${nextFileNum}.css`);
  } finally {
    if (server?.child) await stopPreviewServer(server.child);
  }
}

main().catch((err) => {
  console.error(String(err?.stack || err));
  process.exitCode = 1;
});
