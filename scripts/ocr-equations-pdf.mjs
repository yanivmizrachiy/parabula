import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWorker } from "tesseract.js";

const execFileAsync = promisify(execFile);

function parseArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parsePagesArg(value) {
  if (!value) return [];

  const tokens = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const pages = new Set();
  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1], 10);
      const end = Number.parseInt(rangeMatch[2], 10);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      for (let p = lo; p <= hi; p++) pages.add(p);
      continue;
    }

    const page = Number.parseInt(token, 10);
    if (Number.isFinite(page) && page > 0) pages.add(page);
  }

  return Array.from(pages).sort((a, b) => a - b);
}

function normalizeWhitespace(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function cleanEquationsWorksheetText(text) {
  const lines = normalizeWhitespace(text)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const filtered = [];
  for (const line of lines) {
    const normalized = line.replace(/\s+/g, " ");

    if (normalized === "משוואות לחטיבת הביניים") continue;
    if (normalized === "הדפים של יניב") continue;

    filtered.push(normalized);
  }
  return filtered;
}

async function renderPdfPageToPng({ pdfPath, page, ppi, outPngPath }) {
  const outBase = outPngPath.replace(/\.png$/i, "");

  await fs.mkdir(path.dirname(outPngPath), { recursive: true });

  // Poppler's pdftocairo is available in PATH on this machine (via MiKTeX).
  // -singlefile ensures the output file name is exactly outBase + ".png".
  await execFileAsync("pdftocairo", [
    "-png",
    "-r",
    String(ppi),
    "-f",
    String(page),
    "-l",
    String(page),
    "-singlefile",
    pdfPath,
    outBase,
  ]);
}

async function main() {
  const pdfArg = parseArgValue("--pdf");
  const pagesArg = parseArgValue("--pages");
  const imagesDirArg = parseArgValue("--imagesDir");
  const outDirArg = parseArgValue("--outDir");
  const langArg = parseArgValue("--lang");
  const ppiArg = parseArgValue("--ppi");

  const workspaceRoot = process.cwd();
  const pdfPath = pdfArg
    ? path.resolve(workspaceRoot, pdfArg)
    : path.join(workspaceRoot, "site", "משוואות.pdf");

  const ppi = Number.parseInt(ppiArg ?? "300", 10);
  if (!Number.isFinite(ppi) || ppi < 72 || ppi > 600) {
    console.error("Invalid --ppi. Expected an integer between 72 and 600.");
    process.exit(2);
  }

  const pages = parsePagesArg(pagesArg);
  if (pages.length === 0) {
    console.error(
      "Usage: node scripts/ocr-equations-pdf.mjs --pages 1-3 [--pdf site/משוואות.pdf] [--imagesDir tmp/equations-png] [--outDir print/equations-ocr] [--lang heb+eng] [--ppi 300]"
    );
    process.exit(2);
  }

  const imagesDir = imagesDirArg
    ? path.resolve(workspaceRoot, imagesDirArg)
    : path.join(workspaceRoot, "tmp", "equations-png");
  const outDir = outDirArg
    ? path.resolve(workspaceRoot, outDirArg)
    : path.join(workspaceRoot, "print", "equations-ocr");
  const lang = langArg ?? "heb+eng";

  await fs.mkdir(imagesDir, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });

  const worker = await createWorker(lang);
  await worker.setParameters({
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: "6",
  });

  try {
    for (const page of pages) {
      const pngPath = path.join(imagesDir, `page-${pad2(page)}.png`);
      await renderPdfPageToPng({ pdfPath, page, ppi, outPngPath: pngPath });

      const { data } = await worker.recognize(pngPath);
      const rawText = data?.text ?? "";
      const cleanedLines = cleanEquationsWorksheetText(rawText);

      const rawOutPath = path.join(outDir, `page-${pad2(page)}.raw.txt`);
      const cleanedOutPath = path.join(outDir, `page-${pad2(page)}.txt`);

      await fs.writeFile(rawOutPath, normalizeWhitespace(rawText) + "\n", "utf8");
      await fs.writeFile(cleanedOutPath, cleanedLines.join("\n") + "\n", "utf8");

      console.log(
        `OCR page ${page}: ${path.relative(workspaceRoot, cleanedOutPath)} (${cleanedLines.length} lines)`
      );
    }
  } finally {
    await worker.terminate();
  }
}

await main();
