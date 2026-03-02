import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const FILES = ["עמוד-9.html", "עמוד-10.html"].map((p) => path.join(ROOT, p));

function clamp(n, min, max) {
	return Math.max(min, Math.min(max, n));
}

function parseViewBox(viewBox) {
	// "minX minY width height"
	const parts = String(viewBox).trim().split(/\s+/).map(Number);
	if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
	const [minX, minY, width, height] = parts;
	return { minX, minY, width, height };
}

function parsePoints(pointsAttr) {
	// "x,y x,y ..."
	const pts = String(pointsAttr)
		.trim()
		.split(/\s+/)
		.map((pair) => pair.split(",").map(Number))
		.filter((p) => p.length === 2 && p.every((n) => Number.isFinite(n)))
		.map(([x, y]) => ({ x, y }));
	if (pts.length < 3) return null;
	// Many polylines close by repeating the first point at the end.
	if (pts.length >= 4) {
		const last = pts[pts.length - 1];
		const first = pts[0];
		if (Math.abs(last.x - first.x) < 1e-6 && Math.abs(last.y - first.y) < 1e-6) {
			pts.pop();
		}
	}
	// Ensure exactly 3 vertices (triangles).
	const uniq = [];
	for (const p of pts) {
		if (!uniq.some((q) => Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.y - p.y) < 1e-6)) uniq.push(p);
		if (uniq.length === 3) break;
	}
	return uniq.length === 3 ? uniq : null;
}

function dist2(a, b) {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return dx * dx + dy * dy;
}

function pointToSegmentDistance2(p, a, b) {
	const abx = b.x - a.x;
	const aby = b.y - a.y;
	const apx = p.x - a.x;
	const apy = p.y - a.y;
	const abLen2 = abx * abx + aby * aby;
	if (abLen2 === 0) return dist2(p, a);
	let t = (apx * abx + apy * aby) / abLen2;
	t = clamp(t, 0, 1);
	const proj = { x: a.x + t * abx, y: a.y + t * aby };
	return dist2(p, proj);
}

function normalize(v) {
	const len = Math.hypot(v.x, v.y);
	if (!len) return { x: 0, y: 0 };
	return { x: v.x / len, y: v.y / len };
}

function add(a, b) {
	return { x: a.x + b.x, y: a.y + b.y };
}

function sub(a, b) {
	return { x: a.x - b.x, y: a.y - b.y };
}

function mul(a, s) {
	return { x: a.x * s, y: a.y * s };
}

function centroidOfTriangle(v0, v1, v2) {
	return { x: (v0.x + v1.x + v2.x) / 3, y: (v0.y + v1.y + v2.y) / 3 };
}

function pickNearestVertex(p, verts) {
	let bestIdx = 0;
	let best = Infinity;
	for (let i = 0; i < verts.length; i++) {
		const d = dist2(p, verts[i]);
		if (d < best) {
			best = d;
			bestIdx = i;
		}
	}
	return verts[bestIdx];
}

function pickNearestEdge(p, verts) {
	const edges = [
		{ a: verts[0], b: verts[1] },
		{ a: verts[1], b: verts[2] },
		{ a: verts[2], b: verts[0] },
	];
	let best = edges[0];
	let bestD = Infinity;
	for (const e of edges) {
		const d2 = pointToSegmentDistance2(p, e.a, e.b);
		if (d2 < bestD) {
			bestD = d2;
			best = e;
		}
	}
	return best;
}

function parseXY(attrValue, dimension) {
	const raw = String(attrValue).trim();
	if (raw.endsWith("%")) {
		const p = Number(raw.slice(0, -1));
		if (!Number.isFinite(p)) return null;
		return (p / 100) * dimension;
	}
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}

function formatNum(n) {
	// Keep it compact but stable.
	return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function rewriteSvgLabels(svgMarkup) {
	const viewBoxMatch = svgMarkup.match(/viewBox\s*=\s*"([^"]+)"/i);
	if (!viewBoxMatch) return svgMarkup;
	const vb = parseViewBox(viewBoxMatch[1]);
	if (!vb) return svgMarkup;

	const edgeMatch = svgMarkup.match(/<polyline[^>]*class\s*=\s*"pyt-tri-edge"[^>]*points\s*=\s*"([^"]+)"[^>]*\/>/i);
	if (!edgeMatch) return svgMarkup;
	const verts = parsePoints(edgeMatch[1]);
	if (!verts) return svgMarkup;

	const triCentroid = centroidOfTriangle(verts[0], verts[1], verts[2]);
	const minDim = Math.min(vb.width, vb.height);
	const pointOffset = minDim * 0.075;
	const sideOffset = minDim * 0.06;

	return svgMarkup.replace(
		/<text\s+([^>]*class\s*=\s*"([^"]*)"[^>]*)>([^<]*)<\/text>/gi,
		(full, attrs, classValue, innerText) => {
			const classes = String(classValue)
				.split(/\s+/)
				.map((s) => s.trim())
				.filter(Boolean);
			const isPoint = classes.includes("pyt-tri-point");
			const isSide = classes.includes("pyt-tri-side") || classes.includes("pyt-tri-x");
			if (!isPoint && !isSide) return full;

			const xMatch = attrs.match(/\bx\s*=\s*"([^"]+)"/i);
			const yMatch = attrs.match(/\by\s*=\s*"([^"]+)"/i);
			if (!xMatch || !yMatch) return full;
			const curX = parseXY(xMatch[1], vb.width);
			const curY = parseXY(yMatch[1], vb.height);
			if (curX == null || curY == null) return full;
			const cur = { x: vb.minX + curX, y: vb.minY + curY };

			let next;
			if (isPoint) {
				const v = pickNearestVertex(cur, verts);
				const dir = normalize(sub(v, triCentroid));
				next = add(v, mul(dir, pointOffset));
			} else {
				const e = pickNearestEdge(cur, verts);
				const mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
				const ev = sub(e.b, e.a);
				let n = normalize({ x: -ev.y, y: ev.x });
				// Flip normal to point outward.
				const toCentroid = sub(triCentroid, mid);
				if (n.x * toCentroid.x + n.y * toCentroid.y > 0) n = mul(n, -1);
				next = add(mid, mul(n, sideOffset));
			}

			// Keep within viewBox bounds with a small margin.
			const margin = minDim * 0.02;
			next.x = clamp(next.x, vb.minX + margin, vb.minX + vb.width - margin);
			next.y = clamp(next.y, vb.minY + margin, vb.minY + vb.height - margin);

			const newAttrs = attrs
				.replace(/\bx\s*=\s*"[^"]+"/i, `x="${formatNum(next.x)}"`)
				.replace(/\by\s*=\s*"[^"]+"/i, `y="${formatNum(next.y)}"`);
			return `<text ${newAttrs}>${innerText}</text>`;
		},
	);
}

function rewriteHtmlFile(html) {
	return html.replace(/<svg\b[\s\S]*?<\/svg>/gi, (svg) => rewriteSvgLabels(svg));
}

let changed = 0;
for (const file of FILES) {
	const before = await fs.readFile(file, "utf8");
	const after = rewriteHtmlFile(before);
	if (after !== before) {
		await fs.writeFile(file, after, "utf8");
		changed++;
	}
}

if (changed === 0) {
	console.log("No changes made.");
} else {
	console.log(`Updated ${changed} file(s): ${FILES.map((f) => path.basename(f)).join(", ")}`);
}
