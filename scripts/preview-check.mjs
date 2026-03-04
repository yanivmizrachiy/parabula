import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT_PAGE_RE = /^עמוד-\d+\.html$/u;
const SITE_PAGE_RE = /^site\/[\s\S]+?\/עמוד-\d+\.html$/u;

function isSupportedTocEntry(file) {
  const f = String(file || '').replace(/\\/g, '/');
  return ROOT_PAGE_RE.test(f) || SITE_PAGE_RE.test(f);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
    // Chrome
    programFiles && path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    programFilesX86 && path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    localAppData && path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    // Edge (almost always present on Windows)
    programFiles && path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    programFilesX86 && path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    localAppData && path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ];

  return firstExistingFile(candidates);
}

async function fetchOk(url) {
  const res = await fetch(url, { redirect: 'manual' });
  if (res.status !== 200) {
    const body = await res.text().catch(() => '');
    throw new Error(`Expected 200 for ${url}, got ${res.status}${body ? `\n${body.slice(0, 500)}` : ''}`);
  }
  return res;
}

function collectFilesFromToc(toc) {
  const files = [];
  if (toc && Array.isArray(toc.topics)) {
    for (const topic of toc.topics) {
      if (!topic || !Array.isArray(topic.pages)) continue;
      for (const p of topic.pages) {
        if (p && typeof p.file === 'string') files.push(p.file);
      }
    }
  }
  if (toc && Array.isArray(toc.flat)) {
    for (const p of toc.flat) {
      if (p && typeof p.file === 'string') files.push(p.file);
    }
  }
  return files;
}

async function runHeadlessGuardrails(base, files) {
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

    /** @type {{file: string, problems: string[]}[]} */
    const failures = [];

    for (const file of files) {
      const url = `${base}/${encodeURIComponent(file)}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      await page.evaluate(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const tasks = [];
        try {
          if (document.fonts && document.fonts.ready) tasks.push(document.fonts.ready.catch(() => undefined));
        } catch {
          // ignore
        }
        try {
          const mj = globalThis.MathJax;
          if (mj && mj.startup && mj.startup.promise) tasks.push(mj.startup.promise.catch(() => undefined));
        } catch {
          // ignore
        }
        tasks.push(sleep(150));
        await Promise.race([Promise.all(tasks), sleep(1500)]);
      });

      const result = await page.evaluate(() => {
        function isRasterImageSrc(src) {
          const s = String(src || '').trim().toLowerCase();
          return s.endsWith('.png') || s.endsWith('.jpg') || s.endsWith('.jpeg') || s.endsWith('.webp') || s.endsWith('.gif');
        }

        const pageEl = document.querySelector('main.a4-page');
        const hasA4 = Boolean(pageEl);
        const hasHeader = Boolean(pageEl && pageEl.querySelector('.header-container'));
        const hasTitle = Boolean(pageEl && pageEl.querySelector('.page-title'));
        const hasNumber = Boolean(pageEl && pageEl.querySelector('.page-number'));

        let hasRasterImages = false;
        if (pageEl) {
          const imgs = Array.from(pageEl.querySelectorAll('img'));
          hasRasterImages = imgs.some((img) => isRasterImageSrc(img.getAttribute('src')));
        }

        let overflowY = false;
        let overflowX = false;
        let scrollHeight = 0;
        let clientHeight = 0;
        let scrollWidth = 0;
        let clientWidth = 0;
        if (pageEl) {
          scrollHeight = pageEl.scrollHeight;
          clientHeight = pageEl.clientHeight;
          overflowY = scrollHeight > clientHeight + 1;
          scrollWidth = pageEl.scrollWidth;
          clientWidth = pageEl.clientWidth;
          overflowX = scrollWidth > clientWidth + 1;
        }

        let outOfBounds = false;
        if (pageEl) {
          const pageRect = pageEl.getBoundingClientRect();
          const pad = 0.5;
          const candidates = Array.from(
            pageEl.querySelectorAll('.pyt-footer, .eq-footer, .pyt-solutions, .eq-solutions, .solution-space, img, svg')
          );
          for (const el of candidates) {
            const r = el.getBoundingClientRect();
            if (
              r.left < pageRect.left - pad ||
              r.right > pageRect.right + pad ||
              r.top < pageRect.top - pad ||
              r.bottom > pageRect.bottom + pad
            ) {
              outOfBounds = true;
              break;
            }
          }
        }

        return {
          hasA4,
          hasHeader,
          hasTitle,
          hasNumber,
          hasRasterImages,
          overflowY,
          overflowX,
          outOfBounds,
          scrollHeight,
          clientHeight,
          scrollWidth,
          clientWidth
        };
      });

      /** @type {string[]} */
      const problems = [];
      if (!result.hasA4) problems.push('missing main.a4-page');
      if (!result.hasHeader) problems.push('missing .header-container');
      if (!result.hasTitle) problems.push('missing .page-title');
      if (!result.hasNumber) problems.push('missing .page-number');
      if (result.hasRasterImages) problems.push('raster <img> detected (png/jpg/webp/gif)');
      if (result.overflowY) problems.push(`A4 vertical overflow (scrollHeight=${result.scrollHeight}, clientHeight=${result.clientHeight})`);
      if (result.overflowX) problems.push(`A4 horizontal overflow (scrollWidth=${result.scrollWidth}, clientWidth=${result.clientWidth})`);
      if (result.outOfBounds) problems.push('A4 out-of-bounds element(s) detected');

      if (problems.length > 0) failures.push({ file, problems });
    }

    return failures;
  } finally {
    await browser.close();
  }
}

async function startPreviewServer() {
  const child = spawn(process.execPath, ['preview/server.mjs'], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '0'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const start = Date.now();
  const timeoutMs = 15_000;

  while (Date.now() - start < timeoutMs) {
    const m = stdout.match(/Preview server running:\s*(http:\/\/[^\s]+)\//u);
    if (m) {
      const base = m[1];
      return { child, base, getLogs: () => ({ stdout, stderr }) };
    }

    if (child.exitCode != null) {
      const logs = { stdout, stderr };
      throw new Error(`Preview server exited early (code=${child.exitCode}).\nSTDOUT:\n${logs.stdout}\nSTDERR:\n${logs.stderr}`);
    }

    await sleep(50);
  }

  const logs = { stdout, stderr };
  throw new Error(`Timed out waiting for preview server to start.\nSTDOUT:\n${logs.stdout}\nSTDERR:\n${logs.stderr}`);
}

async function stopPreviewServer(child) {
  if (!child || child.exitCode != null) return;

  child.kill('SIGTERM');

  const start = Date.now();
  const timeoutMs = 5_000;
  while (Date.now() - start < timeoutMs) {
    if (child.exitCode != null) return;
    await sleep(50);
  }

  // Force kill if still alive
  try {
    child.kill('SIGKILL');
  } catch {
    // ignore
  }
}

async function main() {
  let server;

  try {
    server = await startPreviewServer();
    const base = server.base;

    await fetchOk(`${base}/preview`);

    const tocRes = await fetchOk(`${base}/api/toc`);
    const toc = await tocRes.json();

    const files = Array.from(new Set(collectFilesFromToc(toc)));
    if (files.length === 0) {
      throw new Error('/api/toc returned no files');
    }

    // The TOC may include non-A4 HTML (e.g. built site pages under site/**).
    // Guardrails here are specifically for root A4 textbook pages.
    const rootFiles = files
      .map((f) => String(f || '').replace(/\\/g, '/'))
      .filter((f) => ROOT_PAGE_RE.test(f));

    if (rootFiles.length === 0) {
      const sample = files.slice(0, 10).join(', ');
      throw new Error(`/api/toc returned no root A4 pages (עמוד-*.html). Sample: ${sample}`);
    }

    const failures = await runHeadlessGuardrails(base, rootFiles);
    if (failures.length > 0) {
      console.error('FAIL: headless A4 guardrails detected issues.');
      for (const f of failures.slice(0, 30)) {
        console.error(`- ${f.file}: ${f.problems.join('; ')}`);
      }
      if (failures.length > 30) console.error(`… and ${failures.length - 30} more`);
      process.exitCode = 1;
      return;
    }

    console.log(
      `OK: preview server up (${base}), /preview=200, /api/toc ok (${files.length} entries; ${rootFiles.length} root A4 pages), headless guardrails ok`
    );
  } finally {
    if (server?.child) await stopPreviewServer(server.child);
  }
}

main().catch((err) => {
  console.error(String(err?.stack || err));
  process.exitCode = 1;
});
