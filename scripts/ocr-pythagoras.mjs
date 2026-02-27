import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createWorker } from "tesseract.js";

function parseArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function parsePagesArg(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function normalizeWhitespace(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function cleanHebrewWorksheetText(text) {
  const lines = normalizeWhitespace(text)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const filtered = [];
  for (const line of lines) {
    const normalized = line.replace(/\s+/g, " ");

    if (/^משפט\s+פיתגורס\s+לכיתה\s+ח/.test(normalized)) continue;
    if (/^שאלה\s*\d+\s*$/.test(normalized)) continue;
    if (/^תשובות\s+לשאלה\s*\d+\s*$/.test(normalized)) continue;

    filtered.push(normalized);
  }

  return filtered;
}

async function main() {
  const pagesArg = parseArgValue("--pages");
  const inputDirArg = parseArgValue("--inputDir");
  const outDirArg = parseArgValue("--outDir");
  const pages = parsePagesArg(pagesArg);
  if (pages.length === 0) {
    console.error(
      "Usage: node scripts/ocr-pythagoras.mjs --pages 1,2,3 [--inputDir <dir>] [--outDir <dir>]"
    );
    process.exit(2);
  }

  const workspaceRoot = process.cwd();
  const outDir = outDirArg
    ? path.resolve(workspaceRoot, outDirArg)
    : path.join(workspaceRoot, "print", "pythagoras-ocr");
  await fs.mkdir(outDir, { recursive: true });

  const inputDir = inputDirArg
    ? path.resolve(workspaceRoot, inputDirArg)
    : path.join(workspaceRoot, "assets", "pythagoras", "pdf");

  const worker = await createWorker("heb+eng");
  await worker.setParameters({
    // Improve line layout in worksheets
    preserve_interword_spaces: "1",
    // Assume a uniform block of text (worksheets often behave like this)
    tessedit_pageseg_mode: "6",
  });

  try {
    for (const page of pages) {
      const pngPath = path.join(
        inputDir,
        `page-${String(page).padStart(2, "0")}.png`
      );

      const { data } = await worker.recognize(pngPath);
      const rawText = data?.text ?? "";
      const cleanedLines = cleanHebrewWorksheetText(rawText);

      const outPath = path.join(outDir, `page-${String(page).padStart(2, "0")}.txt`);
      await fs.writeFile(outPath, cleanedLines.join("\n"), "utf8");

      console.log(`OCR page ${page}: wrote ${path.relative(workspaceRoot, outPath)} (${cleanedLines.length} lines)`);
    }
  } finally {
    await worker.terminate();
  }
}

await main();
