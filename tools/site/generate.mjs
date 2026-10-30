#!/usr/bin/env node
// Run before `quarto render` (pnpm site:generate): write one landing page per published talk and paper, plus the listing
// data the index pages read, from catalog/talks.yml and catalog/papers.yml.
// Everything written here is gitignored and rebuilt on every render.

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const load = (p) => yaml.load(fs.readFileSync(p, 'utf8'), { schema: yaml.CORE_SCHEMA });
const dump = (o) => yaml.dump(o, { lineWidth: -1, noRefs: true, schema: yaml.CORE_SCHEMA });
const write = (p, s) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const catalog = load('catalog/talks.yml');
const papers = load('catalog/papers.yml').papers || [];
const talks = catalog.talks;
const byId = new Map(talks.map((t) => [t.id, t]));

const EVENT = {
  conference: 'Conference',
  colloquium: 'Colloquium',
  staff: 'Staff session',
  academic: 'Academic',
  invited: 'Invited talk',
  tac: 'Technical advisory committee',
  state: 'State agency',
};
const FORMAT = { keynote: 'Keynote', powerpoint: 'PowerPoint', beamer: 'Beamer', pdf: 'PDF' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function displayDate(t) {
  const [y, m, d] = t.date.split('-').map(Number);
  if (t.date_precision === 'year') return String(y);
  if (t.date_precision === 'day') return `${MONTHS[m - 1]} ${d}, ${y}`;
  return `${MONTHS[m - 1]} ${y}`;
}
const shortDate = (t) => (t.date_precision === 'year' ? String(t.year) : `${MONTHS[Number(t.date.slice(5, 7)) - 1].slice(0, 3)} ${t.year}`);

function formatOf(t) {
  if (t.delivery === 'link') return { key: 'quarto', label: 'Quarto' };
  if (t.delivery === 'repo') return { key: 'github', label: 'GitHub' };
  return { key: t.source.format, label: FORMAT[t.source.format] || t.source.format };
}

const converted = (t) => t.delivery === 'convert' && t.converted?.status === 'ok';
const thumbOf = (t) => (converted(t) ? `${t.deck_url}slides/01.webp` : null);
const pagePath = (t) => `talks/${t.slug}/index.qmd`;

function slideText(t) {
  const p = `catalog/text/${t.id}.json`;
  if (!fs.existsSync(p)) return null;
  const pages = JSON.parse(fs.readFileSync(p, 'utf8'));
  return pages.some((s) => s.trim()) ? pages : null;
}

function talkPage(t) {
  const fmt = formatOf(t);
  const front = {
    title: t.title,
    subtitle: [t.venue, displayDate(t)].filter(Boolean).join(' · '),
    date: t.date,
    description: `${t.title} — ${t.venue}, ${displayDate(t)}.`,
    ...(thumbOf(t) ? { image: thumbOf(t) } : {}),
    'date-format': 'long',
    'page-layout': 'article',
  };

  const facts = [
    ['Event', EVENT[t.event_type] || t.event_type],
    ...(t.coauthors?.length ? [['With', t.coauthors.join(', ')]] : []),
    ...(t.slides ? [['Slides', String(t.slides)]] : []),
    ['Format', fmt.key === 'quarto' ? 'Quarto RevealJS' : fmt.key === 'github' ? 'Materials on GitHub' : `Converted from ${fmt.label}`],
    ...(t.also_presented?.length ? [['Also given', t.also_presented.map((a) => a.venue || a).join('; ')]] : []),
  ];

  const actions = [];
  const decks = t.decks?.length ? t.decks : t.deck_url ? [{ label: 'Slides', url: t.deck_url }] : [];
  if (t.delivery === 'repo') {
    actions.push(`<a class="primary" href="${esc(t.github.repo_url)}">Materials on GitHub</a>`);
  } else {
    for (const [i, d] of decks.entries()) {
      actions.push(`<a class="${i === 0 ? 'primary' : ''}" href="${esc(d.url)}">${decks.length > 1 ? esc(d.label) : 'Open slides full screen'}</a>`);
    }
  }
  if (converted(t)) {
    actions.push(`<a href="${esc(t.converted.pdf_url)}">Download PDF</a>`);
    if (t.converted.original_url) actions.push(`<a href="${esc(t.converted.original_url)}">Original ${esc(FORMAT[t.source.format] || 'file')}</a>`);
  }
  if (t.delivery === 'link' && t.github?.repo_url) actions.push(`<a href="${esc(t.github.repo_url)}">Source on GitHub</a>`);
  if (t.related_repo) actions.push(`<a href="${esc(t.related_repo)}">Materials on GitHub</a>`);

  const embed = t.delivery !== 'repo' && decks[0] && (t.delivery === 'link' || converted(t));

  let body = '';
  body += '```{=html}\n';
  body += `<dl class="talk-facts">\n${facts.map(([k, v]) => `  <dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('\n')}\n</dl>\n`;
  if (embed) {
    body += `<div class="deck-frame"><iframe src="${esc(decks[0].url)}" title="Slides: ${esc(t.title)}" loading="lazy" allow="fullscreen" allowfullscreen></iframe></div>\n`;
  }
  body += `<ul class="talk-actions">${actions.map((a) => `<li>${a}</li>`).join('')}</ul>\n`;
  body += '```\n\n';

  if (t.subtitle && t.delivery !== 'convert') body += `${t.subtitle}\n\n`;
  if (t.delivery === 'convert') {
    body += '::: {.callout-note appearance="minimal"}\nThis deck is an image-based copy of the original slides. Builds and animations are flattened; the slide text is reproduced below for search and screen readers.\n:::\n\n';
  }

  if (t.series && catalog.series?.[t.series]) {
    const s = catalog.series[t.series];
    const members = (t.series_members || []).map((id) => byId.get(id)).filter((m) => m?.publish);
    body += `## Part of a series: ${s.title}\n\n${s.summary || ''}\n\n`;
    for (const m of members) body += `- [${m.title}](/talks/${m.slug}/) — ${m.venue}, ${displayDate(m)}\n`;
    body += '\n';
  }

  const text = slideText(t);
  if (text) {
    body += '```{=html}\n<details class="slide-text"><summary>Slide text</summary><ol>\n';
    body += text.map((p) => `<li>${esc(p.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim())}</li>`).join('\n');
    body += '\n</ol></details>\n```\n';
  }
  return `---\n${dump(front)}---\n\n${body}`;
}

// ── Talks ───────────────────────────────────────────────────────────────
for (const e of fs.readdirSync('talks', { withFileTypes: true })) {
  if (e.isDirectory()) fs.rmSync(path.join('talks', e.name), { recursive: true, force: true });
}

const items = [];
for (const t of talks) {
  write(pagePath(t), talkPage(t));
  const fmt = formatOf(t);
  items.push({
    title: t.title,
    path: `/talks/${t.slug}/`,
    date: t.date,
    date_label: shortDate(t),
    year: t.year,
    venue: t.venue,
    event_type: t.event_type,
    event_label: EVENT[t.event_type] || t.event_type,
    format: fmt.key,
    format_label: fmt.label,
    signature: Boolean(t.signature),
    thumb: thumbOf(t),
    tags: t.tags || [],
  });
}
write('listings/talks.yml', dump(items));
write('listings/featured.yml', dump(items.filter((i, k) => talks[k].featured)));
write('listings/recent.yml', dump(items.slice(0, 6)));

const years = new Set(talks.map((t) => t.year));
const stats = [
  [talks.length, 'talks'],
  [`${Math.min(...years)}–${Math.max(...years)}`, 'years'],
  [new Set(talks.map((t) => t.venue)).size, 'venues'],
  [papers.length, 'papers'],
];
write('listings/home-stats.md', `\`\`\`{=html}\n<div class="stat-row">${stats.map(([n, l]) => `<div class="stat"><strong>${esc(n)}</strong><span>${esc(l)}</span></div>`).join('')}</div>\n\`\`\`\n`);

// ── Papers ──────────────────────────────────────────────────────────────
function bibtex(p) {
  const key = `${p.authors[0].split(' ').at(-1).toLowerCase()}${p.year}${p.slug.split('-')[0]}`;
  const type = p.type === 'article' ? 'article' : 'techreport';
  const fields = {
    author: p.authors.join(' and '),
    title: `{${p.title}}`,
    year: p.year,
    ...(type === 'article' ? { journal: p.venue } : { institution: p.venue }),
    ...(p.volume ? { volume: p.volume } : {}),
    ...(p.issue ? { number: p.issue } : {}),
    ...(p.pages ? { pages: String(p.pages).replace('–', '--') } : {}),
    ...(p.doi ? { doi: p.doi } : {}),
  };
  const w = Math.max(...Object.keys(fields).map((k) => k.length));
  return `@${type}{${key},\n${Object.entries(fields).map(([k, v]) => `  ${k.padEnd(w)} = {${v}}`).join(',\n')}\n}`;
}

const citation = (p) =>
  [p.authors.join(', '), `(${p.year}).`, `${p.title}.`, p.venue ? `*${p.venue}*${p.volume ? `, ${p.volume}${p.issue ? `(${p.issue})` : ''}` : ''}${p.pages ? `, ${p.pages}` : ''}.` : '', p.doi ? `https://doi.org/${p.doi}` : '']
    .filter(Boolean)
    .join(' ');

const paperItems = [];
for (const p of papers) {
  const dir = `papers/${p.slug}`;
  const pdf = `${p.slug}.pdf`;
  const hasPdf = fs.existsSync(path.join(dir, pdf));
  const front = {
    title: p.title,
    subtitle: `${p.authors.join(', ')} · ${p.year}`,
    date: p.date || `${p.year}-01-01`,
    description: p.abstract ? `${p.abstract.slice(0, 180).trim()}…` : p.title,
    'page-layout': 'article',
  };
  const actions = [];
  if (hasPdf) actions.push(`<a class="primary" href="${pdf}">Download PDF</a>`);
  if (p.doi) actions.push(`<a href="https://doi.org/${esc(p.doi)}">Publisher version (DOI)</a>`);
  let body = '```{=html}\n';
  body += `<dl class="talk-facts">${p.venue ? `<dt>Published in</dt><dd>${esc(p.venue)}</dd>` : ''}<dt>Version</dt><dd>${esc((p.version || '').replace(/-/g, ' '))}</dd></dl>\n`;
  body += `<ul class="talk-actions">${actions.map((a) => `<li>${a}</li>`).join('')}</ul>\n\`\`\`\n\n`;
  if (p.version_note) body += `::: {.callout-note appearance="minimal"}\n${p.version_note}\n:::\n\n`;
  if (p.abstract) body += `## Abstract\n\n${p.abstract}\n\n`;
  body += `## Cite\n\n${citation(p)}\n\n::: {.bibtex}\n\`\`\`bibtex\n${bibtex(p)}\n\`\`\`\n:::\n`;
  write(`${dir}/index.qmd`, `---\n${dump(front)}---\n\n${body}`);
  paperItems.push({
    title: p.title,
    path: `/papers/${p.slug}/`,
    year: p.year,
    cite: [p.authors.join(', '), p.venue, p.year].filter(Boolean).join(' · '),
    featured: Boolean(p.featured),
  });
}
write('listings/papers.yml', dump(paperItems));

// ── Code, sites, experiments ────────────────────────────────────────────
write(
  'listings/packages.yml',
  dump((catalog.packages || []).map((p) => ({ title: p.title, path: p.url || p.github?.repo_url, description: p.summary || p.github?.description || '' }))),
);
write(
  'listings/sites.yml',
  dump((catalog.sites || []).map((s) => ({ title: s.title, path: s.url, description: s.summary || s.github?.description || '', date: s.date }))),
);
write(
  'listings/experiments.yml',
  dump(
    (catalog.experiments || []).flatMap((e) =>
      (e.items || []).map((i) => ({ title: i.title || i.description || i.repo, path: i.url, description: e.title, date: e.date })),
    ),
  ),
);

console.log(`generate: ${talks.length} talk pages, ${papers.length} paper pages`);
