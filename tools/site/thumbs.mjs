#!/usr/bin/env node
// Card thumbnails for talks whose decks live elsewhere (delivery: link): the deck's title slide,
// captured in Chrome and written to public/thumbs/<slug>.webp. Converted decks use their shard's
// first slide instead. Existing thumbnails are kept unless --force.
//
//   node tools/site/thumbs.mjs [--force] [--only slug,...]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const OUT = 'public/thumbs';
fs.mkdirSync(OUT, { recursive: true });

const { talks } = yaml.load(fs.readFileSync('catalog/talks.yml', 'utf8'), { schema: yaml.CORE_SCHEMA });
const todo = talks.filter(
  (t) => t.delivery === 'link' && !t.converted && t.deck_url && (!ONLY || ONLY.has(t.slug)) && (FORCE || !fs.existsSync(`${OUT}/${t.slug}.webp`)),
);

const HIDE_CHROME = `.reveal .controls, .reveal .progress, .slide-menu-button, .slide-number, .reveal .slide-chalkboard-buttons,
  .quarto-title-block .quarto-title-banner + *, #quarto-header { visibility: hidden !important; }`;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbs-'));
let ok = 0;
for (const t of todo) {
  try {
    const res = await page.goto(t.deck_url, { waitUntil: 'networkidle', timeout: 45000 });
    if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status()}`);
    await page.addStyleTag({ content: HIDE_CHROME });
    await page.evaluate(() => window.Reveal?.configure?.({ controls: false, progress: false, slideNumber: false }));
    await page.waitForTimeout(2500);
    const png = path.join(tmp, `${t.slug}.png`);
    await page.screenshot({ path: png });
    execFileSync('cwebp', ['-quiet', '-resize', '640', '360', '-q', '80', png, '-o', `${OUT}/${t.slug}.webp`]);
    ok++;
    console.log(`ok     ${t.slug}`);
  } catch (e) {
    console.log(`failed ${t.slug}: ${String(e.message || e).split('\n')[0]}`);
  }
}
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`thumbs: ${ok} written, ${todo.length - ok} failed, ${talks.length - todo.length} not needed or already present`);
