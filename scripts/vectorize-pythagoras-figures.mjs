import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import ImageTracer from "imagetracerjs";
import { createWorker } from "tesseract.js";

function parseArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function parseListArg(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, value | 0));
}

function fillRectWhite(image, x0, y0, x1, y1) {
  const width = image.width;
  const height = image.height;
  const left = clampInt(Math.min(x0, x1), 0, width - 1);
  const right = clampInt(Math.max(x0, x1), 0, width - 1);
  const top = clampInt(Math.min(y0, y1), 0, height - 1);
  const bottom = clampInt(Math.max(y0, y1), 0, height - 1);

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const idx = (width * y + x) << 2;
      image.data[idx] = 255;
      image.data[idx + 1] = 255;
      image.data[idx + 2] = 255;
      image.data[idx + 3] = 255;
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
  return svgInner
    .replace(
      /<path[^>]*fill="rgb\((?:25[0-5]|24[8-9]),(?:25[0-5]|24[8-9]),(?:25[0-5]|24[8-9])\)"[^>]*>\s*<\/path>\s*/g,
      ""
    )
    .replace(
      /<path[^>]*fill="rgb\((?:25[0-5]|24[8-9]),(?:25[0-5]|24[8-9]),(?:25[0-5]|24[8-9])\)"[^>]*\/>\s*/g,
      ""
    );
}
          const finalSvg =
function parseTsvWords(tsv) {
  const lines = String(tsv ?? "")
    .replace(/\r\n/g, "\n")
            `  .pyt-art path:not([fill="rgb(255,255,255)"]):not([fill="rgb(254,254,254)"]):not([fill="rgb(253,253,253)"]):not([fill="rgb(252,252,252)"]){ fill:#000; }\n` +
    .slice(1);

  const words = [];
  for (const line of lines) {
    if (!line) continue;
    const cols = line.split("\t");
    if (cols.length < 12) continue;

    const level = Number.parseInt(cols[0], 10);
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
      bbox: { x0: left, y0: top, x1: left + width, y1: top + height },
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
    const baselineY = y1 - Math.round(height * 0.2);

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

async function decodeImage(filePath) {
  const buffer = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".png") {
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
  }

  if (ext === ".jpg" || ext === ".jpeg") {
    const decoded = jpeg.decode(buffer, { useTArray: true });
    return { width: decoded.width, height: decoded.height, data: new Uint8ClampedArray(decoded.data) };
  }

  throw new Error(`Unsupported image extension: ${ext}`);
}

async function main() {
  const filesArg = parseArgValue("--files");
  const inDirArg = parseArgValue("--inputDir");
  const outDirArg = parseArgValue("--outDir");

  const files = parseListArg(filesArg);
  if (files.length === 0) {
    console.error(
      "Usage: node scripts/vectorize-pythagoras-figures.mjs --files p01_xref17.jpeg,p01_xref18.png [--inputDir assets/pythagoras/figures] [--outDir assets/pythagoras/figures-vector]"
    );
    process.exit(2);
  }

  const workspaceRoot = process.cwd();
  const inputDir = inDirArg
    ? path.resolve(workspaceRoot, inDirArg)
    : path.join(workspaceRoot, "assets", "pythagoras", "figures");

  const outDir = outDirArg
    ? path.resolve(workspaceRoot, outDirArg)
    : path.join(workspaceRoot, "assets", "pythagoras", "figures-vector");

  await fs.mkdir(outDir, { recursive: true });

  const worker = await createWorker("heb+eng");
  await worker.setParameters({
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: "6",
  });

  const tracerOptions = {
    colorsampling: 0,
    numberofcolors: 2,
    pal: [
      { r: 255, g: 255, b: 255, a: 255 },
      { r: 0, g: 0, b: 0, a: 255 },
    ],
    ltres: 1,
    qtres: 1,
    pathomit: 2,
    strokewidth: 0,
    scale: 1,
    viewbox: true,
  };

  try {
    for (const file of files) {
      const inPath = path.join(inputDir, file);
      const baseName = path.basename(file, path.extname(file));
      const outPath = path.join(outDir, `${baseName}.svg`);

      const image = await decodeImage(inPath);

      const { data } = await worker.recognize(inPath, {}, { text: false, tsv: true });
      const wordsAll = parseTsvWords(data?.tsv)
        .filter((w) => (w?.text ?? "").trim().length > 0)
        .filter((w) => (w?.confidence ?? 0) >= 30);

      // Copy for tracing and remove OCR words to avoid tracing text outlines.
      const traceData = new Uint8ClampedArray(image.data);
      const traceImage = { width: image.width, height: image.height, data: traceData };

      for (const word of wordsAll) {
        const bbox = word.bbox;
        if (!bbox) continue;
        const pad = 2;
        fillRectWhite(traceImage, bbox.x0 - pad, bbox.y0 - pad, bbox.x1 + pad, bbox.y1 + pad);
      }

      const tracedSvg = ImageTracer.imagedataToSVG(traceImage, tracerOptions);
      const tracedInner = stripWhitePaths(extractSvgInner(tracedSvg));
      const textLayer = buildTextLayer(wordsAll);

      const finalSvg =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<svg xmlns="http://www.w3.org/2000/svg" width="${image.width}" height="${image.height}" viewBox="0 0 ${image.width} ${image.height}">\n` +
        `<style>\n` +
        `  .pyt-word{ fill:#000; font-family:'Rubik',sans-serif; font-weight:400; }\n` +
        `  .pyt-rtl{ direction:rtl; unicode-bidi:plaintext; }\n` +
        `  .pyt-ltr{ direction:ltr; unicode-bidi:plaintext; }\n` +
        `</style>\n` +
        `<rect width="100%" height="100%" fill="#fff"/>\n` +
        `<g class="pyt-art">\n${tracedInner}\n</g>\n` +
        `<g class="pyt-text">\n${textLayer}\n</g>\n` +
        `</svg>\n`;

      await fs.writeFile(outPath, finalSvg, "utf8");
      console.log(
        `Vectorized figure ${file}: wrote ${path.relative(workspaceRoot, outPath)} (words: ${wordsAll.length})`
      );
    }
  } finally {
    await worker.terminate();
  }
}

await main();
