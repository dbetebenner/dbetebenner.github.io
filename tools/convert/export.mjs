#!/usr/bin/env node
// Phase 2a: give every published converted deck a PDF (and presenter notes where the source has them).
//
//   Keynote / PowerPoint  -> Keynote export of a temp copy (sources are never opened in place)
//   beamer without a PDF  -> latexmk in a temp copy of the talk folder
//   PDF                   -> used as is
//
// Serial by design: Keynote is one process. Idempotent by source sha1; results go to
// catalog/generated/exported.yml.
//
//   node tools/convert/export.mjs [--only <id,...>] [--limit N] [--timeout 240]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
import { sourcePath } from '../lib/paths.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const ONLY = opt('--only', '') ? new Set(opt('--only').split(',')) : null;
const LIMIT = Number(opt('--limit', Infinity));
const TIMEOUT_S = Number(opt('--timeout', 240));

const WORK = path.resolve('work/export');
const STATE = 'catalog/generated/exported.yml';
const JXA = path.resolve('tools/convert/keynote-export.js');
fs.mkdirSync(WORK, { recursive: true });

const load = (p) => (fs.existsSync(p) ? yaml.load(fs.readFileSync(p, 'utf8'), { schema: yaml.CORE_SCHEMA }) || {} : {});
const full = load('catalog/generated/catalog.full.yml');
const state = load(STATE);
const save = () => fs.writeFileSync(STATE, yaml.dump(state, { lineWidth: 160, schema: yaml.CORE_SCHEMA }));

const pages = (pdf) => Number(execFileSync('pdfinfo', [pdf], { encoding: 'utf8' }).match(/^Pages:\s+(\d+)/m)[1]);

function quitKeynote() {
  spawnSync('osascript', ['-e', 'tell application "Keynote" to quit saving no'], { timeout: 30000 });
  spawnSync('pkill', ['-x', 'Keynote']);
}

function keynoteExport(src, pdfOut, notesOut) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kx-'));
  const copy = path.join(tmp, path.basename(src));
  execFileSync('cp', ['-R', src, copy]);
  try {
    const r = spawnSync('osascript', ['-l', 'JavaScript', JXA, copy, pdfOut || '-', notesOut], {
      encoding: 'utf8',
      timeout: TIMEOUT_S * 1000,
    });
    if (r.error || r.status !== 0) {
      quitKeynote();
      throw new Error((r.error?.code === 'ETIMEDOUT' ? `timeout after ${TIMEOUT_S}s` : r.stderr || 'osascript failed').trim().slice(0, 300));
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function beamerBuild(tex, pdfOut) {
  const dir = path.dirname(tex);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bx-'));
  execFileSync('cp', ['-R', `${dir}/.`, tmp]);
  const stem = path.basename(tex, '.tex');
  const r = spawnSync('latexmk', ['-pdf', '-interaction=nonstopmode', '-halt-on-error', `${stem}.tex`], { cwd: tmp, encoding: 'utf8', timeout: 300000 });
  const built = path.join(tmp, `${stem}.pdf`);
  try {
    if (r.status !== 0 || !fs.existsSync(built)) throw new Error(`latexmk failed: ${(r.stdout || '').split('\n').filter((l) => l.startsWith('!')).slice(0, 2).join(' ')}`);
    fs.copyFileSync(built, pdfOut);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const todo = full.talks.filter((t) => t.publish && t.delivery === 'convert' && (!ONLY || ONLY.has(t.id)));
let done = 0;
let failed = 0;
for (const t of todo) {
  if (done + failed >= LIMIT) break;
  const prev = state[t.id];
  if (prev && prev.sha1 === t.source.sha1 && prev.status === 'ok') continue;

  const primary = sourcePath(t, t.source.primary);
  const existingPdf = sourcePath(t, t.source.pdf);
  const pdfOut = path.join(WORK, `${t.id}.pdf`);
  const notesOut = path.join(WORK, `${t.id}.notes.json`);
  const started = Date.now();
  try {
    let pdf = existingPdf;
    let notes = null;
    if (t.source.format === 'keynote' || t.source.format === 'powerpoint') {
      keynoteExport(primary, existingPdf ? null : pdfOut, notesOut);
      if (!existingPdf) pdf = pdfOut;
      notes = notesOut;
    } else if (t.source.format === 'beamer' && !existingPdf) {
      const tex = t.source.originals.map((o) => o.path).find((p) => p.endsWith('.tex'));
      beamerBuild(sourcePath(t, tex), pdfOut);
      pdf = pdfOut;
    } else if (!pdf) {
      pdf = primary;
    }
    state[t.id] = { status: 'ok', sha1: t.source.sha1, pdf, notes, pages: pages(pdf), seconds: Math.round((Date.now() - started) / 1000) };
    done++;
  } catch (e) {
    state[t.id] = { status: 'failed', sha1: t.source.sha1, error: String(e.message || e) };
    failed++;
  }
  save();
  console.log(`${state[t.id].status.padEnd(6)} ${t.id} ${t.source.format} ${t.source.primary}${state[t.id].error ? ` — ${state[t.id].error}` : ''}`);
}
quitKeynote();
const all = Object.values(state);
console.log(`this run: ${done} ok, ${failed} failed; total ok ${all.filter((s) => s.status === 'ok').length} / failed ${all.filter((s) => s.status === 'failed').length}`);
