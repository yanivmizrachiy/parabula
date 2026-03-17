import fs from "node:fs/promises";
import path from "node:path";

function pad2(n) {
  return String(n).padStart(2, "0");
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

function buildEquationMarkup({ equations, rawLines }) {
  if (equations.length > 0) {
    const items = equations
      .map((eq) => {
        const tex = eq
          .replaceAll("\\", "\\\\")
          .replaceAll("%", "\\%")
          .replaceAll("$", "\\$");
        return `    <div class="eq-item"><span class="eq-math">\\(${tex}\\)</span></div>`;
      })
      .join("\n");

    return `\n  <section class="eq-sheet" aria-label="תרגילי משוואות">\n    <div class="eq-grid" aria-label="משוואות">\n${items}\n    </div>\n  </section>\n`;
  }

  const raw = rawLines.map((l) => l.trim()).filter(Boolean).join("\n");
  return `\n  <section class="eq-sheet" aria-label="תרגילי משוואות">\n    <pre class="eq-raw" aria-label="טקסט OCR גולמי">${escapeHtml(raw)}</pre>\n  </section>\n`;
}

function ensureMathJaxHead(html) {
  if (/cdn\.jsdelivr\.net\/npm\/mathjax@3\/es5\/tex-mml-chtml\.js/iu.test(html)) {
    return html;
  }

  const insertion = `\n  <script>\n    MathJax = { tex: { inlineMath: [["\\\\(", "\\\\)"]] } };\n  </script>\n  <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>\n`;

  const m = html.match(/<\/head>/iu);
  if (!m || m.index == null) return html;
  return html.slice(0, m.index) + insertion + html.slice(m.index);
}

function replacePdfWrap(html, replacement) {
  const startRe = /<div\s+class="pdf-wrap"[^>]*>/iu;
  const m = html.match(startRe);
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
      return html.slice(0, start) + replacement + html.slice(end);
    }
  }
}

async function main() {
  const root = process.cwd();
  const topicDir = path.join(root, "pages", "משוואות");

  let updated = 0;

  for (let page = 1; page <= 54; page++) {
    const filePath = path.join(topicDir, `עמוד-${page}`, "index.html");
    let html;
    try {
      html = await fs.readFile(filePath, "utf8");
    } catch {
      console.warn(`SKIP: missing ${path.relative(root, filePath)}`);
      continue;
    }

    const ocrPath = path.join(topicDir, "ocr", `page-${pad2(page)}.txt`);
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

    let patched = html;
    patched = ensureMathJaxHead(patched);

    const replacement = buildEquationMarkup({ equations, rawLines });
    const replaced = replacePdfWrap(patched, replacement);
    if (replaced == null) {
      console.warn(`SKIP: unable to replace .pdf-wrap in ${path.relative(root, filePath)}`);
      continue;
    }
    patched = replaced;

    if (patched !== html) {
      await fs.writeFile(filePath, patched, "utf8");
      updated += 1;
    }

    if (page % 10 === 0 || page === 54) {
      console.log(`rewrite-topic-equations: ${page}/54 pages processed (updated ${updated})`);
    }
  }

  console.log(`OK: rewrite-topic-equations completed. updated ${updated}/54`);
}

await main();
