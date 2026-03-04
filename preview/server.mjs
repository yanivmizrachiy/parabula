import http from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_PORT = Number(process.env.PORT || 5179);
const DEFAULT_HOST = String(process.env.HOST || '127.0.0.1');

/** @type {Set<import('node:http').ServerResponse>} */
const sseClients = new Set();

function isIgnoredPath(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  return (
    normalized.startsWith('.git/') ||
    normalized.startsWith('node_modules/') ||
    normalized.startsWith('.vscode/') ||
    normalized === '.git' ||
    normalized === 'node_modules' ||
    normalized === '.vscode'
  );
}

const A4_PAGE_FILE_RE = /^עמוד-(\d+)\.html$/u;

/** @type {null | {topics: any[], flat: any[]}} */
let tocCache = null;
let tocDirty = true;
/** @type {null | Promise<any>} */
let tocBuildPromise = null;

function isForbiddenForServing(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  return normalized === 'rules.html';
}

function isWatchedFile(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  return ext === '.html' || ext === '.css' || ext === '.js' || ext === '.mjs' || ext === '.svg';
}

function sendSseEvent(eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      // ignore broken pipes
    }
  }
}

function safeResolve(rootDir, urlPathname) {
  const decoded = decodeURIComponent(urlPathname);
  const withoutQuery = decoded.split('?')[0];
  const stripped = withoutQuery.replace(/^\/+/, '');
  const fullPath = path.resolve(rootDir, stripped);
  if (!fullPath.startsWith(rootDir + path.sep) && fullPath !== rootDir) {
    return null;
  }
  return fullPath;
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

async function walkFiles(rootDir, relStart) {
  const absStart = path.join(rootDir, relStart);
  /** @type {string[]} */
  const out = [];

  /** @type {string[]} */
  const stack = [absStart];

  while (stack.length) {
    const dir = stack.pop();
    if (!dir) break;

    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(rootDir, abs).replace(/\\/g, '/');
      if (isIgnoredPath(rel)) continue;

      if (e.isDirectory()) {
        stack.push(abs);
        continue;
      }

      if (!e.isFile()) continue;
      out.push(rel);
    }
  }

  return out;
}

async function listHtmlFiles() {
  // 1) Root-level work pages: עמוד-*.html
  const rootEntries = await fs.readdir(ROOT_DIR, { withFileTypes: true });
  const rootPages = rootEntries
    .filter((e) => e.isFile() && A4_PAGE_FILE_RE.test(e.name))
    .map((e) => e.name);

  rootPages.sort((a, b) => {
    const am = a.match(A4_PAGE_FILE_RE);
    const bm = b.match(A4_PAGE_FILE_RE);
    const ai = am ? Number(am[1]) : Number.POSITIVE_INFINITY;
    const bi = bm ? Number(bm[1]) : Number.POSITIVE_INFINITY;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b, 'he');
  });

  // 2) Built topic pages: site/**/*.html (exclude site/index.html)
  /** @type {string[]} */
  let sitePages = [];
  const siteDir = path.join(ROOT_DIR, 'site');
  try {
    const st = await fs.stat(siteDir);
    if (st.isDirectory()) {
      const all = await walkFiles(ROOT_DIR, 'site');
      sitePages = all
        .filter((rel) => rel.toLowerCase().endsWith('.html'))
        .filter((rel) => rel !== 'site/index.html');
    }
  } catch {
    // no site dir
  }

  sitePages.sort((a, b) => a.localeCompare(b, 'he'));

  return [...rootPages, ...sitePages];
}

function stripHtml(text) {
  return String(text)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePageMetaFromHtml(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const docTitle = titleMatch ? stripHtml(titleMatch[1]) : '';

  const navMetaMatch = html.match(/<div\s+class="nav-meta"[^>]*>([\s\S]*?)<\/div>/i);
  const navMetaText = navMetaMatch ? stripHtml(navMetaMatch[1]) : '';

  // Example: "חוקיות — עמוד 3 / 4"
  const m = navMetaText.match(/^(.*?)\s*—\s*עמוד\s*(\d+)\s*\/\s*(\d+)\s*$/);
  const topic = m ? m[1].trim() : '';
  const pageIndex = m ? Number(m[2]) : null;
  const pageTotal = m ? Number(m[3]) : null;

  // Try to capture the topic list order from preview-nav-topics
  const topicsBlockMatch = html.match(/<div\s+class="preview-nav-topics"[\s\S]*?<\/div>\s*<\/nav>/i);
  const topicsBlock = topicsBlockMatch ? topicsBlockMatch[0] : '';
  /** @type {{name: string, href: string}[]} */
  const topicLinks = [];
  if (topicsBlock) {
    const linkRe = /<a\s+class="topic-link[^"]*"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let linkMatch;
    while ((linkMatch = linkRe.exec(topicsBlock))) {
      const href = stripHtml(linkMatch[1]);
      const name = stripHtml(linkMatch[2]);
      if (!name) continue;
      topicLinks.push({ name, href });
    }
  }

  return { docTitle, topic, pageIndex, pageTotal, topicLinks };
}

function topicFromFilePath(relPath) {
  const normalized = String(relPath || '').replace(/\\/g, '/');
  if (!normalized.startsWith('site/')) return '';
  const parts = normalized.split('/').filter(Boolean);
  return parts.length >= 2 ? parts[1] : '';
}

async function buildToc() {
  const files = await listHtmlFiles();

  /** @type {Map<string, {name: string, pages: any[]}>} */
  const topicsMap = new Map();

  /** @type {string[]} */
  let bestTopicOrder = [];

  for (const rel of files) {
    const fullPath = path.join(ROOT_DIR, rel);
    let html = '';
    try {
      html = await fs.readFile(fullPath, 'utf8');
    } catch {
      continue;
    }

    const meta = parsePageMetaFromHtml(html);
    const topicFallback = meta.topic ? '' : topicFromFilePath(rel);
    if (meta.topicLinks.length > bestTopicOrder.length) {
      bestTopicOrder = meta.topicLinks.map((t) => t.name);
    }

    const entry = {
      file: rel,
      title: meta.docTitle || rel,
      topic: meta.topic || topicFallback || '',
      pageIndex: typeof meta.pageIndex === 'number' ? meta.pageIndex : null,
      pageTotal: typeof meta.pageTotal === 'number' ? meta.pageTotal : null
    };

    if (entry.pageIndex == null) {
      const m2 = path.basename(rel).match(A4_PAGE_FILE_RE);
      if (m2) entry.pageIndex = Number(m2[1]);
    }

    const key = entry.topic || 'אחר';
    if (!topicsMap.has(key)) topicsMap.set(key, { name: key, pages: [] });
    topicsMap.get(key).pages.push(entry);
  }

  /** @type {{name: string, pages: any[]}[]} */
  const topics = Array.from(topicsMap.values());

  // Sort pages within topic by pageIndex when available.
  for (const t of topics) {
    t.pages.sort((a, b) => {
      const ai = typeof a.pageIndex === 'number' ? a.pageIndex : Number.POSITIVE_INFINITY;
      const bi = typeof b.pageIndex === 'number' ? b.pageIndex : Number.POSITIVE_INFINITY;
      if (ai !== bi) return ai - bi;
      return String(a.file).localeCompare(String(b.file), 'he');
    });
  }

  // Sort topics: use hinted order from preview-nav-topics, then others, with "אחר" last.
  topics.sort((a, b) => {
    const aIsOther = a.name === 'אחר';
    const bIsOther = b.name === 'אחר';
    if (aIsOther !== bIsOther) return aIsOther ? 1 : -1;

    const ai = bestTopicOrder.indexOf(a.name);
    const bi = bestTopicOrder.indexOf(b.name);
    const aKnown = ai >= 0;
    const bKnown = bi >= 0;
    if (aKnown && bKnown) return ai - bi;
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    return String(a.name).localeCompare(String(b.name), 'he');
  });

  // Flatten reading order.
  const flat = topics.flatMap((t) => t.pages);
  return { topics, flat };
}

async function getTocCached() {
  if (!tocDirty && tocCache) return tocCache;

  if (tocBuildPromise) return tocBuildPromise;

  tocBuildPromise = buildToc()
    .then((toc) => {
      tocCache = toc;
      tocDirty = false;
      return toc;
    })
    .finally(() => {
      tocBuildPromise = null;
    });

  return tocBuildPromise;
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.statusCode = 400;
    res.end('Bad Request');
    return;
  }

  const requestUrl = new URL(req.url, 'http://localhost');

  if (requestUrl.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    res.write('event: hello\ndata: {}\n\n');
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  if (requestUrl.pathname === '/api/toc') {
    try {
      const toc = await getTocCached();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(toc));
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err));
    }
    return;
  }

  if (requestUrl.pathname === '/api/layout-guard' && req.method === 'POST') {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 64_000) {
        res.statusCode = 413;
        res.end('Payload Too Large');
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        /** @type {{file?: string, overflow?: boolean, scrollHeight?: number, clientHeight?: number, ts?: number}} */
        const payload = raw ? JSON.parse(raw) : {};
        const file = String(payload.file || '').trim();
        const overflow = Boolean(payload.overflow);
        const scrollHeight = Number(payload.scrollHeight || 0);
        const clientHeight = Number(payload.clientHeight || 0);

        if (file) {
          if (overflow) {
            console.log(
              `[CRITICAL ERROR] A4 overflow: ${file} (scrollHeight=${scrollHeight}px, clientHeight=${clientHeight}px)`
            );
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.statusCode = 400;
        res.end('Bad Request');
      }
    });
    return;
  }

  // Default: reader UI
  if (requestUrl.pathname === '/' || requestUrl.pathname === '/preview' || requestUrl.pathname === '/preview/') {
    const filePath = path.join(ROOT_DIR, 'preview', 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    createReadStream(filePath).pipe(res);
    return;
  }

  const filePath = safeResolve(ROOT_DIR, requestUrl.pathname);
  if (!filePath) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  const relPath = path.relative(ROOT_DIR, filePath);
  if (isForbiddenForServing(relPath)) {
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    const headers = {
      'Content-Type': contentTypeFor(filePath),
      'Cache-Control': ['.html', '.css', '.svg'].includes(path.extname(filePath).toLowerCase()) ? 'no-store' : 'no-cache'
    };

    res.writeHead(200, headers);
    createReadStream(filePath).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

server.listen(DEFAULT_PORT, DEFAULT_HOST, () => {
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : DEFAULT_PORT;
  const shownHost = DEFAULT_HOST === '0.0.0.0' ? 'localhost' : DEFAULT_HOST;
  console.log(`Preview server running: http://${shownHost}:${port}/`);
  if (DEFAULT_HOST === '0.0.0.0') {
    console.log('LAN: use your PC IP, e.g. http://<your-ip>:' + port + '/preview');
  }
});

// Live-reload (Windows supports recursive watch)
try {
  fs.watch(ROOT_DIR, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;
    const rel = filename.replace(/\\/g, '/');
    if (isIgnoredPath(rel)) return;
    if (!isWatchedFile(rel)) return;

    // TOC depends on root-level עמוד-*.html and site/**/*.html (excluding site/index.html).
    const base = path.basename(rel);
    const isRootWorkPage = A4_PAGE_FILE_RE.test(base) && !rel.includes('/');
    const isSiteHtml = rel.startsWith('site/') && rel.toLowerCase().endsWith('.html') && rel !== 'site/index.html';
    if (isRootWorkPage || isSiteHtml) tocDirty = true;

    sendSseEvent('reload', { path: rel, ts: Date.now() });
  });
} catch (err) {
  console.warn('fs.watch recursive not available:', err);
}
