#!/usr/bin/env node
// Advisory sensitive-content scan over every published converted deck.
// Writes catalog/generated/sensitivity.yml (term + page only, never the matched text).
// Decisions go in catalog/overrides.yml; this scan never changes publish state itself.
//
//   node tools/inventory/scan-sensitive.mjs [--work work/export]
//
// Keynote decks have no readable text until exported; rerun after tools/convert/export.

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { sourcePages } from '../lib/deck-text.mjs';
import { sourcePath } from '../lib/paths.mjs';

const args = process.argv.slice(2);
const WORK = args.includes('--work') ? args[args.indexOf('--work') + 1] : 'work/export';

const HIGH = [
  ['confidential', /\bconfidential\b/i],
  ['do not distribute', /\bdo not (distribute|share|circulate|cite|copy)\b/i],
  ['not for distribution', /\bnot for (distribution|circulation|citation|public)\b/i],
  ['embargo', /\bembargo(ed)?\b/i],
  ['internal use', /\b(for )?internal (use|only)\b/i],
  ['privileged', /\bprivileged\b/i],
  ['deliberative', /\bdeliberative\b/i],
  ['pre-decisional', /\bpre-?decisional\b/i],
  ['social security number', /\b\d{3}-\d{2}-\d{4}\b/],
];
const LOW = [
  ['draft', /\bdraft\b/i],
  ['student identifier', /\b(SASID|student[ _]?id|STATE_?ID|SSID|date of birth|DOB)\b/i],
  ['preliminary results', /\bpreliminary\b/i],
];

const full = yaml.load(fs.readFileSync('catalog/generated/catalog.full.yml', 'utf8'), { schema: yaml.CORE_SCHEMA });
const exported = fs.existsSync('catalog/generated/exported.yml')
  ? yaml.load(fs.readFileSync('catalog/generated/exported.yml', 'utf8'), { schema: yaml.CORE_SCHEMA }) || {}
  : {};

const flagged = [];
const pending = [];
let scanned = 0;
for (const t of full.talks) {
  if (!t.publish || t.delivery !== 'convert') continue;
  const abs = (rel) => sourcePath(t, rel);
  const pdf = exported[t.id]?.pdf || abs(t.source.pdf) || (fs.existsSync(path.join(WORK, `${t.id}.pdf`)) ? path.join(WORK, `${t.id}.pdf`) : null);
  const pages = sourcePages(abs(t.source.primary), t.source.format, pdf);

  const hits = [];
  const name = `${t.source.primary} ${t.title}`;
  for (const [level, rules] of [['high', HIGH], ['low', LOW]]) {
    for (const [term, re] of rules) {
      const where = [];
      if (re.test(name)) where.push('filename');
      (pages || []).forEach((p, i) => re.test(p) && where.push(i + 1));
      if (where.length) hits.push({ level, term, where: where.slice(0, 12), count: where.length });
    }
  }
  if (!pages) pending.push(t.id);
  else scanned++;
  if (hits.length) {
    flagged.push({
      id: t.id,
      date: t.date,
      title: t.title,
      venue: t.venue,
      primary: t.source.primary,
      level: hits.some((h) => h.level === 'high') ? 'high' : 'low',
      hits,
    });
  }
}

const out = {
  generated: new Date().toISOString(),
  scanned,
  pending_text: pending.length,
  high: flagged.filter((f) => f.level === 'high').length,
  low: flagged.filter((f) => f.level === 'low').length,
  flagged: flagged.sort((a, b) => (a.level === b.level ? a.date.localeCompare(b.date) : a.level === 'high' ? -1 : 1)),
  pending_ids: pending,
};
fs.writeFileSync('catalog/generated/sensitivity.yml', yaml.dump(out, { lineWidth: 160 }));
console.log(`scanned ${scanned}, pending ${pending.length} (Keynote, needs export); flagged high ${out.high}, low ${out.low}`);
