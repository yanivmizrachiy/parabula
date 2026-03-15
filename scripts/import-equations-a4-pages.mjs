import fs from "node:fs/promises";
import path from "node:path";

function parseArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function stripHtml(text) {
  return String(text)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTopicsBlock(html) {
  const m = html.match(/<div\s+class="preview-nav-topics"[\s\S]*?<\/div>/iu);
  return m ? m[0] : "";
}

function normalizeTopicsBlock({ topicsBlock, topicName, activeHref, startHref }) {
  // Ensure we have a block, and ensure current topic is active.
  let block = topicsBlock || "";

  if (!block) {
    return [
      '<div class="preview-nav-topics" aria-label="מעבר בין נושאים">',
      `  <a class="topic-link is-active" href="${activeHref}" aria-current="page">${topicName}</a>`,
      "</div>",
    ].join("\n");
  }

  // 1) Remove existing actives.
  block = block.replace(/\bis-active\b/gu, "");
  block = block.replace(/\s+aria-current="page"/gu, "");

  // 2) If topic already exists, make it active and update href.
  const linkRe = /<a\s+class="topic-link[^"]*"\s+href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/giu;
  let found = false;
  block = block.replace(linkRe, (full, href, attrs, inner) => {
    const name = stripHtml(inner);
    if (name !== topicName) return full;
    found = true;
    return `<a class="topic-link is-active" href="${activeHref}" aria-current="page">${inner}</a>`;
  });

  // 3) If missing, append an active link for this page.
  if (!found) {
    block = block.replace(
      /<\/div>\s*$/iu,
      `  <a class="topic-link is-active" href="${activeHref}" aria-current="page">${topicName}</a>\n</div>`
    );
  }

  // Cleanup accidental double spaces in class attr (cosmetic).
  block = block.replace(/class="\s*topic-link\s+"/gu, 'class="topic-link"');
  block = block.replace(/class="\s*topic-link\s+is-active\s*"/gu, 'class="topic-link is-active"');

  return block;
}

function buildPageHtml({
  fileName,
  fileNum,
  topicName,
  pageIndex,
  pageTotal,
  prevFile,
  nextFile,
  topicsBlock,
  svgRelPath,
}) {
  const prevHtml = prevFile
    ? `<a class="nav-link" href="${prevFile}">הקודם</a>`
    : '<span class="nav-link is-disabled" aria-disabled="true">הקודם</span>';

  const nextHtml = nextFile
    ? `<a class="nav-link" href="${nextFile}">הבא</a>`
    : '<span class="nav-link is-disabled" aria-disabled="true">הבא</span>';

  const topicsHtml = normalizeTopicsBlock({
    topicsBlock,
    topicName,
    activeHref: fileName,
    startHref: fileName,
  });

  return `<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>עמוד ${pageIndex} — ${topicName}</title>

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
          ${prevHtml}
        </div>
        <div class="nav-meta">${topicName} — עמוד ${pageIndex} / ${pageTotal}</div>
        <div class="nav-side">
          ${nextHtml}
        </div>
      </div>
      ${topicsHtml}
    </nav>

    <main class="a4-page page-${fileNum}">
      <header class="header-container">
        <h1 class="page-title">${topicName}</h1>
        <div class="page-number">${pageIndex}</div>
      </header>

      <div class="question-block">
        <div class="pdf-wrap" aria-label="תוכן העמוד">
          <img class="pdf-page" src="${svgRelPath}" alt="${topicName} — עמוד ${pageIndex}" />
        </div>
      </div>
    </main>
  </body>
</html>
`;
}

function buildPageCss({ fileNum, topicName }) {
  return `/* עמוד ${fileNum} — ${topicName} */\n\n.page-${fileNum} .question-block {\n  justify-content: flex-start;\n}\n\n.page-${fileNum} .pdf-wrap {\n  flex: 1;\n  min-height: 0;\n  display: flex;\n}\n\n.page-${fileNum} .pdf-page {\n  width: 100%;\n  height: 100%;\n  object-fit: contain;\n  display: block;\n}\n`;
}

function escapeRegExpLiteral(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function updateNextLinkInHtml(html, nextFile) {
  // Replace a disabled 'הבא' span with a link, or update existing link href.
  if (/<span\b[^>]*\bclass="nav-link[^"]*\bis-disabled\b[^"]*"[^>]*>\s*הבא\s*<\/span>/iu.test(html)) {
    return html.replace(
      /<span\b[^>]*\bclass="nav-link[^"]*\bis-disabled\b[^"]*"[^>]*>\s*הבא\s*<\/span>/iu,
      `<a class="nav-link" href="${nextFile}">הבא</a>`
    );
  }

  return html.replace(
    /(<div\s+class="nav-side">\s*)(<a\b[^>]*\bclass="nav-link"[^>]*\bhref=")([^"]+)("[^>]*>\s*הבא\s*<\/a>)/iu,
    `$1$2${nextFile}$4`
  );
}

function updatePrevLinkInHtml(html, prevFile) {
  if (/<span\b[^>]*\bclass="nav-link[^"]*\bis-disabled\b[^"]*"[^>]*>\s*הקודם\s*<\/span>/iu.test(html)) {
    return html.replace(
      /<span\b[^>]*\bclass="nav-link[^"]*\bis-disabled\b[^"]*"[^>]*>\s*הקודם\s*<\/span>/iu,
      `<a class="nav-link" href="${prevFile}">הקודם</a>`
    );
  }

  return html.replace(
    /(<div\s+class="nav-side">\s*)(<a\b[^>]*\bclass="nav-link"[^>]*\bhref=")([^"]+)("[^>]*>\s*הקודם\s*<\/a>)/iu,
    `$1$2${prevFile}$4`
  );
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const workspaceRoot = process.cwd();

  const startFileArg = parseArgValue("--startFile");
  const startFileNum = startFileArg ? Number.parseInt(startFileArg, 10) : 41;
  if (!Number.isInteger(startFileNum) || startFileNum <= 1) {
    throw new Error("--startFile must be an integer >= 2 (so we can link from previous page)");
  }

  const topicName = parseArgValue("--topic") ?? "משוואות";
  const assetsDirArg = parseArgValue("--assetsDir") ?? "pages/משוואות/assets";
  const force = hasFlag("--force");

  const assetsDir = path.resolve(workspaceRoot, assetsDirArg);
  if (!(await fileExists(assetsDir))) {
    throw new Error(`Assets dir not found: ${assetsDir}`);
  }

  const entries = await fs.readdir(assetsDir, { withFileTypes: true });
  const svgFiles = entries
    .filter((e) => e.isFile() && /^page-(\d+)\.svg$/i.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => {
      const ai = Number(a.match(/page-(\d+)\.svg/i)?.[1] ?? 0);
      const bi = Number(b.match(/page-(\d+)\.svg/i)?.[1] ?? 0);
      return ai - bi;
    });

  if (svgFiles.length === 0) {
    throw new Error(`No SVG assets found in: ${assetsDir}`);
  }

  // Determine total as max contiguous prefix 1..N
  let total = 0;
  for (const name of svgFiles) {
    const n = Number(name.match(/page-(\d+)\.svg/i)?.[1] ?? 0);
    if (n === total + 1) total += 1;
    else break;
  }

  if (total === 0) {
    throw new Error(`Expected page-01.svg ... found: ${svgFiles.slice(0, 5).join(", ")}`);
  }

  const prevFileName = `עמוד-${startFileNum - 1}.html`;
  const prevFilePath = path.join(workspaceRoot, prevFileName);
  if (!(await fileExists(prevFilePath))) {
    throw new Error(`Previous page not found (for linking): ${prevFilePath}`);
  }

  const prevHtml = await fs.readFile(prevFilePath, "utf8");
  const baseTopicsBlock = extractTopicsBlock(prevHtml);

  // 0) Patch previous page to point next -> first new page
  const firstNewFileName = `עמוד-${startFileNum}.html`;
  const patchedPrev = updateNextLinkInHtml(prevHtml, firstNewFileName);
  if (patchedPrev !== prevHtml) {
    await fs.writeFile(prevFilePath, patchedPrev, "utf8");
  }

  // 1) Generate pages
  for (let pageIndex = 1; pageIndex <= total; pageIndex++) {
    const fileNum = startFileNum + pageIndex - 1;
    const fileName = `עמוד-${fileNum}.html`;
    const htmlPath = path.join(workspaceRoot, fileName);
    const cssPath = path.join(workspaceRoot, "styles", "pages", `עמוד-${fileNum}.css`);

    const prevFile = pageIndex === 1 ? prevFileName : `עמוד-${fileNum - 1}.html`;
    const nextFile = pageIndex === total ? null : `עמוד-${fileNum + 1}.html`;

    const svgName = `page-${String(pageIndex).padStart(2, "0")}.svg`;
    const svgRelPath = path.posix.join(assetsDirArg.replace(/\\/g, "/"), svgName);

    const html = buildPageHtml({
      fileName,
      fileNum,
      topicName,
      pageIndex,
      pageTotal: total,
      prevFile,
      nextFile,
      topicsBlock: baseTopicsBlock,
      svgRelPath,
    });

    if (!(await fileExists(htmlPath)) || force) {
      await fs.writeFile(htmlPath, html, "utf8");
    }

    if (!(await fileExists(cssPath)) || force) {
      await fs.mkdir(path.dirname(cssPath), { recursive: true });
      await fs.writeFile(cssPath, buildPageCss({ fileNum, topicName }), "utf8");
    }
  }

  // 2) Ensure first new page links back to prev (in case of force/overwrites elsewhere)
  const firstHtmlPath = path.join(workspaceRoot, `עמוד-${startFileNum}.html`);
  if (await fileExists(firstHtmlPath)) {
    const firstHtml = await fs.readFile(firstHtmlPath, "utf8");
    const ensured = updatePrevLinkInHtml(firstHtml, prevFileName);
    if (ensured !== firstHtml) await fs.writeFile(firstHtmlPath, ensured, "utf8");
  }

  console.log(
    `OK: created ${total} A4 pages for topic "${topicName}" starting at ${firstNewFileName} (assets: ${path.relative(
      workspaceRoot,
      assetsDir
    )})`
  );
}

await main();
