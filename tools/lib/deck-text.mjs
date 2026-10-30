// Per-slide text from a deck source, for search indexes and the sensitivity scan.
// Returns an array of page strings, or null when the format needs a PDF export first (Keynote).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

const xmlText = (xml) =>
  xml
    .replace(/<\/a:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

export function pdfPages(pdf) {
  const pages = run('pdftotext', ['-layout', '-enc', 'UTF-8', pdf, '-']).split('\f');
  if (pages.length && !pages.at(-1).trim()) pages.pop();
  return pages;
}

function pptxPages(file) {
  const names = run('unzip', ['-Z1', file])
    .split('\n')
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  return names.map((n) => xmlText(run('unzip', ['-p', file, n])));
}

// Legacy binary .ppt has no per-slide structure we can read without an office suite.
const pptPages = (file) => [run('strings', ['-n', '6', file])];

export function sourcePages(absPrimary, format, absPdf) {
  if (absPdf && fs.existsSync(absPdf)) return pdfPages(absPdf);
  const ext = path.extname(absPrimary).toLowerCase();
  try {
    if (ext === '.pdf') return pdfPages(absPrimary);
    if (ext === '.pptx') return pptxPages(absPrimary);
    if (ext === '.ppt') return pptPages(absPrimary);
  } catch {
    return null;
  }
  return null;
}
