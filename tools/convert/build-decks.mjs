#!/usr/bin/env node
// Phase 2b: turn exported PDFs into image-based RevealJS decks inside a shard checkout.
//
//   node tools/convert/build-decks.mjs --shard talks-archive-2005-2009 --dir /tmp/shards/talks-archive-2005-2009 [--only id,...]
//
// Per talk: <dir>/<slug>/index.qmd + slides/NN.webp, the slide text at catalog/text/<id>.json,
// and release assets (PDF, original) staged in work/release/<shard>/. Idempotent by source sha1;
// state is written to catalog/generated/converted/<shard>.yml.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { pdfPages } from '../lib/deck-text.mjs';
import { sourcePath } from '../lib/paths.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const SHARD = opt('--shard');
const DIR = opt('--dir');
const ONLY = opt('--only', '') ? new Set(opt('--only').split(',')) : null;
const FORCE = args.includes('--force');
const RETEXT = args.includes('--retext');
if (!SHARD || !DIR) {
  console.error('usage: build-decks.mjs --shard <repo> --dir <checkout> [--only ids] [--force | --retext]');
  process.exit(2);
}

const DECK_FORMAT = 'deck-revealjs';
const WIDTH = 1920;
const HEIGHT = 1080;
// Reveal background attributes need a literal colour: color.palette.stone.900, the deck's ink.
const LETTERBOX = '#14140f';

const load = (p) => (fs.existsSync(p) ? yaml.load(fs.readFileSync(p, 'utf8'), { schema: yaml.CORE_SCHEMA }) || {} : {});
const dump = (o) => yaml.dump(o, { lineWidth: 160, noRefs: true, schema: yaml.CORE_SCHEMA });
const run = (cmd, a, o = {}) => execFileSync(cmd, a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...o });
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const full = load('catalog/generated/catalog.full.yml');
const shards = load('catalog/shards.yml');
const exported = load('catalog/generated/exported.yml');
const STATE = `catalog/generated/converted/${SHARD}.yml`;
fs.mkdirSync(path.dirname(STATE), { recursive: true });
fs.mkdirSync('catalog/text', { recursive: true });
const state = load(STATE);
const save = () => fs.writeFileSync(STATE, dump(state));
const RELEASE = path.resolve('work/release', SHARD);
fs.mkdirSync(RELEASE, { recursive: true });

const releaseUrl = (name) => `https://github.com/${shards.owner}/${SHARD}/releases/download/${shards.release_tag}/${encodeURIComponent(name)}`;
const hubUrl = (t) => `${shards.pages_base}/talks/${t.slug}/`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function displayDate(t) {
  const [y, m, d] = t.date.split('-').map(Number);
  if (t.date_precision === 'year') return String(y);
  if (t.date_precision === 'day') return `${MONTHS[m - 1]} ${d}, ${y}`;
  return `${MONTHS[m - 1]} ${y}`;
}

function pageSize(pdf) {
  const m = run('pdfinfo', [pdf]).match(/Page size:\s+([\d.]+) x ([\d.]+)/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 16, h: 9 };
}

function rasterize(pdf, slidesDir) {
  const { w, h } = pageSize(pdf);
  const wide = w / h >= WIDTH / HEIGHT;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rx-'));
  try {
    run('pdftoppm', ['-png', '-scale-to-x', wide ? String(WIDTH) : '-1', '-scale-to-y', wide ? '-1' : String(HEIGHT), pdf, path.join(tmp, 'p')]);
    const pngs = fs.readdirSync(tmp).filter((f) => f.endsWith('.png')).sort((a, b) => Number(a.match(/(\d+)\.png$/)[1]) - Number(b.match(/(\d+)\.png$/)[1]));
    const pad = String(pngs.length).length < 2 ? 2 : String(pngs.length).length;
    fs.rmSync(slidesDir, { recursive: true, force: true });
    fs.mkdirSync(slidesDir, { recursive: true });
    const names = [];
    for (const [i, f] of pngs.entries()) {
      const name = `${String(i + 1).padStart(pad, '0')}.webp`;
      run('cwebp', ['-quiet', '-q', '80', '-m', '5', path.join(tmp, f), '-o', path.join(slidesDir, name)]);
      names.push(name);
    }
    return names;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function stageOriginal(t) {
  const primary = sourcePath(t, t.source.primary);
  const ext = path.extname(primary).toLowerCase();
  if (t.source.format === 'pdf') return null;
  if (t.source.format === 'beamer') {
    const tex = t.source.originals.map((o) => o.path).find((p) => p.endsWith('.tex'));
    if (!tex) return null;
    const name = `${t.slug}.tex`;
    fs.copyFileSync(sourcePath(t, tex), path.join(RELEASE, name));
    return name;
  }
  if (fs.statSync(primary).isDirectory()) {
    const name = `${t.slug}${ext}.zip`;
    const out = path.join(RELEASE, name);
    fs.rmSync(out, { force: true });
    run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', primary, out]);
    return name;
  }
  const name = `${t.slug}${ext}`;
  fs.copyFileSync(primary, path.join(RELEASE, name));
  return name;
}

// Text extracted from vector charts arrives as one line per marker glyph or tick label; keep only lines with a word.
const clean = (s) =>
  s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => !l || /\p{L}{2}/u.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

function deckQmd(t, slides, text, notes, pdfName, originalName) {
  const front = {
    pagetitle: t.title,
    description: `${t.title} — ${t.venue}, ${displayDate(t)}. Image-based copy of the original slides.`,
    image: `slides/${slides[0]}`,
    format: { [DECK_FORMAT]: { 'slide-number': 'c/t', hash: true, 'embed-resources': false } },
  };
  let out = `---\n${dump(front)}---\n\n`;
  for (const [i, s] of slides.entries()) {
    out += `## {.archive-slide background-image="slides/${s}" background-size="contain" background-color="${LETTERBOX}"}\n\n`;
    const txt = clean(text[i] || '');
    if (txt) out += `\`\`\`{=html}\n<div class="archive-text">${esc(txt)}</div>\n\`\`\`\n\n`;
    const note = clean(notes?.[i] || '');
    if (note) out += `::: notes\n\`\`\`{=html}\n${esc(note).replace(/\n/g, '<br>\n')}\n\`\`\`\n:::\n\n`;
  }
  out += `## About this copy {.archive-about}\n\n`;
  out += `*${t.title}* — ${t.venue}, ${displayDate(t)}.\n\n`;
  out += `This is an image-based copy of the original ${t.source.format === 'beamer' ? 'beamer' : t.source.format === 'pdf' ? 'PDF' : t.source.format === 'keynote' ? 'Keynote' : 'PowerPoint'} slides; builds and animations are flattened.\n\n`;
  out += `- [Talk page](${hubUrl(t)})\n- [Download PDF](${releaseUrl(pdfName)})\n`;
  if (originalName) out += `- [Original file](${releaseUrl(originalName)})\n`;
  out += `- [All talks](${shards.pages_base}/talks/)\n`;
  return out;
}

const talks = full.talks.filter((t) => t.publish && t.delivery === 'convert' && t.shard === SHARD && (!ONLY || ONLY.has(t.id)));
let built = 0;
let skipped = 0;
let failed = 0;
for (const t of talks) {
  const ex = exported[t.id];
  if (!ex || ex.status !== 'ok') {
    console.log(`skip   ${t.id} (no exported PDF)`);
    skipped++;
    continue;
  }
  const deckDir = path.join(DIR, t.slug);
  const prev = state[t.id];
  if (RETEXT) {
    if (prev?.status !== 'ok' || !fs.existsSync(path.join(deckDir, 'index.qmd'))) {
      skipped++;
      continue;
    }
    const slides = fs.readdirSync(path.join(deckDir, 'slides')).filter((f) => f.endsWith('.webp')).sort();
    const text = pdfPages(ex.pdf);
    let notes = ex.notes && fs.existsSync(ex.notes) ? JSON.parse(fs.readFileSync(ex.notes, 'utf8')) : null;
    if (notes && notes.length !== slides.length) notes = null;
    const originalName = prev.assets.find((a) => a !== `${t.slug}.pdf`) || null;
    fs.writeFileSync(path.join(deckDir, 'index.qmd'), deckQmd(t, slides, text, notes, `${t.slug}.pdf`, originalName));
    fs.writeFileSync(`catalog/text/${t.id}.json`, `${JSON.stringify(text.slice(0, slides.length).map(clean))}\n`);
    built++;
    continue;
  }
  if (!FORCE && prev?.status === 'ok' && prev.sha1 === t.source.sha1 && prev.slug === t.slug && fs.existsSync(path.join(deckDir, 'index.qmd'))) {
    skipped++;
    continue;
  }
  try {
    const slides = rasterize(ex.pdf, path.join(deckDir, 'slides'));
    const text = pdfPages(ex.pdf);
    let notes = ex.notes && fs.existsSync(ex.notes) ? JSON.parse(fs.readFileSync(ex.notes, 'utf8')) : null;
    if (notes && notes.length !== slides.length) notes = null;

    const pdfName = `${t.slug}.pdf`;
    fs.copyFileSync(ex.pdf, path.join(RELEASE, pdfName));
    const originalName = stageOriginal(t);

    fs.writeFileSync(path.join(deckDir, 'index.qmd'), deckQmd(t, slides, text, notes, pdfName, originalName));
    fs.writeFileSync(`catalog/text/${t.id}.json`, `${JSON.stringify(text.slice(0, slides.length).map(clean))}\n`);

    const bytes = slides.reduce((n, s) => n + fs.statSync(path.join(deckDir, 'slides', s)).size, 0);
    state[t.id] = {
      status: 'ok',
      sha1: t.source.sha1,
      slug: t.slug,
      slides: slides.length,
      bytes,
      notes: Boolean(notes),
      pdf_url: releaseUrl(pdfName),
      ...(originalName ? { original_url: releaseUrl(originalName) } : {}),
      assets: [pdfName, ...(originalName ? [originalName] : [])],
    };
    built++;
    console.log(`ok     ${t.id} ${slides.length} slides ${(bytes / 1e6).toFixed(1)} MB ${t.slug}`);
  } catch (e) {
    state[t.id] = { status: 'failed', sha1: t.source.sha1, slug: t.slug, error: String(e.message || e).slice(0, 300) };
    failed++;
    console.log(`failed ${t.id} ${state[t.id].error}`);
  }
  save();
}
const ok = Object.values(state).filter((s) => s.status === 'ok');
console.log(`${SHARD}: built ${built}, skipped ${skipped}, failed ${failed}; ${ok.length} decks, ${(ok.reduce((n, s) => n + s.bytes, 0) / 1e6).toFixed(0)} MB of slides`);
