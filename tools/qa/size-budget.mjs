#!/usr/bin/env node
// Fail when a rendered site outgrows its budget. Hub and shard budgets differ because shards
// carry slide images; GitHub Pages refuses sites over 1 GB.
//
//   node tools/qa/size-budget.mjs <dir> [--max-mb 60] [--max-page-kb 600]

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const dir = args[0];
const opt = (name, dflt) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : dflt);
const MAX_MB = opt('--max-mb', 60);
const MAX_PAGE_KB = opt('--max-page-kb', 600);

let total = 0;
const heavyPages = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else {
      const { size } = fs.statSync(p);
      total += size;
      if (p.endsWith('.html') && size > MAX_PAGE_KB * 1024) heavyPages.push(`${p} ${(size / 1024).toFixed(0)} KB`);
    }
  }
})(dir);

const mb = total / 1e6;
console.log(`${dir}: ${mb.toFixed(1)} MB (budget ${MAX_MB} MB); ${heavyPages.length} pages over ${MAX_PAGE_KB} KB`);
for (const p of heavyPages) console.log(`  heavy: ${p}`);
if (mb > MAX_MB || heavyPages.length) process.exit(1);
