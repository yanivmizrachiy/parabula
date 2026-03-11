import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import puppeteer from 'puppeteer';

function firstExistingFile(paths) {
  for (const p of paths) {
    if (!p) continue;
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return '';
}

function findBrowserExecutable() {
  const envPath = String(process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || '').trim();
  if (envPath && fs.existsSync(envPath)) return envPath;

  const programFiles = process.env.PROGRAMFILES || '';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || '';
  const localAppData = process.env.LOCALAPPDATA || '';

  const candidates = [
    programFiles && path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    programFilesX86 && path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    localAppData && path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    programFiles && path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    programFilesX86 && path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    localAppData && path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ];

  return firstExistingFile(candidates);
}

async function main() {
  const repoRoot = path.resolve(import.meta.dirname, '..');

  // Topic page badge "3" for גרף עולה/יורד is pages/.../עמוד-2/index.html.
  const filePath = path.join(repoRoot, 'pages', 'גרף-עולה-יורד-קבוע', 'עמוד-2', 'index.html');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing topic page: ${filePath}`);
  }

  const executablePath = findBrowserExecutable();
  const launchOptions = {
    headless: 'new',
    ...(executablePath ? { executablePath } : {})
  };

  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(45_000);
    page.setDefaultTimeout(45_000);

    // Use a generous viewport; we care about layout inside the A4 container.
    await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });

    const url = pathToFileURL(filePath).toString();
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const tasks = [];
      try {
        if (document.fonts && document.fonts.ready) tasks.push(document.fonts.ready.catch(() => undefined));
      } catch {
        // ignore
      }
      tasks.push(sleep(150));
      await Promise.race([Promise.all(tasks), sleep(1500)]);
    });

    const result = await page.evaluate(() => {
      const pageEl = document.querySelector('.page');
      if (!pageEl) {
        return { ok: false, reason: 'missing .page container' };
      }

      const pageRect = pageEl.getBoundingClientRect();
      const pad = 0.5;

      const candidates = Array.from(
        pageEl.querySelectorAll(
          [
            '.answer-box',
            '.choice-box',
            '.checkbox',
            '.answers-grid',
            '.answeritem'
          ].join(', ')
        )
      );

      const offenders = [];
      for (const el of candidates) {
        const r = el.getBoundingClientRect();
        if (
          r.left < pageRect.left - pad ||
          r.right > pageRect.right + pad ||
          r.top < pageRect.top - pad ||
          r.bottom > pageRect.bottom + pad
        ) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            className: String(el.getAttribute('class') || ''),
            left: Math.round(r.left),
            right: Math.round(r.right),
            top: Math.round(r.top),
            bottom: Math.round(r.bottom)
          });
          if (offenders.length >= 20) break;
        }
      }

      const scrollHeight = pageEl.scrollHeight;
      const clientHeight = pageEl.clientHeight;
      const scrollWidth = pageEl.scrollWidth;
      const clientWidth = pageEl.clientWidth;
      const overflowY = scrollHeight > clientHeight + 1;
      const overflowX = scrollWidth > clientWidth + 1;

      return {
        ok: offenders.length === 0 && !overflowX && !overflowY,
        offenders,
        overflowX,
        overflowY,
        scrollHeight,
        clientHeight,
        scrollWidth,
        clientWidth
      };
    });

    if (!result.ok) {
      const extra = result.reason
        ? `Reason: ${result.reason}`
        : `overflowX=${result.overflowX}, overflowY=${result.overflowY}, offenders=${result.offenders.length}`;
      console.error(`FAIL: graph topic page-badge 3 A4 bounds check. ${extra}`);
      if (Array.isArray(result.offenders) && result.offenders.length > 0) {
        for (const o of result.offenders) {
          console.error(`- <${o.tag} class="${o.className}"> rect=[${o.left},${o.top}..${o.right},${o.bottom}]`);
        }
      }
      process.exitCode = 1;
      return;
    }

    console.log('OK: graph topic page-badge 3 student boxes are within A4 bounds (.page)');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(String(err?.stack || err));
  process.exitCode = 1;
});
