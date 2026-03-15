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

    // Fix MathJax delimiter escaping: many generated pages ended up with "\(" which JS treats as "(".
    // Use exact string replacement (stable and fast).
    patched = patched.replace(
      'MathJax = { tex: { inlineMath: [["\\(", "\\)"]] } };',
      'MathJax = { tex: { inlineMath: [["\\\\(", "\\\\)"]] } };'
    );

    // A second variant appears in some pages (extra whitespace). Normalize it too.
    patched = patched.replace(
      'MathJax = { tex: { inlineMath: [["\\(", "\\)"]] } };',
      'MathJax = { tex: { inlineMath: [["\\\\(", "\\\\)"]] } };'
    );

    // Defensive: if a page already has the correct form, leave it as-is.
    patched = patched.replace(
      'MathJax = { tex: { inlineMath: [["\\\\(", "\\\\)"]] } };',
      'MathJax = { tex: { inlineMath: [["\\\\(", "\\\\)"]] } };'
    );

    if (patched !== html) {
      await fs.writeFile(filePath, patched, "utf8");
      updated += 1;
    }
  }

  console.log(`fix-equations-root-mathjax: scanned ${scanned} equations pages, updated ${updated}`);
}

await main();
