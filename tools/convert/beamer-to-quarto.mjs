#!/usr/bin/env node
// First-draft Quarto RevealJS source from a beamer talk: one slide per frame, pandoc's LaTeX
// reader for the frame bodies, figures as SVG (WebP when the SVG is heavy), \includepdf
// pages as figure slides, and the cited entries of the shared bibliography. The draft is
// finished by hand: alt text, overlays, layout.
//
//   node tools/convert/beamer-to-quarto.mjs --id <talk id> [--out decks/<slug>] [--from-pdf file.pdf=14,other.pdf=15]
//
// --from-pdf takes figures that are no longer on disk from pages of the compiled deck.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { sourcePath } from '../lib/paths.mjs';

const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const ID = arg('--id');
if (!ID) {
  console.error('usage: beamer-to-quarto.mjs --id <talk id> [--out dir]');
  process.exit(2);
}

const BIB = process.env.BEAMER_BIB || '/Users/conet/.TeX/Bibliography/educ.bib';
const PREAMBLE = process.env.BEAMER_PREAMBLE || '/Users/conet/.TeX/Preambles/ncieabeamerpreamble.tex';
const SVG_MAX_BYTES = 400 * 1024;

const catalog = yaml.load(fs.readFileSync('catalog/generated/catalog.full.yml', 'utf8'), { schema: yaml.CORE_SCHEMA });
const talk = catalog.talks.find((t) => t.id === ID);
if (!talk) throw new Error(`no talk ${ID}`);
const OUT = arg('--out') || `decks/${talk.slug}`;
const FROM_PDF = new Map((arg('--from-pdf') || '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k, Number(v)]; }));

const pdfPath = sourcePath(talk, talk.source.primary);
const texPath = [pdfPath.replace(/\.pdf$/, '.tex'), path.join(path.dirname(pdfPath), 'presentation.tex')].find((p) => fs.existsSync(p));
if (!texPath) throw new Error(`no .tex beside ${pdfPath}`);
const texDir = path.dirname(texPath);

const stripComments = (s) => s.replace(/(^|[^\\])%.*$/gm, '$1');
const tex = stripComments(fs.readFileSync(texPath, 'utf8'));
const body = tex.slice(tex.indexOf('\\begin{document}') + '\\begin{document}'.length, tex.indexOf('\\end{document}'));
const macros = stripComments(fs.existsSync(PREAMBLE) ? fs.readFileSync(PREAMBLE, 'utf8') : '')
  .split('\n')
  .filter((l) => /^\\(newcommand|renewcommand|def)\b/.test(l.trim()))
  .join('\n');

// Balanced-brace argument starting at s[i] === '{'; returns [content, indexAfter].
function braced(s, i) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '{') depth++;
    else if (s[j] === '}' && --depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  throw new Error(`unbalanced braces at ${i}`);
}
const skipSpace = (s, i) => { while (/\s/.test(s[i] || '')) i++; return i; };
function bracketed(s, i) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '[' ) depth++;
    else if (s[j] === ']' && --depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  throw new Error(`unbalanced brackets at ${i}`);
}
function command(s, name) {
  const m = new RegExp(`\\\\${name}(?:<[^>]*>)?\\s*(?:\\[[^\\]]*\\])?\\s*\\{`).exec(s);
  return m ? braced(s, m.index + m[0].length - 1)[0] : null;
}

// ── Figures ─────────────────────────────────────────────────────────────
const assetsDir = path.join(OUT, 'figures');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(assetsDir, { recursive: true });
const figureCache = new Map();

// The decks find figures through TEXINPUTS rather than \graphicspath, so search Figures/ too.
const figureDirs = [texDir];
(function walk(d) {
  if (!fs.existsSync(d)) return;
  figureDirs.push(d);
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory() && !/^\./.test(e.name)) walk(path.join(d, e.name));
  }
})(path.join(texDir, 'Figures'));

function resolveFigure(ref) {
  for (const dir of figureDirs) {
    const base = path.resolve(dir, ref);
    const hit = [base, `${base}.pdf`, `${base}.png`, `${base}.jpg`, `${base}.jpeg`].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
    if (hit) return hit;
  }
  return null;
}

function figure(file, page = 1) {
  const key = `${file}#${page}`;
  if (figureCache.has(key)) return figureCache.get(key);
  const stem = path.basename(file).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '-') + (page > 1 ? `-p${page}` : '');
  let out;
  if (/\.pdf$/i.test(file)) {
    const svg = path.join(assetsDir, `${stem}.svg`);
    execFileSync('pdftocairo', ['-svg', '-f', String(page), '-l', String(page), file, svg]);
    if (fs.statSync(svg).size <= SVG_MAX_BYTES) out = svg;
    else {
      fs.rmSync(svg);
      const tmp = path.join(os.tmpdir(), `${stem}-${process.pid}`);
      execFileSync('pdftoppm', ['-png', '-r', '200', '-singlefile', '-f', String(page), '-l', String(page), file, tmp]);
      out = path.join(assetsDir, `${stem}.webp`);
      execFileSync('cwebp', ['-quiet', '-q', '85', '-resize', '1600', '0', `${tmp}.png`, '-o', out]);
      fs.rmSync(`${tmp}.png`);
    }
  } else {
    out = path.join(assetsDir, `${stem}.webp`);
    execFileSync('cwebp', ['-quiet', '-q', '85', file, '-o', out]);
  }
  const rel = path.relative(OUT, out);
  figureCache.set(key, rel);
  return rel;
}

function pdfPageCount(file) {
  return Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [file], { encoding: 'utf8' }))[1]);
}

function includepdfPages(opts, file) {
  const m = /pages\s*=\s*(\{[^}]*\}|[^,\]]+)/.exec(opts || '');
  if (!m) return [1];
  const spec = m[1].replace(/[{}\s]/g, '');
  const n = pdfPageCount(file);
  const pages = [];
  for (const part of spec.split(',')) {
    if (part === '-') for (let p = 1; p <= n; p++) pages.push(p);
    else if (part.includes('-')) {
      const [a, b] = part.split('-');
      for (let p = Number(a || 1); p <= Number(b || n); p++) pages.push(p);
    } else if (part) pages.push(Number(part));
  }
  return pages;
}

const humanize = (file) => path.basename(file).replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

// ── Frames → markdown ───────────────────────────────────────────────────
const cited = new Set();
const nocited = new Set();

function pandoc(latex) {
  const md = execFileSync('pandoc', ['-f', 'latex', '-t', 'markdown-simple_tables-multiline_tables-grid_tables-raw_attribute', '--wrap=none'], {
    input: `${macros}\n${latex}`,
    encoding: 'utf8',
  });
  const eqId = (label) => `eq-${label.replace(/^eqn?:/, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}`;
  return md
    .replace(/\$\$\\label\{([^}]*)\}\s*([\s\S]*?)\$\$/g, (_, label, math) => `$$\n${math.trim()}\n$$ {#${eqId(label)}}`)
    .replace(/\[\\\[[^\]]*\\\]\]\(#[^)]*\)\{reference-type="ref" reference="([^"]*)"\}/g, (_, label) => `@${eqId(label)}`)
    .replace(/\[([^\]]*)\]\{style="color: [^"]*"\}/g, '**[$1]{.accent}**')
    .replace(/\\\n/g, '\n')
    .trim();
}

// Beamer columns become Quarto column divs; each column body goes through pandoc on its own.
function frameMarkdown(latex) {
  const parts = latex.split(/\\begin\{columns\}(?:\[[^\]]*\])?|\\end\{columns\}/);
  return parts
    .map((part, k) => {
      if (k % 2 === 0) return part.trim() ? pandoc(part) : '';
      const cols = [...part.matchAll(/\\begin\{column\}\s*\{([^}]*)\}([\s\S]*?)\\end\{column\}/g)];
      const body = cols
        .map(([, width, inner]) => {
          const w = /([\d.]+)\s*\\(?:text|line)width/.exec(width);
          return `::: {.column width="${w ? Math.round(Number(w[1]) * 100) : Math.round(100 / cols.length)}%"}\n${pandoc(inner)}\n:::`;
        })
        .join('\n\n');
      return `:::: {.columns}\n${body}\n::::`;
    })
    .filter(Boolean)
    .join('\n\n')
    .replace(/^(#{3,} .*)$/gm, (h) => h.replace(/\*\*\[([^\]]*)\]\{\.accent\}\*\*/g, '$1'));
}

const inline = (latex) => (latex.trim() ? pandoc(latex).replace(/\s*\n+\s*/g, ' ').replace(/\*\*\[([^\]]*)\]\{\.accent\}\*\*/g, '$1') : '');

function frameBody(raw) {
  let s = raw
    .replace(/\\frametitle(?:<[^>]*>)?\s*\{/, '\\FRAMETITLE{')
    .replace(/\\(begin\{(?:itemize|enumerate|description)\})\s*\[<[^\]]*>\]/g, '\\$1')
    .replace(/\\item\s*<[^>]*>/g, '\\item ')
    .replace(/\\(?:only|uncover|visible|onslide)\s*<[^>]*>\s*/g, '')
    .replace(/\\pause\b/g, '')
    .replace(/\\alert(?:<[^>]*>)?\{/g, '\\emph{')
    .replace(/\\nocite\{([^}]*)\}/g, (_, keys) => { keys.split(',').forEach((k) => { cited.add(k.trim()); nocited.add(k.trim()); }); return ''; })
    .replace(/\\(?:vspace|hspace)\*?\{[^}]*\}/g, '')
    .replace(/\\(?:begin|end)\{(?:center|flushleft|flushright)\}/g, '')
    .replace(/\\begin\{beamerboxesrounded\}\s*\[[^\]]*\]\s*\{/g, '\\subsubsection*{')
    .replace(/\\begin\{(?:block|alertblock|exampleblock)\}\s*\{/g, '\\subsubsection*{')
    .replace(/\\end\{(?:block|alertblock|exampleblock|beamerboxesrounded)\}/g, '')
    .replace(/\\(?:small|footnotesize|scriptsize|tiny|large|Large|centering|normalsize)\b/g, '');

  for (const m of s.matchAll(/\\cite[pt]?\{([^}]*)\}/g)) m[1].split(',').forEach((k) => cited.add(k.trim()));

  s = s.replace(/\\includegraphics\s*(\[[^\]]*\])?\s*\{([^}]*)\}/g, (all, opts, ref) => {
    const file = resolveFigure(ref);
    if (!file) { console.warn(`  missing figure ${ref}`); return ''; }
    const pageM = /page\s*=\s*(\d+)/.exec(opts || '');
    return `\\includegraphics{${figure(file, pageM ? Number(pageM[1]) : 1)}}`;
  });

  const title = command(s, 'FRAMETITLE');
  if (title !== null) s = s.replace(/\\FRAMETITLE\s*\{/, '\\FRAMETITLE{').replace(`\\FRAMETITLE{${title}}`, '');
  return { title, latex: s };
}

const slides = [];
const tokenRe = /\\begin\{frame\}|\\includepdf\b/g;
for (let m; (m = tokenRe.exec(body)); ) {
  if (m[0] === '\\includepdf') {
    let j = skipSpace(body, m.index + m[0].length);
    let opts = '';
    if (body[j] === '[') [opts, j] = bracketed(body, j);
    const [ref, after] = braced(body, skipSpace(body, j));
    tokenRe.lastIndex = after;
    if (FROM_PDF.has(ref)) {
      slides.push({ kind: 'figure', src: figure(pdfPath, FROM_PDF.get(ref)), label: humanize(ref) });
      continue;
    }
    const file = resolveFigure(ref);
    if (!file) { console.warn(`  missing includepdf ${ref}`); continue; }
    for (const p of includepdfPages(opts, file)) slides.push({ kind: 'figure', src: figure(file, p), label: humanize(file) });
    continue;
  }
  const end = body.indexOf('\\end{frame}', m.index);
  let j = m.index + m[0].length;
  let frameTitle = null;
  for (;;) {
    j = skipSpace(body, j);
    if (body[j] === '[') j = bracketed(body, j)[1];
    else if (body[j] === '<') j = body.indexOf('>', j) + 1;
    else break;
  }
  j = skipSpace(body, j);
  if (body[j] === '{') {
    [frameTitle, j] = braced(body, j);
    j = skipSpace(body, j);
    if (body[j] === '{') j = braced(body, j)[1];
  }
  tokenRe.lastIndex = end + '\\end{frame}'.length;
  const raw = body.slice(j, end);
  if (/\\titlepage/.test(raw)) continue;
  if (/\\bibliography\{/.test(raw)) { slides.push({ kind: 'refs' }); continue; }
  const { title, latex } = frameBody(raw);
  slides.push({ kind: 'frame', title: (title ?? frameTitle ?? '').replace(/^~$/, ''), latex });
}

// ── Bibliography subset ─────────────────────────────────────────────────
// Entries the decks cite that the shared bibliography lacks (recovered from their .bbl files).
const EXTRA_BIB = {
  'Campbell:1976': `@TechReport{Campbell:1976,
  author = {Donald T. Campbell},
  title = {Assessing the Impact of Planned Social Change},
  institution = {The Public Affairs Center, Dartmouth College},
  address = {Hanover, NH},
  year = {1976}
}`,
};
function bibSubset(keys) {
  const src = fs.readFileSync(BIB, 'utf8');
  const out = [];
  for (const key of keys) {
    const m = new RegExp(`@\\w+\\s*\\{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*,`, 'i').exec(src);
    if (!m) {
      if (EXTRA_BIB[key]) out.push(EXTRA_BIB[key]);
      else console.warn(`  missing bib entry ${key}`);
      continue;
    }
    const start = m.index;
    out.push(src.slice(start, braced(src, src.indexOf('{', start))[1]));
  }
  return out.join('\n\n') + '\n';
}

// ── Write ───────────────────────────────────────────────────────────────
const titleRaw = command(tex, 'title');
const plain = (s) => pandoc(s || '').replace(/\n+/g, ' ').replace(/\[([^\]]*)\]\{[^}]*\}/g, '$1').trim();
const front = {
  title: talk.title || plain(titleRaw),
  subtitle: `${talk.venue}, ${new Date(`${talk.date}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}`,
  author: [{ name: 'Damian W. Betebenner', affiliation: 'Center for Assessment' }, ...(talk.coauthors || []).map((name) => ({ name }))],
  description: `${talk.title} — ${talk.venue}. Rebuilt from the original beamer slides.`,
  format: { 'deck-revealjs': { 'slide-number': 'c/t' } },
};
if (cited.size) {
  fs.writeFileSync(path.join(OUT, 'references.bib'), bibSubset([...cited]));
  front.bibliography = 'references.bib';
  if (nocited.size) front.nocite = [...nocited].map((k) => `@${k}`).join(', ');
}

let md = '';
let lastTitle = '';
for (const s of slides) {
  if (s.kind === 'figure') {
    md += `## ${lastTitle || 'TODO title'} {.figure-slide}\n\n![](${s.src}){fig-alt="TODO alt text: ${s.label}"}\n\n`;
  } else if (s.kind === 'refs') {
    md += `## References {.smaller .scrollable}\n\n::: {#refs}\n:::\n\n`;
  } else {
    let content;
    try {
      content = frameMarkdown(s.latex);
    } catch {
      content = `<!-- TODO: columns could not be split; check this slide against the original -->\n\n${pandoc(s.latex.replace(/\\(?:begin|end)\{columns?\}(\{[^}]*\})?/g, ''))}`;
    }
    const text = content.replace(/!\[[^\]]*\]\([^)]*\)(\{[^}]*\})?/g, '');
    const size = text.length > 1500 ? ' {.smaller .scrollable}' : text.length > 900 ? ' {.smaller}' : '';
    lastTitle = inline(s.title);
    md += `## ${lastTitle}${size}\n\n${content}\n\n`;
  }
}
if (cited.size && !slides.some((s) => s.kind === 'refs')) md += `## References {.smaller .scrollable}\n\n::: {#refs}\n:::\n\n`;

fs.writeFileSync(path.join(OUT, 'index.qmd'), `---\n${yaml.dump(JSON.parse(JSON.stringify(front)), { lineWidth: -1 })}---\n\n${md}`);
console.log(`${ID} → ${OUT}: ${slides.length} slides, ${figureCache.size} figures, ${cited.size} citations (source ${path.basename(texPath)})`);
