import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function listHtmlPages() {
	return readdirSync(ROOT)
		.filter((name) => /^עמוד-\d+\.html$/u.test(name))
		.sort((a, b) => {
			const na = Number(a.match(/\d+/u)[0]);
			const nb = Number(b.match(/\d+/u)[0]);
			return na - nb;
		});
}

function analyze(fileName) {
	const fullPath = path.join(ROOT, fileName);
	const text = readFileSync(fullPath, 'utf8');

	const issues = [];

	const openCount = (text.match(/<html\b/giu) ?? []).length;
	const closeCount = (text.match(/<\/html>/giu) ?? []).length;
	if (openCount !== 1) issues.push(`expected exactly 1 <html>, found ${openCount}`);
	if (closeCount !== 1) issues.push(`expected exactly 1 </html>, found ${closeCount}`);

	const closeIdx = text.toLowerCase().lastIndexOf('</html>');
	if (closeIdx !== -1) {
		const tail = text.slice(closeIdx + '</html>'.length);
		if (tail.trim().length > 0) issues.push('non-whitespace content exists after </html>');
	} else {
		issues.push('missing </html>');
	}

	return { fileName, issues };
}

function main() {
	const pages = listHtmlPages();
	if (pages.length === 0) {
		console.log('No pages found.');
		return;
	}

	const results = pages.map(analyze);
	const bad = results.filter((r) => r.issues.length > 0);

	if (bad.length === 0) {
		console.log(`OK: ${pages.length} HTML pages passed integrity checks.`);
		return;
	}

	console.log(`FAIL: ${bad.length}/${pages.length} pages have integrity issues:`);
	for (const r of bad) {
		console.log(`- ${r.fileName}: ${r.issues.join('; ')}`);
	}
	process.exitCode = 1;
}

main();
