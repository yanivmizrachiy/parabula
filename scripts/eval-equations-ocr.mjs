import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

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

async function main() {
  const workspaceRoot = process.cwd();

  const dirArg = parseArgValue("--dir") ?? path.join("pages", "משוואות", "ocr");
  const pagesArg = parseArgValue("--pages");
  const minArg = parseIntArg({ flag: "--min", defaultValue: 6 });
  const maxBadArg = parseIntArg({ flag: "--maxBad", defaultValue: 20 });

  const dirPath = path.resolve(workspaceRoot, dirArg);

  const wantedPages = pagesArg ? new Set(parsePagesArg(pagesArg)) : null;

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && /^page-(\d\d)\.txt$/i.test(e.name))
    .map((e) => e.name)
    .sort();

  const bad = [];
  let min = Number.POSITIVE_INFINITY;
  let max = 0;

  for (const file of files) {
    const m = file.match(/^page-(\d\d)\.txt$/i);
    if (!m) continue;
    const page = Number.parseInt(m[1], 10);
    if (wantedPages && !wantedPages.has(page)) continue;

    const fullPath = path.join(dirPath, file);
    const text = await fs.readFile(fullPath, "utf8");
    const eqs = extractEquations(text);

    min = Math.min(min, eqs.length);
    max = Math.max(max, eqs.length);

    if (eqs.length < minArg) {
      bad.push({ page, n: eqs.length, sample: eqs.slice(0, 10) });
    }
  }

  bad.sort((a, b) => a.n - b.n || a.page - b.page);

  const result = {
    dir: path.relative(workspaceRoot, dirPath).replace(/\\/g, "/"),
    min: Number.isFinite(min) ? min : 0,
    max,
    badCount: bad.length,
    bad: bad.slice(0, maxBadArg),
    hint:
      "Try: node scripts/eval-equations-ocr.mjs --min 6 | or rerun OCR with scripts/ocr-equations-topic.mjs --ppi 600 --psm 11",
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main().catch((err) => {
  console.error(String(err?.stack || err));
  process.exitCode = 1;
});
