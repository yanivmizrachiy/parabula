import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(relPath) {
	return fs.readFileSync(relPath, 'utf8');
}

function normalizeCss(css, pageSelector) {
	return css
		.replaceAll(pageSelector, '.page-X')
		.replace(/\r\n/g, '\n')
		.replace(/\/\*[^]*?\*\//g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function normalizeHtml(html, pageClass) {
	return html
		.replace(/\r\n/g, '\n')
		.replaceAll(pageClass, 'page-X')
		.replace(/\s+/g, ' ')
		.trim();
}

function firstDiffContext(a, b, context = 100) {
	let i = 0;
	const max = Math.min(a.length, b.length);
	while (i < max && a[i] === b[i]) i++;
	return {
		index: i,
		a: a.slice(Math.max(0, i - context), i + context),
		b: b.slice(Math.max(0, i - context), i + context),
	};
}

function count(re, text) {
	const m = text.match(re);
	return m ? m.length : 0;
}

function auditHtmlStructure(html, pageName) {
	assert.ok(/class="pyt-body"/u.test(html), `${pageName}: missing .pyt-body`);
	assert.ok(/class="pyt-tri-grid"/u.test(html), `${pageName}: missing .pyt-tri-grid`);
	assert.equal(count(/class="problem-block\b/gu, html), 6, `${pageName}: expected 6 .problem-block`);
	assert.equal(count(/class="solution-space\b/gu, html), 6, `${pageName}: expected 6 .solution-space`);
	assert.ok(/class="pyt-footer"/u.test(html), `${pageName}: missing .pyt-footer`);
	assert.equal(count(/class="pyt-solution\b/gu, html), 6, `${pageName}: expected 6 .pyt-solution`);
	assert.ok(!/\$/u.test(html), `${pageName}: must not contain $ math delimiters`);
	assert.ok(/\\\(x\\\)/u.test(html), `${pageName}: expected MathJax inline \\(x\\)`);
}

function main() {
	const css9 = read('styles/pages/עמוד-9.css');
	const css10 = read('styles/pages/עמוד-10.css');
	const n9 = normalizeCss(css9, '.page-9');
	const n10 = normalizeCss(css10, '.page-10');

	if (n9 === n10) {
		console.log('CSS OK: page-9 and page-10 rules match after normalization.');
	} else {
		console.log('CSS DIFF: page-9 and page-10 differ after normalization.');
		const diff = firstDiffContext(n9, n10);
		console.log('First diff index:', diff.index);
		console.log('Context page-9:', diff.a);
		console.log('Context page-10:', diff.b);
	}

	const html9 = read('עמוד-9.html');
	const html10 = read('עמוד-10.html');
	auditHtmlStructure(html9, 'עמוד-9.html');
	auditHtmlStructure(html10, 'עמוד-10.html');

	const h9 = normalizeHtml(html9, 'page-9');
	const h10 = normalizeHtml(html10, 'page-10');

	// We expect content differences (different SVG coordinates and answers), so only compare layout scaffolding signatures.
	const scaffoldRe = /class="(a4-page|question-block|pyt-body|q-main|pyt-tri-grid|problem-block|problem-top|bullet-num|problem-work|problem-figure|pyt-tri-svg|solution-space|problem-answer|pyt-footer|pyt-solutions|pyt-solution)\b/gu;
	const sig9 = (h9.match(scaffoldRe) ?? []).join('|');
	const sig10 = (h10.match(scaffoldRe) ?? []).join('|');

	if (sig9 === sig10) {
		console.log('HTML OK: scaffolding class signature matches (allowing content differences).');
	} else {
		console.log('HTML WARN: scaffolding signature differs.');
		const diff = firstDiffContext(sig9, sig10, 140);
		console.log('First diff index:', diff.index);
		console.log('Sig page-9:', diff.a);
		console.log('Sig page-10:', diff.b);
	}
}

try {
	main();
} catch (err) {
	console.error(err?.stack || String(err));
	process.exitCode = 1;
}
