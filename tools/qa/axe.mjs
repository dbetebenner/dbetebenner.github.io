#!/usr/bin/env node
// axe-core pass (WCAG 2.1 A/AA) over a representative set of rendered pages, in light and dark.
// Drives the system Chrome through playwright-core, so no browser download is needed.
//
//   node tools/qa/axe.mjs http://127.0.0.1:4321 [extra paths...]

import fs from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import yaml from 'js-yaml';

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const [base, ...extra] = process.argv.slice(2);
const catalog = yaml.load(fs.readFileSync('catalog/talks.yml', 'utf8'), { schema: yaml.CORE_SCHEMA });
const pick = (pred) => catalog.talks.find(pred);
const samples = [
  pick((t) => t.delivery === 'link'),
  pick((t) => t.delivery === 'repo'),
  pick((t) => t.delivery === 'convert' && t.signature),
  pick((t) => t.delivery === 'convert' && t.series_members?.length),
].filter(Boolean);
const paths = ['/', '/talks/', '/papers/', '/code.html', '/archive.html', '/about.html', ...samples.map((t) => `/talks/${t.slug}/`), ...extra];

const browser = await chromium.launch({ channel: 'chrome' });
let failures = 0;
for (const scheme of ['light', 'dark']) {
  const page = await browser.newPage({ colorScheme: scheme });
  for (const p of paths) {
    await page.goto(`${base}${p}`, { waitUntil: 'load' });
    await page.addScriptTag({ content: axeSource });
    const { violations } = await page.evaluate(() =>
      window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }),
    );
    const label = `${scheme.padEnd(5)} ${p}`;
    if (!violations.length) { console.log(`ok    ${label}`); continue; }
    failures += violations.length;
    console.log(`FAIL  ${label}`);
    for (const v of violations) {
      console.log(`      ${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`);
      for (const n of v.nodes.slice(0, 3)) console.log(`        ${n.target.join(' ')}  ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`);
    }
  }
  await page.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
