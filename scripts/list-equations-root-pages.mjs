import fs from "node:fs/promises";
import path from "node:path";

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
  return {
    topic: mm[1].trim(),
    index: Number.parseInt(mm[2], 10),
    total: Number.parseInt(mm[3], 10),
  };
}

async function main() {
  const root = process.cwd();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const rootPages = entries
    .filter((e) => e.isFile() && /^עמוד-\d+\.html$/u.test(e.name))
    .map((e) => e.name);

  const out = [];
  for (const file of rootPages) {
    const filePath = path.join(root, file);
    const html = await fs.readFile(filePath, "utf8");
    const meta = extractNavMeta(html);
    if (!meta) continue;
    if (meta.topic !== "משוואות") continue;
    out.push({ file, ...meta });
  }

  out.sort((a, b) => a.index - b.index);

  process.stdout.write(`count\t${out.length}\n`);
  for (const row of out) {
    process.stdout.write(`${row.index}\t${row.total}\t${row.file}\n`);
  }
}

await main();
