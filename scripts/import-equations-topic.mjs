import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function parseArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function pdfPageCount(pdfPath) {
  const { stdout } = await execFileAsync("pdfinfo", [pdfPath], {
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  const m = String(stdout).match(/^Pages:\s*(\d+)\s*$/m);
  if (!m) throw new Error("pdfinfo: unable to parse Pages");
  const n = Number.parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) throw new Error("pdfinfo: invalid Pages");
  return n;
}

function topicStyleCss() {
  // Matches existing topic-page look-and-feel (badge, title rule, A4 frame)
  // while staying minimal for this topic.
  return `@page { size: A4; margin: 14mm; }

:root {
  --ink: #000;
  --paper: #fff;
  --screen-bg: #f2f2f2;
  --title-blue: #0b55d4;
  --page-padding: 14mm;
  --page-outline: 1px dashed rgba(0, 0, 0, 0.45);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: Arial, "Noto Sans Hebrew", "Segoe UI", sans-serif;
  color: var(--ink);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

@media screen {
  body { background: var(--screen-bg); }

  .page {
    margin: 12px auto;
    background: var(--paper);
    outline: var(--page-outline);
    outline-offset: 0;
  }
}

@media print {
  body { background: var(--paper); }

  .page {
    margin: 0;
    outline: none;
  }
}

.page {
  width: 210mm;
  min-height: 297mm;
  padding: var(--page-padding);
  position: relative;
}

.page-badge {
  position: absolute;
  left: 14mm;
  top: 14mm;
  width: 18mm;
  height: 18mm;
  border: 0.8mm solid var(--title-blue);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18pt;
  line-height: 1;
  color: var(--title-blue);
  background: var(--paper);
}

.header {
  margin-top: 2mm;
  margin-bottom: 6mm;
  padding-left: 24mm;
}

.title {
  color: var(--title-blue);
  font-family: "Times New Roman", Times, Georgia, serif;
  font-size: 21pt;
  font-weight: 700;
  margin: 0;
  text-align: right;
  letter-spacing: 0.35px;
  padding-bottom: 2.5mm;
  border-bottom: 0.8mm solid var(--title-blue);
}

.pdf-wrap {
  margin-top: 2mm;
}

.pdf-page {
  width: 100%;
  height: auto;
  display: block;
}
`;
}

function pageHtml({ pageIndex, svgRelPath }) {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>משוואות — עמוד ${pageIndex}</title>
  <link rel="stylesheet" href="../style.css" />
</head>
<body>
  <div class="page" aria-label="משוואות">
    <div class="page-badge" aria-label="מספר עמוד">${pageIndex}</div>

    <header class="header">
      <h1 class="title">משוואות</h1>
    </header>

    <div class="pdf-wrap" aria-label="תוכן העמוד">
      <img class="pdf-page" src="${svgRelPath}" alt="משוואות — עמוד ${pageIndex}" />
    </div>
  </div>
</body>
</html>
`;
}

async function exportPdfPageToSvg({ pdfPath, page, outSvgPath }) {
  await fs.mkdir(path.dirname(outSvgPath), { recursive: true });
  await execFileAsync(
    "pdftocairo",
    ["-svg", "-f", String(page), "-l", String(page), pdfPath, outSvgPath],
    { windowsHide: true }
  );
}

async function main() {
  const pdfArg = parseArgValue("--pdf");
  const topicDirArg = parseArgValue("--topicDir");
  const assetsDirArg = parseArgValue("--assetsDir");
  const maxPagesArg = parseArgValue("--maxPages");
  const forceArg = process.argv.includes("--force");

  const workspaceRoot = process.cwd();
  const pdfPath = pdfArg
    ? path.resolve(workspaceRoot, pdfArg)
    : path.join(workspaceRoot, "site", "משוואות.pdf");

  const topicRoot = topicDirArg
    ? path.resolve(workspaceRoot, topicDirArg)
    : path.join(workspaceRoot, "pages", "משוואות");

  const assetsDir = assetsDirArg
    ? path.resolve(workspaceRoot, assetsDirArg)
    : path.join(topicRoot, "assets");

  if (!(await fileExists(pdfPath))) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }

  const total = await pdfPageCount(pdfPath);
  const maxPages = maxPagesArg ? Number.parseInt(maxPagesArg, 10) : total;
  const limit = Number.isFinite(maxPages) && maxPages > 0 ? Math.min(maxPages, total) : total;

  await fs.mkdir(topicRoot, { recursive: true });
  await fs.mkdir(assetsDir, { recursive: true });

  const stylePath = path.join(topicRoot, "style.css");
  if (!(await fileExists(stylePath)) || forceArg) {
    await fs.writeFile(stylePath, topicStyleCss(), "utf8");
  }

  for (let page = 1; page <= limit; page++) {
    const svgName = `page-${pad2(page)}.svg`;
    const svgPath = path.join(assetsDir, svgName);
    const pageDir = path.join(topicRoot, `עמוד-${page}`);
    const pageIndexPath = path.join(pageDir, "index.html");

    if (!(await fileExists(svgPath)) || forceArg) {
      await exportPdfPageToSvg({ pdfPath, page, outSvgPath: svgPath });
    }

    if (!(await fileExists(pageIndexPath)) || forceArg) {
      await fs.mkdir(pageDir, { recursive: true });
      const html = pageHtml({ pageIndex: page, svgRelPath: `../assets/${svgName}` });
      await fs.writeFile(pageIndexPath, html, "utf8");
    }

    if (page % 5 === 0 || page === limit) {
      console.log(`Imported ${page}/${limit}`);
    }
  }

  console.log(`OK: pages/משוואות created (${limit} pages).`);
}

main().catch((err) => {
  console.error(String(err?.stack || err));
  process.exitCode = 1;
});
