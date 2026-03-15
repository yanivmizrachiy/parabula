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

function parseIntArg({ flag, defaultValue }) {
  const raw = parseArgValue(flag);
  if (raw == null) return defaultValue;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
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

function normalizeWhitespace(text) {
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function cleanOcrLines(text) {
  // Keep this conservative: OCR is inherently imperfect, so we only remove
  // obvious separators and blank noise while preserving equation-like lines.
  const lines = normalizeWhitespace(text)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const filtered = [];
  for (const line of lines) {
    if (/^\|+$/.test(line)) continue;
    if (/^[\[\]\(\)\{\}]+$/.test(line)) continue;
    if (/^[-_]{3,}$/.test(line)) continue;

    // Drop obvious header noise if it appears.
    if (line === "משוואות לחטיבת הביניים") continue;
    if (line === "הדפים של יניב") continue;

    filtered.push(line.replace(/\s+/g, " "));
  }

  return filtered;
}

async function renderPdfPageToPng({ pdfPath, page, ppi, outPngPath }) {
  const outBase = outPngPath.replace(/\.png$/i, "");
  await fs.mkdir(path.dirname(outPngPath), { recursive: true });

  await execFileAsync(
    "pdftocairo",
    [
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
    ],
    { windowsHide: true }
  );
}

async function main() {
  const pdfArg = parseArgValue("--pdf");
  const outDirArg = parseArgValue("--outDir");
  const imagesDirArg = parseArgValue("--imagesDir");
  const pagesArg = parseArgValue("--pages");
  const langArg = parseArgValue("--lang");
  const ppiArg = parseArgValue("--ppi");
  const whitelistArg = parseArgValue("--whitelist");
  const psmArg = parseIntArg({ flag: "--psm", defaultValue: 6 });
  const forceArg = process.argv.includes("--force");

  const workspaceRoot = process.cwd();
  const pdfPath = pdfArg
    ? path.resolve(workspaceRoot, pdfArg)
    : path.join(workspaceRoot, "site", "משוואות.pdf");
  if (!(await fileExists(pdfPath))) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }

  const outDir = outDirArg
    ? path.resolve(workspaceRoot, outDirArg)
    : path.join(workspaceRoot, "pages", "משוואות", "ocr");

  const imagesDir = imagesDirArg
    ? path.resolve(workspaceRoot, imagesDirArg)
    : path.join(workspaceRoot, "tmp", "equations-ocr-png");

  const ppi = Number.parseInt(ppiArg ?? "400", 10);
  if (!Number.isFinite(ppi) || ppi < 72 || ppi > 600) {
    console.error("Invalid --ppi. Expected an integer between 72 and 600.");
    process.exit(2);
  }

  const psm = psmArg;
  if (!Number.isInteger(psm) || psm < 0 || psm > 13) {
    console.error("Invalid --psm. Expected an integer between 0 and 13.");
    process.exit(2);
  }

  const lang = langArg ?? "eng";

  const total = await pdfPageCount(pdfPath);
  const pages = pagesArg ? parsePagesArg(pagesArg) : Array.from({ length: total }, (_, i) => i + 1);
  const wanted = pages.filter((p) => p >= 1 && p <= total);
  if (wanted.length === 0) {
    console.error(
      "Usage: node scripts/ocr-equations-topic.mjs [--pdf site/משוואות.pdf] [--outDir pages/משוואות/ocr] [--imagesDir tmp/equations-ocr-png] [--pages 1-3] [--lang eng] [--ppi 400] [--psm 6] [--whitelist <chars>] [--force]"
    );
    process.exit(2);
  }

  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(imagesDir, { recursive: true });

  const worker = await createWorker(lang);
  await worker.setParameters({
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: String(psm),
    // Encourage equation-like characters.
    tessedit_char_whitelist:
      whitelistArg ?? "0123456789xyzXYZ+-=*/().,[]{}\\\\|^_\\u221a",
  });

  try {
    for (let i = 0; i < wanted.length; i++) {
      const page = wanted[i];
      const name = `page-${pad2(page)}`;
      const pngPath = path.join(imagesDir, `${name}.png`);
      const rawOutPath = path.join(outDir, `${name}.raw.txt`);
      const cleanedOutPath = path.join(outDir, `${name}.txt`);

      if (!forceArg && (await fileExists(cleanedOutPath)) && (await fileExists(rawOutPath))) {
        if ((i + 1) % 10 === 0 || i === wanted.length - 1) {
          console.log(`OCR ${i + 1}/${wanted.length}: (skip) page ${page}`);
        }
        continue;
      }

      await renderPdfPageToPng({ pdfPath, page, ppi, outPngPath: pngPath });

      const { data } = await worker.recognize(pngPath);
      const rawText = data?.text ?? "";
      const cleanedLines = cleanOcrLines(rawText);

      await fs.writeFile(rawOutPath, normalizeWhitespace(rawText) + "\n", "utf8");
      await fs.writeFile(cleanedOutPath, cleanedLines.join("\n") + "\n", "utf8");

      if ((i + 1) % 5 === 0 || i === wanted.length - 1) {
        console.log(`OCR ${i + 1}/${wanted.length}: wrote ${path.relative(workspaceRoot, cleanedOutPath)}`);
      }
    }
  } finally {
    await worker.terminate();
  }

  console.log(`OK: OCR outputs in ${path.relative(workspaceRoot, outDir)}`);
}

main().catch((err) => {
  console.error(String(err?.stack || err));
  process.exitCode = 1;
});
