import fs from "node:fs/promises";
import path from "node:path";

function stripHtml(text) {
  return String(text)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNavMetaTopic(html) {
  const m = html.match(/<div\s+class="nav-meta"[^>]*>([\s\S]*?)<\/div>/iu);
  if (!m) return null;
  const text = stripHtml(m[1]);
  const mm = text.match(/^(.*?)\s*—\s*עמוד\s*(\d+)\s*\/\s*(\d+)\s*$/u);
  if (!mm) return null;
  return mm[1].trim();
}

async function main() {
  const root = process.cwd();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const rootPages = entries
    .filter((e) => e.isFile() && /^עמוד-\d+\.html$/u.test(e.name))
    .map((e) => e.name);

  let updated = 0;
  let scanned = 0;

  for (const file of rootPages) {
    const filePath = path.join(root, file);
    const html = await fs.readFile(filePath, "utf8");
    const topic = extractNavMetaTopic(html);
    if (topic !== "משוואות") continue;

    scanned += 1;

    let patched = html;

    // Ensure MathJax delimiters are escaped correctly in JS source, and enable
    // automatic line breaks so long OCR-derived equations don't overflow A4.
    // Note: the desired HTML must contain "\\(" which at runtime becomes "\(".
    const desired =
      'MathJax = { tex: { inlineMath: [["\\\\(", "\\\\)"]] }, chtml: { linebreaks: { automatic: true, width: "container" } } };';

    const variants = [
      // Broken: JS eats the backslash, leaving "(".
      'MathJax = { tex: { inlineMath: [["\\(", "\\)"]] } };',
      // Correct delimiters, but missing linebreaks.
      'MathJax = { tex: { inlineMath: [["\\\\(", "\\\\)"]] } };',
      // Already correct (idempotent).
      desired
    ];

    for (const v of variants) patched = patched.replace(v, desired);

    if (patched !== html) {
      await fs.writeFile(filePath, patched, "utf8");
      updated += 1;
    }
  }

  console.log(`fix-equations-root-mathjax: scanned ${scanned} equations pages, updated ${updated}`);
}

await main();
