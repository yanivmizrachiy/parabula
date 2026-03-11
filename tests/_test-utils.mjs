import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();

export async function readText(relPath) {
  const fullPath = path.isAbsolute(relPath) ? relPath : path.join(ROOT, relPath);
  return fs.readFile(fullPath, 'utf8');
}

export async function listFilesRecursive(dir) {
  /** @type {string[]} */
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(full)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

export function relFromRoot(absPath) {
  return path.relative(ROOT, absPath).replace(/\\/g, '/');
}

export function stripHtml(text) {
  return String(text)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeRegExpLiteral(text) {
  // Escape only actual regex metacharacters. Do not escape '-' (can become an invalid escape under /u).
  return String(text).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

export function mustNotMatch(re, text, fileLabel, message) {
  assert.ok(!re.test(text), `${fileLabel}: ${message}`);
}

export function matchOne(re, text, fileLabel) {
  const m = text.match(re);
  assert.ok(m, `${fileLabel}: expected to match ${String(re)}`);
  return m;
}

export function countMatches(re, text) {
  return Array.from(String(text).matchAll(re)).length;
}
