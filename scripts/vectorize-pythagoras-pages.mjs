import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { PNG } from "pngjs";
import ImageTracer from "imagetracerjs";
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

function pad2(n) {
  return String(n).padStart(2, "0");
}

function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, value | 0));
}

function fillRectWhite(png, x0, y0, x1, y1) {
  const width = png.width;
  const height = png.height;
  const left = clampInt(Math.min(x0, x1), 0, width - 1);
  const right = clampInt(Math.max(x0, x1), 0, width - 1);
  const top = clampInt(Math.min(y0, y1), 0, height - 1);
  const bottom = clampInt(Math.max(y0, y1), 0, height - 1);

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const idx = (width * y + x) << 2;
      png.data[idx] = 255;
      png.data[idx + 1] = 255;
      png.data[idx + 2] = 255;
      png.data[idx + 3] = 255;
    }
  }
}

function extractSvgInner(svg) {
  const start = svg.indexOf(">", svg.indexOf("<svg"));
  const end = svg.lastIndexOf("</svg>");
  if (start === -1 || end === -1 || end <= start) return svg;
  return svg.slice(start + 1, end).trim();
}

function stripWhitePaths(svgInner) {
  // imagetracer often emits a full-page white path; we already draw a white rect.
  return svgInner
    .replace(/<path[^>]*fill="rgb\(255,255,255\)"[^>]*>\s*<\/path>\s*/g, "")
    .replace(/<path[^>]*fill="rgb\(255,255,255\)"[^>]*\/>\s*/g, "");
}

function parseTsvWords(tsv) {
  // TSV columns:
  // level, page_num, block_num, par_num, line_num, word_num, left, top, width, height, conf, text
  const lines = String(tsv ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .slice(1);

  const words = [];
  for (const line of lines) {
    if (!line) continue;
    const cols = line.split("\t");
    if (cols.length < 12) continue;

    const level = Number.parseInt(cols[0], 10);
    // 5 == word level
    if (level !== 5) continue;

    const left = Number.parseInt(cols[6], 10);
    const top = Number.parseInt(cols[7], 10);
    const width = Number.parseInt(cols[8], 10);
    const height = Number.parseInt(cols[9], 10);
    const confidence = Number.parseFloat(cols[10]);
    const text = cols[11] ?? "";
    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height)) continue;

    words.push({
      text,
      confidence,
      bbox: {
        x0: left,
        y0: top,
        x1: left + width,
        y1: top + height,
      },
    });
  }
  return words;
}

function buildTextLayer(words) {
  const pieces = [];
  for (const word of words) {
    const text = (word.text ?? "").trim();
    if (!text) continue;
    const bbox = word.bbox;
    if (!bbox) continue;

    const x0 = bbox.x0;
    const y0 = bbox.y0;
    const x1 = bbox.x1;
    const y1 = bbox.y1;
    const height = Math.max(1, y1 - y0);

    // Approximate baseline: y1 - 0.2h (works OK for tesseract bboxes)
    const baselineY = y1 - Math.round(height * 0.2);

    // Heuristic: treat Hebrew (or mixed Hebrew) as RTL, anchor to right edge.
    const isHebrew = /[\u0590-\u05FF]/.test(text);
    const anchor = isHebrew ? "end" : "start";
    const x = isHebrew ? x1 : x0;

    const fontSize = Math.max(10, Math.round(height * 0.9));

    const cls = isHebrew ? "pyt-word pyt-rtl" : "pyt-word pyt-ltr";

    pieces.push(
      `<text class="${cls}" x="${x}" y="${baselineY}" font-size="${fontSize}" text-anchor="${anchor}">${escapeXml(text)}</text>`
    );
  }
  return pieces.join("\n");
}

async function main() {
  const pagesArg = parseArgValue("--pages");
  const inDirArg = parseArgValue("--inputDir");
  const outDirArg = parseArgValue("--outDir");

  const pages = parsePagesArg(pagesArg);
  if (pages.length === 0) {
    console.error(
      "Usage: node scripts/vectorize-pythagoras-pages.mjs --pages 4,5,6 [--inputDir assets/pythagoras/pdf] [--outDir assets/pythagoras/vector]"
    );
    process.exit(2);
  }

  const workspaceRoot = process.cwd();
  const inputDir = inDirArg
    ? path.resolve(workspaceRoot, inDirArg)
    : path.join(workspaceRoot, "assets", "pythagoras", "pdf");

  const outDir = outDirArg
    ? path.resolve(workspaceRoot, outDirArg)
    : path.join(workspaceRoot, "assets", "pythagoras", "vector");

  await fs.mkdir(outDir, { recursive: true });

  const worker = await createWorker("heb+eng");
  await worker.setParameters({
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: "6",
  });

  const tracerOptions = {
    // Use fixed palette (includes pure black) to avoid missing line art
    colorsampling: 0,
    numberofcolors: 2,
    colorquantcycles: 1,
    // Reduce noise / simplify
    ltres: 1,
    qtres: 1,
    pathomit: 8,
    // Output
    strokewidth: 0,
    scale: 1,
    viewbox: true,
  };

  try {
    for (const page of pages) {
      const name = `page-${pad2(page)}`;
      const pngPath = path.join(inputDir, `${name}.png`);
      const outPath = path.join(outDir, `${name}.svg`);

      const pngBuffer = await fs.readFile(pngPath);
      const png = PNG.sync.read(pngBuffer);

      const { data } = await worker.recognize(
        pngPath,
        {},
        {
          text: false,
          tsv: true,
        }
      );
      const words = parseTsvWords(data?.tsv)
        .filter((w) => (w?.text ?? "").trim().length > 0)
        .filter((w) => (w?.confidence ?? 0) >= 30);

      // Build a copy for tracing (remove all word bboxes to avoid tracing text)
      const tracePng = new PNG({ width: png.width, height: png.height });
      png.data.copy(tracePng.data);

      for (const word of words) {
        const bbox = word.bbox;
        if (!bbox) continue;
        const pad = 2;
        fillRectWhite(tracePng, bbox.x0 - pad, bbox.y0 - pad, bbox.x1 + pad, bbox.y1 + pad);
      }

      const imageData = {
        width: tracePng.width,
        height: tracePng.height,
        data: new Uint8ClampedArray(tracePng.data),
      };

      const tracedSvg = ImageTracer.imagedataToSVG(imageData, tracerOptions);
      const tracedInner = stripWhitePaths(extractSvgInner(tracedSvg));
      const textLayer = buildTextLayer(words);

      const finalSvg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<svg xmlns="http://www.w3.org/2000/svg" width="${png.width}" height="${png.height}" viewBox="0 0 ${png.width} ${png.height}">\n` +
        `<style>\n` +
        `  .pyt-art path{ fill:#000; }\n` +
        `  .pyt-word{ fill:#000; font-family:'Rubik',sans-serif; font-weight:400; }\n` +
        `  .pyt-rtl{ direction:rtl; unicode-bidi:plaintext; }\n` +
        `  .pyt-ltr{ direction:ltr; unicode-bidi:plaintext; }\n` +
        `</style>\n` +
        `<rect width="100%" height="100%" fill="#fff"/>\n` +
        `<g class="pyt-art">\n${tracedInner}\n</g>\n` +
        `<g class="pyt-text">\n${textLayer}\n</g>\n` +
        `</svg>\n`;

      await fs.writeFile(outPath, finalSvg, "utf8");
      console.log(`Vectorized page ${page}: wrote ${path.relative(workspaceRoot, outPath)} (words: ${words.length})`);
    }
  } finally {
    await worker.terminate();
  }
}

await main();
