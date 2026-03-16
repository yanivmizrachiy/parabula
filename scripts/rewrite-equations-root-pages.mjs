import fs from "node:fs/promises";
import path from "node:path";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function stripHtml(text) {
  return String(text)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNavMeta(html) {
  const m = html.match(/<div\s+class="nav-meta"[^>]*>([\s\S]*?)<\/div>/iu);
  if (!m) return null;
  const text = stripHtml(m[1]);
  const mm = text.match(/^(.*?)\s*—\s*עמוד\s*(\d+)\s*\/\s*(\d+)\s*$/u);
  if (!mm) return null;
  const index = Number.parseInt(mm[2], 10);
  const total = Number.parseInt(mm[3], 10);
  if (!Number.isFinite(index) || !Number.isFinite(total)) return null;
  return { topic: mm[1].trim(), index, total };
}

const SPLIT_RE = /\s+(?=[0-9A-Za-z(\-+][0-9A-Za-z()\[\]{}+\-*/.^,;_]{0,25}\s*[=_])/g;

function normalizePiece(piece) {
  let s = String(piece ?? "").trim();
  if (!s) return "";

  s = s.replaceAll("|", " ");
  s = s.replaceAll("؛", ";");

  s = s.replace(/_{2,}/g, "=");
  s = s.replace(/_+,/g, "=");
  s = s.replace(/_/g, "=");

  s = s.replace(/=,/g, "=");
  s = s.replace(/,/g, "");

  s = s.replace(/\s+/g, "");
  s = s.replace(/=+/g, "=");

  s = s.replace(/^[^0-9A-Za-z(\-+]+/g, "");
  s = s.replace(/[^0-9A-Za-z)\]\}\-+]+$/g, "");

  return s;
}

function extractEquations(text) {
  const out = [];

  for (const rawLine of String(text ?? "").split(/\r?\n/g)) {
    let ln = rawLine.trim();
    if (!ln) continue;

    ln = ln.replaceAll("|", " ");
    ln = ln.replaceAll(";", " ");
    ln = ln.replaceAll("؛", " ");

    const pieces = ln.split(SPLIT_RE);
    for (const piece of pieces) {
      const eq = normalizePiece(piece);
      if (!eq) continue;
      if (!eq.includes("=")) continue;
      if (!/\d/.test(eq)) continue;
      if (eq.length < 5) continue;
      out.push(eq);
    }
  }

  const seen = new Set();
  const uniq = [];
  for (const e of out) {
    if (seen.has(e)) continue;
    seen.add(e);
    uniq.push(e);
  }
  return uniq;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildQuestionBlockInner({ equations, rawLines }) {
  if (equations.length > 0) {
    const items = equations
      .map((eq) => {
        const tex = eq
          .replaceAll("\\", "\\\\")
          .replaceAll("%", "\\%")
          .replaceAll("$", "\\$");
        return `        <div class="eq-item"><span class="eq-math">\\(${tex}\\)</span></div>`;
      })
      .join("\n");

    return `\n      <section class="eq-sheet" aria-label="תרגילי משוואות">\n        <div class="eq-grid" aria-label="משוואות">\n${items}\n        </div>\n      </section>\n    `;
  }

  const raw = rawLines.map((l) => l.trim()).filter(Boolean).join("\n");
  return `\n      <section class="eq-sheet" aria-label="תרגילי משוואות">\n        <pre class="eq-raw" aria-label="טקסט OCR גולמי">${escapeHtml(raw)}</pre>\n      </section>\n    `;
}

function findDivBlock(html, className) {
  const re = new RegExp(`<div\\b[^>]*class=\"[^\"]*\\b${className}\\b[^\"]*\"[^>]*>`, "iu");
  const m = html.match(re);
  if (!m || m.index == null) return null;

  const start = m.index;
  const openEnd = start + m[0].length;

  const tagRe = /<\/div\b|<div\b/giu;
  tagRe.lastIndex = openEnd;

  let depth = 1;
  while (true) {
    const t = tagRe.exec(html);
    if (!t) return null;
    const token = t[0].toLowerCase();
    if (token.startsWith("</")) depth -= 1;
    else depth += 1;

    if (depth === 0) {
      const end = tagRe.lastIndex;
      return { start, openEnd, end };
    }
  }
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function main() {
  const root = process.cwd();

  const entries = await fs.readdir(root, { withFileTypes: true });
  const rootPages = entries
    .filter((e) => e.isFile() && /^עמוד-\d+\.html$/u.test(e.name))
    .map((e) => e.name);

  const targets = [];
  for (const file of rootPages) {
    const filePath = path.join(root, file);
    const html = await fs.readFile(filePath, "utf8");
    const meta = extractNavMeta(html);
    if (!meta) continue;
    if (meta.topic !== "משוואות") continue;
    targets.push({ file, filePath, index: meta.index, total: meta.total, html });
  }

  targets.sort((a, b) => a.index - b.index);

  const total = targets.length;
  if (total === 0) {
    console.error("No root equations pages found.");
    process.exitCode = 2;
    return;
  }

  let updated = 0;
  let cssUpdated = 0;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];

    const ocrPath = path.join(root, "pages", "משוואות", "ocr", `page-${pad2(t.index)}.txt`);
    let ocrText = "";
    try {
      ocrText = await fs.readFile(ocrPath, "utf8");
    } catch {
      ocrText = "";
    }

    const equations = extractEquations(ocrText);
    const rawLines = String(ocrText)
      .split(/\r?\n/g)
      .map((l) => l.trim())
      .filter(Boolean);

    const block = findDivBlock(t.html, "question-block");
    if (!block) {
      console.warn(`SKIP: unable to locate .question-block in ${t.file}`);
      continue;
    }

    const before = t.html.slice(0, block.openEnd);
    const after = t.html.slice(block.end - "</div>".length);

    const inner = buildQuestionBlockInner({ equations, rawLines });

    const patched = `${before}${inner}${after}`;

    if (patched !== t.html) {
      await fs.writeFile(t.filePath, patched, "utf8");
      updated += 1;
    }

    // Update page CSS to import the shared equations topic stylesheet.
    const pageNumMatch = t.file.match(/^עמוד-(\d+)\.html$/u);
    if (pageNumMatch) {
      const pageNum = pageNumMatch[1];
      const cssPath = path.join(root, "styles", "pages", `עמוד-${pageNum}.css`);
      const cssDir = path.dirname(cssPath);
      await ensureDir(cssDir);

      const pageClass = `page-${pageNum}`;
      const css = `/* עמוד ${pageNum} — משוואות */\n@import "../topics/equations.css";\n\n.${pageClass} .question-block {\n  justify-content: flex-start;\n}\n`;

      let existing = null;
      try {
        existing = await fs.readFile(cssPath, "utf8");
      } catch {
        existing = null;
      }

      if (existing !== css) {
        await fs.writeFile(cssPath, css, "utf8");
        cssUpdated += 1;
      }
    }

    if ((i + 1) % 5 === 0 || i === targets.length - 1) {
      console.log(`rewrite-equations: ${i + 1}/${total} pages processed (html updated ${updated}, css updated ${cssUpdated})`);
    }
  }

  console.log(`OK: rewrite-equations completed. html updated ${updated}/${total}, css updated ${cssUpdated}/${total}`);
}

await main();
