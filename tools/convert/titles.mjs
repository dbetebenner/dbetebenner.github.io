#!/usr/bin/env node
// Propose titles for decks whose title came from a terse file name, using the largest text on
// slide 1 of the exported PDF. Writes catalog/generated/titles.yml; overrides.yml still wins.
//
//   node tools/convert/titles.mjs [--print]

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';

const load = (p) => (fs.existsSync(p) ? yaml.load(fs.readFileSync(p, 'utf8'), { schema: yaml.CORE_SCHEMA }) || {} : {});
const full = load('catalog/generated/catalog.full.yml');
const exported = load('catalog/generated/exported.yml');

// Names, affiliations and dates on a title slide are not the title.
const NOT_TITLE = /(betebenner|damian|national center|center for assessment|nciea|improvement of educational|university|college|@|www\.|https?:|^\d{1,2}[./]\d{1,2}|^(january|february|march|april|may|june|july|august|september|october|november|december)\b|^\d{4}$|presented|presentation to|prepared for)/i;

// A line like this ends the title: venue, place or date lines set in the same size type.
const VENUE_LINE = /(\b(19|20)\d{2}\b|\d(st|nd|rd|th)\b|,\s*[A-Z]{2}\b|\b(conference|meeting|sessions?|symposium|webinar|department|office of|fellows|seminar|lecture series|annual|throwdown|providence|albuquerque|chestnut hill|needham|indianapolis|reno|richmond|baltimore|salt lake|cambridge|wisconsin rapids|portsmouth|denver|albany|new orleans|lawrence)\b|henry braun|karantonis|— )/i;

// Slide 1 of these decks is not a title slide (a sample report, a committee name, ligature-damaged text).
const SKIP = new Set(['legacy-66c94011', 'legacy-8aa17ef0', 'legacy-1e23b0ef', 'legacy-bbdad77d', 'legacy-314110fa']);

const ACRONYMS = new Set(['SGP', 'SGPS', 'PARCC', 'PSAT', 'SAT', 'ACT', 'RICAS', 'MCAS', 'NECAP', 'COVID', 'COVID-19', 'AZM2', 'ELA', 'ELP', 'WIDA', 'WIDA-ACCESS', 'ACCESS', 'TAC', 'NCLB', 'AYP', 'ESEA', 'ESSA', 'NAEP', 'SBAC', 'RLI', 'UK', 'US', 'USA', 'R', 'NCME', 'AERA', 'CCSSO', 'NCSA', 'RILS', 'CSEM', 'II', 'III', 'K-12', 'DOE', 'IDOE', 'RIDE', 'ERB', 'PCG', 'NEERO']);
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'with']);

function fixCase(title) {
  const letters = title.replace(/[^A-Za-z]/g, '');
  if (!letters || letters.replace(/[^A-Z]/g, '').length / letters.length < 0.8) return title;
  return title
    .split(' ')
    .map((w, i) => {
      const bare = w.replace(/[^A-Za-z0-9'’-]/g, '').toUpperCase();
      if (ACRONYMS.has(bare)) return bare === 'SGPS' ? w.replace(/SGPS/i, 'SGPs') : w;
      const lower = w.toLowerCase();
      if (i > 0 && SMALL.has(lower.replace(/[^a-z]/g, ''))) return lower;
      return lower.replace(/^([^a-z]*)([a-z])/, (_, p, c) => p + c.toUpperCase()).replace(/([-’'])([a-z])/g, (_, p, c) => p + (p === '-' ? c.toUpperCase() : c));
    })
    .join(' ');
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function slideOneTitle(pdf) {
  const html = execFileSync('pdftotext', ['-bbox', '-f', '1', '-l', '1', pdf, '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const words = [...html.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
    h: Number(m[4]) - Number(m[2]),
    w: decode(m[5]),
  }));
  if (!words.length) return '';
  // Group into lines by vertical position, then keep lines set in the largest type.
  const lines = [];
  for (const wd of words.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l.y - wd.y) < wd.h * 0.5);
    if (line) line.words.push(wd);
    else lines.push({ y: wd.y, words: [wd] });
  }
  for (const l of lines) {
    l.h = Math.max(...l.words.map((w) => w.h));
    l.text = l.words.sort((a, b) => a.x - b.x).map((w) => w.w).join(' ').replace(/\s+/g, ' ').trim();
  }
  const big = Math.max(...lines.filter((l) => /[A-Za-z]{3}/.test(l.text)).map((l) => l.h));
  const kept = [];
  for (const l of lines.filter((x) => x.h >= big * 0.8 && /[A-Za-z]{3}/.test(x.text)).sort((a, b) => a.y - b.y)) {
    const text = l.text.replace(/^bg=\w+\s*/, '');
    if (NOT_TITLE.test(text)) continue;
    if (kept.length && VENUE_LINE.test(text)) break;
    kept.push(text);
  }
  const title = fixCase(
    kept
      .join(' ')
      .replace(/\s+([:,])/g, '$1')
      .replace(/COVID-\s+/gi, 'COVID-')
      .replace(/\s+draft paper available$/i, '')
      .replace(/(\s+(of|and|the|to|for|in|on|with|a|an))+$/i, '')
      .replace(/[\s:,;-]+$/, '')
      .trim(),
  );
  const letters = (title.match(/[A-Za-z]/g) || []).length;
  const ok = title.length >= 12 && title.length <= 140 && title.includes(' ') && letters / title.length > 0.7;
  return ok ? title : '';
}

const out = {};
const rows = [];
for (const t of full.talks) {
  if (!t.publish || t.delivery !== 'convert' || t.title_source !== 'filename' || SKIP.has(t.id)) continue;
  const ex = exported[t.id];
  if (ex?.status !== 'ok') continue;
  let title = '';
  try {
    title = slideOneTitle(ex.pdf);
  } catch {
    continue;
  }
  if (!title || title.toLowerCase() === t.title.toLowerCase()) continue;
  out[t.id] = title;
  rows.push(`${t.id}  ${t.title}  →  ${title}`);
}
fs.writeFileSync('catalog/generated/titles.yml', yaml.dump(out, { lineWidth: 200 }));
if (process.argv.includes('--print')) console.log(rows.join('\n'));
console.log(`titles: ${Object.keys(out).length} proposed`);
