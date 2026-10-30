#!/usr/bin/env node
// First-draft Quarto RevealJS source from a .pptx (Keynote talks have a PowerPoint export beside
// them): slide titles from the title placeholder, text boxes as bullets or paragraphs, pictures
// as WebP with the deck's own alt text where it has one, speaker notes as notes. Layout is not
// carried over; the draft is finished by hand against the original slides.
//
//   node tools/convert/pptx-to-quarto.mjs --id <talk id> --pptx <file.pptx> [--out decks/<slug>]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';

const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const ID = arg('--id');
const PPTX = arg('--pptx');
if (!ID || !PPTX) {
  console.error('usage: pptx-to-quarto.mjs --id <talk id> --pptx <file.pptx> [--out dir]');
  process.exit(2);
}

const catalog = yaml.load(fs.readFileSync('catalog/generated/catalog.full.yml', 'utf8'), { schema: yaml.CORE_SCHEMA });
const talk = catalog.talks.find((t) => t.id === ID);
if (!talk) throw new Error(`no talk ${ID}`);
const OUT = arg('--out') || `decks/${talk.slug}`;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'figures'), { recursive: true });

const read = (entry) => {
  try {
    return execFileSync('unzip', ['-p', PPTX, entry], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return '';
  }
};
const readBinary = (entry) => execFileSync('unzip', ['-p', PPTX, entry], { maxBuffer: 256 * 1024 * 1024 });
const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
const escapeMd = (s) => s.replace(/([\\*_[\]<>`])/g, '\\$1');

function rels(entry) {
  const dir = path.posix.dirname(entry);
  const file = `${dir}/_rels/${path.posix.basename(entry)}.rels`;
  const map = {};
  for (const m of read(file).matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g)) {
    map[m[1]] = m[2].startsWith('/') ? m[2].slice(1) : path.posix.normalize(`${dir}/${m[2]}`);
  }
  return map;
}

// Slide order and visibility.
const presentation = read('ppt/presentation.xml');
const presRels = rels('ppt/presentation.xml');
const slideEntries = [...presentation.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map((m) => presRels[m[1]]);

function paragraphs(xml) {
  return [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>|<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)].map((m) => {
    const p = m[1] ?? m[2];
    const lvl = Number(/<a:pPr\b[^>]*\blvl="(\d+)"/.exec(p)?.[1] || 0);
    const bullet = /<a:buChar\b|<a:buAutoNum\b/.test(p) && !/<a:buNone\b/.test(p);
    const text = [...p.matchAll(/<a:r>([\s\S]*?)<\/a:r>|<a:br\b[^>]*\/>/g)]
      .map((r) => {
        if (!r[1]) return '\n';
        const t = decode([...r[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((x) => x[1]).join(''));
        if (!t.trim()) return t;
        const bold = /<a:rPr\b[^>]*\bb="1"/.test(r[1]);
        const italic = /<a:rPr\b[^>]*\bi="1"/.test(r[1]);
        let s = escapeMd(t);
        if (bold) s = `**${s.trim()}**${/\s$/.test(t) ? ' ' : ''}`;
        else if (italic) s = `*${s.trim()}*${/\s$/.test(t) ? ' ' : ''}`;
        return s;
      })
      .join('')
      .replace(/\*\*\*\*/g, '')
      .trim();
    return { lvl, bullet, text };
  });
}

let figures = 0;
function picture(entry, alt) {
  const ext = path.extname(entry).toLowerCase();
  const stem = `fig-${String(++figures).padStart(2, '0')}`;
  const tmp = path.join(os.tmpdir(), `${stem}-${process.pid}${ext}`);
  fs.writeFileSync(tmp, readBinary(entry));
  let out;
  if (['.png', '.jpg', '.jpeg', '.tif', '.tiff'].includes(ext)) {
    out = `figures/${stem}.webp`;
    const width = Number(/pixelWidth: (\d+)/.exec(execFileSync('sips', ['-g', 'pixelWidth', tmp], { encoding: 'utf8' }))?.[1] || 0);
    execFileSync('cwebp', ['-quiet', '-q', '85', ...(width > 1600 ? ['-resize', '1600', '0'] : []), tmp, '-o', path.join(OUT, out)]);
  } else {
    out = `figures/${stem}${ext}`;
    fs.copyFileSync(tmp, path.join(OUT, out));
  }
  fs.rmSync(tmp);
  return `![](${out}){fig-alt="${(alt || `TODO alt text: ${stem}`).replace(/"/g, "'")}"}`;
}

const slides = [];
for (const entry of slideEntries) {
  const xml = read(entry);
  if (/<p:sld\b[^>]*\bshow="0"/.test(xml)) continue;
  const r = rels(entry);
  let title = '';
  let subtitle = '';
  const blocks = [];
  for (const m of xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>|<p:pic>([\s\S]*?)<\/p:pic>/g)) {
    if (m[2]) {
      const embed = /<a:blip\b[^>]*r:embed="([^"]+)"/.exec(m[2])?.[1];
      const descr = /<p:cNvPr\b[^>]*\bdescr="([^"]*)"/.exec(m[2])?.[1];
      const alt = descr && decode(descr).trim();
      if (embed && r[embed]) blocks.push(picture(r[embed], alt && !/^[\w.-]+\.\w{2,4}$|^\d+$/.test(alt) ? alt : ''));
      continue;
    }
    const sp = m[1];
    const ph = /<p:ph\b[^>]*?(?:type="([^"]+)")?[^>]*\/>/.exec(sp);
    const paras = paragraphs(sp).filter((p) => p.text);
    if (!paras.length) continue;
    if (ph && /title|ctrTitle/i.test(ph[1] || '') && !title) {
      title = paras.map((p) => p.text.replace(/\*\*/g, '')).join(' ').replace(/\s+/g, ' ');
      continue;
    }
    if (ph && ph[1] === 'subTitle') {
      subtitle = paras.map((p) => p.text).join(' ');
      continue;
    }
    const isBody = ph && (!ph[1] || ph[1] === 'body');
    blocks.push(
      paras
        .map((p) => (p.bullet || (isBody && paras.length > 1) ? `${'    '.repeat(p.lvl)}- ${p.text.replace(/\n/g, ' ')}` : p.text.replace(/\n/g, '  \n')))
        .join('\n')
        .replace(/\n(?!\s*- )/g, '\n\n'),
    );
  }
  // Keynote's export puts the title in an ordinary text box: the first single-line paragraph.
  if (!title && blocks.length && !blocks[0].startsWith('![') && !blocks[0].includes('\n') && !blocks[0].startsWith('- ')) {
    title = blocks.shift().replace(/\*\*/g, '');
  }
  const notesEntry = Object.values(r).find((t) => /notesSlide/.test(t));
  const notes = notesEntry
    ? paragraphs(read(notesEntry))
        .map((p) => p.text)
        .filter((t) => t && !/^\d+$/.test(t))
        .join('\n\n')
    : '';
  slides.push({ title, subtitle, blocks, notes });
}

const first = slides[0];
const isTitleSlide = first && !first.blocks.some((b) => b.startsWith('!['));
const front = {
  title: talk.title,
  subtitle: `${talk.venue}, ${new Date(`${talk.date}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}`,
  author: [{ name: 'Damian W. Betebenner', affiliation: 'Center for Assessment' }, ...(talk.coauthors || []).map((name) => ({ name }))],
  description: `${talk.title} — ${talk.venue}. Rebuilt from the original Keynote slides.`,
  format: { 'deck-revealjs': { 'slide-number': 'c/t' } },
};

let md = '';
for (const [k, s] of slides.entries()) {
  if (k === 0 && isTitleSlide) continue;
  const body = s.blocks.join('\n\n');
  const size = body.replace(/!\[[^\]]*\]\([^)]*\)(\{[^}]*\})?/g, '').length > 900 ? ' {.smaller}' : '';
  md += `## ${s.title || 'TODO title'}${size}\n\n${body}\n\n`;
  if (s.notes) md += `::: {.notes}\n${s.notes}\n:::\n\n`;
}

fs.writeFileSync(path.join(OUT, 'index.qmd'), `---\n${yaml.dump(front, { lineWidth: -1 })}---\n\n${md}`);
console.log(`${ID} → ${OUT}: ${slides.length - (isTitleSlide ? 1 : 0)} slides, ${figures} figures`);
