import { createWorker } from "tesseract.js";

function parseTsvWords(tsv) {
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
    if (level !== 5) continue;

    const left = Number.parseInt(cols[6], 10);
    const top = Number.parseInt(cols[7], 10);
    const width = Number.parseInt(cols[8], 10);
    const height = Number.parseInt(cols[9], 10);
    const confidence = Number.parseFloat(cols[10]);
    const text = (cols[11] ?? "").trim();

    if (!text) continue;
    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height)) continue;

    words.push({
      text,
      confidence,
      bbox: { x0: left, y0: top, x1: left + width, y1: top + height },
    });
  }
  return words;
}

function normalizeText(text) {
  return String(text ?? "").replace(/[\u200e\u200f\u200b]/g, "").trim();
}

function isHebrewSubpartLabel(text) {
  const cleaned = normalizeText(text).replace(/\s/g, "");
  return /^[אבגדהו][\.]?$/.test(cleaned);
}

const sources = [
  { name: "p01_xref17.jpeg", path: "assets/pythagoras/figures/p01_xref17.jpeg" },
  { name: "p01_xref18.png", path: "assets/pythagoras/figures/p01_xref18.png" },
];

const worker = await createWorker("heb+eng");
await worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: "6" });

try {
  for (const src of sources) {
    const { data } = await worker.recognize(src.path, {}, { text: false, tsv: true });
    const words = parseTsvWords(data?.tsv);

    const hits = words
      .filter((w) => (w.confidence ?? 0) >= 10)
      .filter((w) => isHebrewSubpartLabel(w.text))
      .map((w) => ({ ...w, text: normalizeText(w.text) }));

    console.log(`\n== ${src.name} ==`);
    console.log(`wordCount=${words.length} hits=${hits.length}`);

    // Sort roughly top-to-bottom then right-to-left (Hebrew)
    hits.sort((a, b) => a.bbox.y0 - b.bbox.y0 || b.bbox.x0 - a.bbox.x0);

    for (const h of hits) {
      console.log(`${h.text}\tconf=${Math.round(h.confidence)}\tbbox=${JSON.stringify(h.bbox)}`);
    }
  }
} finally {
  await worker.terminate();
}
