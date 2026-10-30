#!/usr/bin/env node
// Write catalog/generated/REVIEW.md — the human checkpoint over the full (local) catalog.

import fs from 'node:fs';
import yaml from 'js-yaml';

const OUT = 'catalog/generated/REVIEW.md';
const cat = yaml.load(fs.readFileSync('catalog/generated/catalog.full.yml', 'utf8'), { schema: yaml.CORE_SCHEMA });
const talks = cat.talks;
const pub = talks.filter((t) => t.publish);
const held = talks.filter((t) => !t.publish);

const count = (arr, key) => arr.reduce((acc, t) => ((acc[t[key]] = (acc[t[key]] || 0) + 1), acc), {});
const row = (t) => `| ${t.date} | ${t.title.replace(/\|/g, '/')} | ${t.venue} | ${t.source?.format || t.delivery} | \`${t.id}\` |`;
const table = (rows) => ['| Date | Title | Venue | Format | Id |', '|---|---|---|---|---|', ...rows.map(row)].join('\n');

const groups = held.reduce((acc, t) => {
  const k = t.hold_reason || 'held';
  (acc[k.startsWith('duplicate file') ? 'duplicate file' : k] ||= []).push(t);
  return acc;
}, {});

const generic = pub.filter((t) => t.delivery === 'convert' && (t.title_source === 'filename') && t.title.split(' ').length <= 3);

const lines = [
  '# Catalog review',
  '',
  `Generated ${new Date().toISOString().slice(0, 10)} from the full catalog. Decisions go in \`catalog/overrides.yml\`, keyed by id.`,
  '',
  `- **${talks.length}** talks inventoried; **${pub.length}** will publish, **${held.length}** are held.`,
  `- Published by delivery: ${Object.entries(count(pub, 'delivery')).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
  `- Published by event type: ${Object.entries(count(pub, 'event_type')).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
  `- Converted decks by source format: ${Object.entries(pub.filter((t) => t.delivery === 'convert').reduce((a, t) => ((a[t.source.format] = (a[t.source.format] || 0) + 1), a), {})).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
  '',
  '## Held talks',
  '',
  'To publish one, add `<id>: { publish: true }` to `catalog/overrides.yml`.',
  '',
  ...Object.entries(groups).flatMap(([reason, ts]) => [`### ${reason} (${ts.length})`, '', table(ts), '']),
  '## Titles taken from short file names',
  '',
  'These published talks still carry a title derived from a terse file name. The conversion step replaces a title',
  'with the deck\'s first-slide text when the file name is generic; anything still wrong here is worth an override.',
  '',
  table(generic),
  '',
];
fs.writeFileSync(OUT, `${lines.join('\n')}\n`);
console.log(`${OUT}: ${pub.length} published, ${held.length} held, ${generic.length} short titles`);
