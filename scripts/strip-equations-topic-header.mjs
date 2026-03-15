import fs from "node:fs/promises";
import path from "node:path";

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const root = process.cwd();
  const topicRoot = path.join(root, "pages", "משוואות");
  if (!(await fileExists(topicRoot))) throw new Error(`Topic dir not found: ${topicRoot}`);

  const entries = await fs.readdir(topicRoot, { withFileTypes: true });
  const pageDirs = entries
    .filter((e) => e.isDirectory() && /^עמוד-\d+$/u.test(e.name))
    .map((e) => e.name);

  let updated = 0;
  let scanned = 0;

  for (const dir of pageDirs) {
    const indexPath = path.join(topicRoot, dir, "index.html");
    if (!(await fileExists(indexPath))) continue;

    const html = await fs.readFile(indexPath, "utf8");
    scanned += 1;

    // Remove the redundant header/title block.
    const patched = html.replace(/\n\s*<header\s+class="header">[\s\S]*?<\/header>\s*\n/iu, "\n\n");

    if (patched !== html) {
      await fs.writeFile(indexPath, patched, "utf8");
      updated += 1;
    }
  }

  console.log(`strip-equations-topic-header: scanned ${scanned}, updated ${updated}`);
}

await main();
