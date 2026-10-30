#!/usr/bin/env node
// Scan the local Conferences-Presentations tree and write catalog/generated/legacy.yml.
//
// Read-only over the source tree. Output is regenerated on every run; human
// decisions belong in catalog/overrides.yml, which the catalog build merges on top.
//
//   node tools/inventory/scan-legacy.mjs [--root <dir>] [--out <file>]

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { classifyVenue, parseDateToken, slugify, titleFromStem } from '../lib/talk-meta.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const ROOT = opt('--root', '/Users/conet/Research/Conferences-Presentations');
const OUT = opt('--out', path.resolve('catalog/generated/legacy.yml'));

// Directories that hold supporting material, not talks.
const SKIP_DIR = /^(archive|old|olds?_.*|.*_old|older ?versions|backups?|figures?|images?|img|r_scripts|goodness_of_fit|reviews?|papers?|data|styles|assets|session_proposal|proposals?|handouts?|slide templates|player|.*\.lproj|__macosx|\.git)$/i;
// File names that are administrative or are papers/proposals rather than slides.
const ADMIN = /(receipt|uber|lyft|trip|flight|itinerar|confirmation|hotel|invoice|reimburs|w-?9|agreement|contract|speaker|bio\b|_bio|cv\b|proposal|abstract|submission|proceeding|review|form\b|letter|agenda|minutes|registration|shopping cart|call-for-proposals|handout|paper\b|_paper|manuscript|certificate|schedule|program\b|poster)/i;
// Keynote/PowerPoint files are slides by construction; only exclude obvious non-talk documents.
const ADMIN_SOURCE = /(proposal|agreement|contract|\bbio\b|_bio|letter|receipt|agenda|minutes|handout|form\b|infographic|session_map|template)/i;
const PREF = { key: 0, pptx: 1, ppt: 2, beamer: 3, pdf: 4 };
const FORMAT_NAME = { key: 'keynote', pptx: 'powerpoint', ppt: 'powerpoint', beamer: 'beamer', pdf: 'pdf' };

function walk(dir, visit, depth = 0) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('~$')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/\.key$/i.test(e.name)) { visit(p, true); continue; }
      if (SKIP_DIR.test(e.name)) continue;
      if (fs.existsSync(path.join(p, 'assets', 'player'))) continue; // Keynote HTML export
      walk(p, visit, depth + 1);
    } else if (e.isFile()) {
      visit(p, false);
    }
  }
}

function kindOf(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.key') return 'key';
  if (ext === '.pptx') return 'pptx';
  if (ext === '.ppt') return 'ppt';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.tex') return 'tex';
  return null;
}

function isBeamer(tex) {
  try {
    const head = fs.readFileSync(tex, 'utf8').slice(0, 4000);
    return /\\documentclass(\[[^\]]*\])?\{beamer\}/.test(head);
  } catch { return false; }
}

const pdfInfoCache = new Map();
function pdfInfo(pdf) {
  if (pdfInfoCache.has(pdf)) return pdfInfoCache.get(pdf);
  let info = null;
  try {
    const out = execFileSync('pdfinfo', [pdf], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const pages = Number((out.match(/^Pages:\s+(\d+)/m) || [])[1] || 0);
    const m = out.match(/^Page size:\s+([\d.]+) x ([\d.]+)/m);
    const title = ((out.match(/^Title:\s+(.*)$/m) || [])[1] || '').trim();
    info = { pages, landscape: m ? Number(m[1]) > Number(m[2]) : false, title };
  } catch { /* unreadable PDF */ }
  pdfInfoCache.set(pdf, info);
  return info;
}

function keynoteSlideCount(key) {
  try {
    if (fs.statSync(key).isDirectory()) {
      const idx = path.join(key, 'Index');
      if (fs.existsSync(idx)) return fs.readdirSync(idx).filter((f) => /^Slide.*\.iwa$/.test(f)).length || null;
      return null; // pre-2013 bundle: index.apxl(.gz), count unknown
    }
    const out = execFileSync('unzip', ['-Z1', key], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
    return out.split('\n').filter((l) => /^Index\/Slide.*\.iwa$/.test(l)).length || null;
  } catch { return null; }
}

function pptxSlideCount(pptx) {
  try {
    const out = execFileSync('unzip', ['-Z1', pptx], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
    return out.split('\n').filter((l) => /^ppt\/slides\/slide\d+\.xml$/.test(l)).length || null;
  } catch { return null; }
}

function sizeOf(p) {
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.size;
  let total = 0;
  walkAll(p, (f) => { total += fs.statSync(f).size; });
  return total;
}
function walkAll(dir, fn) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkAll(p, fn); else if (e.isFile()) fn(p);
  }
}

// Version-insensitive key so "Deck_030121", "Deck_033021" and "Deck_FINAL" collapse.
function canonStem(stem) {
  return stem
    .toLowerCase()
    .replace(/\(\d+\)|\bcopy\b|\bfinal\b|\bdraft\b|\bv\d+\b|\b(sm|small|print|web|revised|updated|new)\b/g, ' ')
    .replace(/\d{1,2}\.\d{1,2}\.\d{2,4}/g, ' ')
    .replace(/(^|[^\d])\d{6}(\d{2})?(?=[^\d]|$)/g, '$1 ')
    .replace(/[\s_\-.]+\d$/, ' ')
    .replace(/[\s_\-.]+/g, ' ')
    .trim();
}

// Co-presenters whose slides sit in symposium folders. Their decks are inventoried but held back.
const OTHER_PRESENTER = /(andrew ?ho|martineau|^joseph|^robert|^bww|^wk_|^cole |gaskill|^braun|braunrils|^marion|^gong|wenning|alyssa|khess|fengyi|jbmh|^rw_|^rlee|abulela|vaniwaarden|lockwood|^yi_|^georgia ?validity|weststat|rijmen|^cflores|flannagan|^ccsso_ma_)/i;
const SELF = /(betebenner|damian|dwb|^presentation|^slides)/i;

function authorship(primary, relDir) {
  const stem = primary.stem;
  if (SELF.test(stem)) return 'self';
  const subdirs = relDir.split(path.sep).slice(2).join('/');
  if (OTHER_PRESENTER.test(stem) || /(Derek_Briggs|Mohammed_Abulela|Frank_Rijmen|Flannagan|Other_Presentations)/.test(subdirs)) return 'other';
  if (primary.kind === 'beamer' || primary.kind === 'key') return 'self';
  // Before 2013 Damian built slides in beamer; a lone PowerPoint from then is usually a co-presenter's.
  if ((primary.kind === 'ppt' || primary.kind === 'pptx') && Number(primary.year) <= 2012) return 'unknown';
  return 'self';
}

const GENERIC_TITLE = /^(presentation|slides|talk|betebenner|betebenner presentation|damian presentation|betebenner slides|presentation \d+|ncme|staff meeting|recovery|[a-z]+ presentation)$/i;
function pageOneTitle(pdf) {
  try {
    const txt = execFileSync('pdftotext', ['-f', '1', '-l', '1', '-layout', pdf, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = txt.split('\n').map((l) => l.replace(/\s{2,}/g, ' ').trim()).filter((l) => /[A-Za-z]{3}/.test(l));
    let title = '';
    for (const l of lines) {
      if (/betebenner|national center|center for assessment|nciea|^\d|@|www\.|http/i.test(l)) break;
      title = title ? `${title} ${l}` : l;
      if (title.length > 24) break;
    }
    return title.length >= 8 && title.length <= 160 ? title : '';
  } catch { return ''; }
}

function shortHash(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
}

// ── Collect candidate files ─────────────────────────────────────────────
const candidates = [];
const years = fs.readdirSync(ROOT).filter((y) => /^20\d\d$/.test(y)).sort();
for (const year of years) {
  walk(path.join(ROOT, year), (file, isBundle) => {
    const kind = kindOf(file);
    if (!kind) return;
    const rel = path.relative(ROOT, file);
    const parts = rel.split(path.sep);
    if (parts.length < 2) return;
    candidates.push({ file, rel, year, folder: parts[1].replace(/\.key$/i, ''), dir: path.dirname(file), kind, isBundle });
  });
}

// Loose decks sitting directly in a year folder (e.g. 2025/X.key) become their own folder.
for (const c of candidates) if (c.rel.split(path.sep).length === 2) c.folder = path.basename(c.file, path.extname(c.file));

// ── Group into decks: (directory, canonical stem) ───────────────────────
const byDir = new Map();
for (const c of candidates) {
  if (!byDir.has(c.dir)) byDir.set(c.dir, []);
  byDir.get(c.dir).push(c);
}

const decks = [];
const excluded = [];
for (const [dir, files] of byDir) {
  const texBeamer = new Set(files.filter((f) => f.kind === 'tex' && isBeamer(f.file)).map((f) => path.basename(f.file, '.tex').toLowerCase()));
  const sourceStems = new Set(
    files.filter((f) => ['key', 'pptx', 'ppt'].includes(f.kind)).map((f) => path.basename(f.file, path.extname(f.file)).toLowerCase()),
  );
  const groups = new Map();
  for (const f of files) {
    const stem = path.basename(f.file, path.extname(f.file));
    const lower = stem.toLowerCase();
    let kind = f.kind;
    if (kind === 'tex') continue;
    if (kind === 'pdf') {
      if (texBeamer.has(lower)) kind = 'beamer';
      else if (!sourceStems.has(lower)) {
        if (ADMIN.test(stem)) { excluded.push({ path: f.rel, reason: 'admin-or-paper-name' }); continue; }
        const info = pdfInfo(f.file);
        if (!info || !info.landscape) { excluded.push({ path: f.rel, reason: info ? 'portrait-pdf' : 'unreadable-pdf' }); continue; }
        if (info.pages < 3 || /^page \d+|\bpage \d+$/i.test(stem)) { excluded.push({ path: f.rel, reason: 'figure-or-page-extract' }); continue; }
      }
    } else if (ADMIN_SOURCE.test(stem)) {
      excluded.push({ path: f.rel, reason: 'admin-or-paper-name' });
      continue;
    }
    const key = canonStem(stem) || lower;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...f, kind, stem, mtime: fs.statSync(f.file).mtimeMs });
  }

  for (const [, members] of groups) {
    // Newest source wins; within a source, prefer the richer format.
    const sources = members.filter((m) => m.kind !== 'pdf');
    const pool = sources.length ? sources : members;
    pool.sort((a, b) => b.mtime - a.mtime || PREF[a.kind] - PREF[b.kind]);
    const newest = pool[0];
    const sameStem = pool.filter((m) => m.stem.toLowerCase() === newest.stem.toLowerCase());
    sameStem.sort((a, b) => PREF[a.kind] - PREF[b.kind]);
    const primary = sameStem[0];
    const pdf = members.find((m) => m.kind === 'pdf' && m.stem.toLowerCase() === primary.stem.toLowerCase())
      || (primary.kind === 'beamer' ? primary : null);
    const originals = members
      .filter((m) => m.stem.toLowerCase() === primary.stem.toLowerCase())
      .map((m) => ({ format: m.kind === 'beamer' ? 'pdf' : m.kind, path: m.rel }));
    if (primary.kind === 'beamer') {
      const tex = path.join(dir, `${primary.stem}.tex`);
      if (fs.existsSync(tex)) originals.push({ format: 'tex', path: path.relative(ROOT, tex) });
    }
    const superseded = members.filter((m) => m.stem.toLowerCase() !== primary.stem.toLowerCase()).map((m) => m.rel);

    let slides = null;
    if (pdf) slides = pdfInfo(pdf.file)?.pages || null;
    if (!slides && primary.kind === 'key') slides = keynoteSlideCount(primary.file);
    if (!slides && primary.kind === 'pptx') slides = pptxSlideCount(primary.file);

    decks.push({ dir, primary, pdf, originals, superseded, slides });
  }
}

// ── Talk entries ────────────────────────────────────────────────────────
const talks = decks.map(({ dir, primary, pdf, originals, superseded, slides }) => {
  const relDir = path.relative(ROOT, dir);
  const parts = relDir.split(path.sep);
  const folder = primary.folder;
  const date = parseDateToken(primary.stem) || parseDateToken(parts.slice(1).join(' ')) || null;
  const mtime = new Date(primary.mtime);
  const isoDate = date
    || (mtime.getFullYear() === Number(primary.year) ? mtime.toISOString().slice(0, 10) : `${primary.year}-01-01`);
  const venue = classifyVenue(folder, relDir);
  const fileTitle = titleFromStem(primary.stem) || titleFromStem(parts.slice(1).join(' '));
  const metaTitle = (pdf ? pdfInfo(pdf.file)?.title || '' : '').replace(/^(subject|title):\s*/i, '').replace(/\s{2,}/g, ' — ').trim();
  const usableMeta = metaTitle && !/^(untitled|microsoft|presentation|slide|.*\.(tex|dvi|ppt|key))/i.test(metaTitle) && metaTitle.length > 6 ? metaTitle : '';
  let title = fileTitle;
  let titleSource = 'filename';
  if (!fileTitle || GENERIC_TITLE.test(fileTitle) || fileTitle.length < 10) {
    const p1 = pdf ? pageOneTitle(pdf.file) : '';
    if (usableMeta) { title = usableMeta; titleSource = 'pdf-metadata'; } else if (p1) { title = p1; titleSource = 'pdf-page-1'; }
  }
  const sub = parts.slice(2).join(' ');
  const slug = slugify(`${isoDate}-${venue.short}-${title}`).slice(0, 90).replace(/-+$/, '');
  const author = authorship(primary, relDir);
  return {
    id: `legacy-${shortHash(primary.rel)}`,
    slug,
    title,
    title_source: titleSource,
    date: isoDate,
    date_precision: date ? 'day' : (mtime.getFullYear() === Number(primary.year) ? 'mtime' : 'year'),
    year: Number(primary.year),
    venue: venue.name,
    venue_short: venue.short,
    event_type: venue.type,
    folder: path.join(primary.year, folder),
    ...(sub ? { session: sub.replace(/_/g, ' ') } : {}),
    source: {
      root: 'Conferences-Presentations',
      primary: primary.rel,
      format: FORMAT_NAME[primary.kind],
      pdf: pdf ? pdf.rel : null,
      originals,
      ...(superseded.length ? { superseded } : {}),
      bytes: sizeOf(primary.file),
      modified: mtime.toISOString().slice(0, 10),
    },
    slides,
    authorship: author,
    delivery: 'convert',
    publish: author === 'self',
    ...(author !== 'self' ? { hold_reason: author === 'other' ? 'co-presenter deck' : 'authorship unclear (pre-2013 PowerPoint)' } : {}),
  };
});

// The same deck is often copied into several event folders; keep one, point the rest at it.
const byHash = new Map();
for (const t of talks) {
  const file = path.join(ROOT, t.source.pdf || t.source.primary);
  if (fs.statSync(file).isDirectory()) continue;
  const h = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
  t.source.sha1 = h;
  if (!byHash.has(h)) byHash.set(h, []);
  byHash.get(h).push(t);
}
for (const group of byHash.values()) {
  if (group.length < 2) continue;
  group.sort((a, b) => Number(b.year === Number(b.date.slice(0, 4))) - Number(a.year === Number(a.date.slice(0, 4))) || a.folder.localeCompare(b.folder));
  const [keep, ...dups] = group;
  keep.also_presented = dups.map((d) => d.folder);
  for (const d of dups) {
    d.publish = false;
    d.duplicate_of = keep.id;
    d.hold_reason = `duplicate file of ${keep.folder}`;
  }
}

talks.sort((a, b) => a.date.localeCompare(b.date) || a.slug.localeCompare(b.slug));
// Disambiguate slugs.
const seen = new Map();
for (const t of talks) {
  const n = seen.get(t.slug) || 0;
  seen.set(t.slug, n + 1);
  if (n) t.slug = `${t.slug}-${n + 1}`;
}

// Size estimate for image decks: ~110 KB per 1920px WebP slide.
const SLIDE_BYTES = 110 * 1024;
const DEFAULT_SLIDES = 35;
const byYear = {};
for (const t of talks) {
  if (!t.publish) continue;
  const est = (t.slides || DEFAULT_SLIDES) * SLIDE_BYTES;
  byYear[t.year] = (byYear[t.year] || 0) + est;
}
const mb = (b) => Math.round(b / (1 << 20));
const summary = {
  generated: new Date().toISOString(),
  root: ROOT,
  talks: talks.length,
  by_format: talks.reduce((acc, t) => ((acc[t.source.format] = (acc[t.source.format] || 0) + 1), acc), {}),
  by_event_type: talks.reduce((acc, t) => ((acc[t.event_type] = (acc[t.event_type] || 0) + 1), acc), {}),
  by_authorship: talks.reduce((acc, t) => ((acc[t.authorship] = (acc[t.authorship] || 0) + 1), acc), {}),
  duplicates: talks.filter((t) => t.duplicate_of).length,
  publishable: talks.filter((t) => t.publish).length,
  needs_pdf_export: talks.filter((t) => !t.source.pdf).length,
  unknown_slide_count: talks.filter((t) => !t.slides).length,
  estimated_deck_mb_by_year: Object.fromEntries(Object.entries(byYear).map(([y, b]) => [y, mb(b)])),
  estimated_deck_mb_total: mb(Object.values(byYear).reduce((a, b) => a + b, 0)),
  excluded_files: excluded.length,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `# Generated by tools/inventory/scan-legacy.mjs — do not edit; use catalog/overrides.yml\n${yaml.dump({ summary, talks }, { lineWidth: 140, noRefs: true })}`);
fs.writeFileSync(OUT.replace(/\.yml$/, '.excluded.yml'), `# Files the legacy scan skipped, with the reason\n${yaml.dump(excluded, { lineWidth: 160 })}`);
console.log(yaml.dump(summary));
