import http from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_PORT = Number(process.env.PORT || 5179);

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

function isIgnoredForListing(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  return isIgnoredPath(normalized) || normalized.startsWith('preview/');
}

function isWatchedFile(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  return ext === '.html' || ext === '.css' || ext === '.js' || ext === '.mjs';
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

async function listHtmlFiles() {
  /** @type {string[]} */
  const results = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(ROOT_DIR, full).replace(/\\/g, '/');

      if (isIgnoredForListing(rel)) continue;

      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }

      if (path.extname(entry.name).toLowerCase() === '.html') {
        results.push(rel);
      }
    }
  }

  await walk(ROOT_DIR);
  results.sort((a, b) => a.localeCompare(b, 'he'));
  return results;
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

  if (requestUrl.pathname === '/api/files') {
    try {
      const files = await listHtmlFiles();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ files }));
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err));
    }
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

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    const headers = {
      'Content-Type': contentTypeFor(filePath),
      'Cache-Control': ['.html', '.css'].includes(path.extname(filePath).toLowerCase()) ? 'no-store' : 'no-cache'
    };

    res.writeHead(200, headers);
    createReadStream(filePath).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

server.listen(DEFAULT_PORT, () => {
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : DEFAULT_PORT;
  console.log(`Preview server running: http://localhost:${port}/`);
});

// Live-reload (Windows supports recursive watch)
try {
  fs.watch(ROOT_DIR, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;
    const rel = filename.replace(/\\/g, '/');
    if (isIgnoredPath(rel)) return;
    if (!isWatchedFile(rel)) return;
    sendSseEvent('reload', { path: rel, ts: Date.now() });
  });
} catch (err) {
  console.warn('fs.watch recursive not available:', err);
}
