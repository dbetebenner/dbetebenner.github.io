#!/usr/bin/env node
// Enrich catalog/repos.yml from GitHub and write catalog/generated/repos.yml.
//
// For every repo: visibility, last push, Pages URL, local checkout path; for every talk deck:
// the resolved URL and its live HTTP status. Needs `gh` (authenticated) and network access.
//
//   node tools/inventory/scan-repos.mjs [--owner dbetebenner] [--local /Users/conet/GitHub/DBetebenner]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { slugify } from '../lib/talk-meta.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const OWNER = opt('--owner', 'dbetebenner');
const LOCAL = opt('--local', '/Users/conet/GitHub/DBetebenner');
const CONFIG = path.resolve('catalog/repos.yml');
const OUT = path.resolve('catalog/generated/repos.yml');

const PRIVATE_CONFIG = path.resolve('catalog/repos.private.yml');

const config = yaml.load(fs.readFileSync(CONFIG, 'utf8'), { schema: yaml.CORE_SCHEMA });
// Private repos (hashed names among them) are listed in a gitignored overlay so their names never reach the public repo.
if (fs.existsSync(PRIVATE_CONFIG)) {
  const extra = yaml.load(fs.readFileSync(PRIVATE_CONFIG, 'utf8'), { schema: yaml.CORE_SCHEMA }) || {};
  for (const key of ['talks', 'sites', 'packages', 'experiments', 'exclude']) {
    if (extra[key]?.length) config[key] = [...(config[key] || []), ...extra[key]];
  }
}

function gh(args) {
  try {
    return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
}

const allRepos = gh(['repo', 'list', OWNER, '--limit', '400', '--json', 'name']) || [];
const repoCache = new Map();
function repoInfo(name) {
  if (repoCache.has(name)) return repoCache.get(name);
  const r = gh(['api', `repos/${OWNER}/${name}`]);
  let pages = null;
  if (r?.has_pages) pages = gh(['api', `repos/${OWNER}/${name}/pages`])?.html_url || null;
  const local = [path.join(LOCAL, name, 'master'), path.join(LOCAL, name)].find((p) => fs.existsSync(path.join(p, '.git'))) || null;
  const info = r
    ? {
        full_name: r.full_name,
        private: r.private,
        pushed: r.pushed_at?.slice(0, 10),
        description: r.description || '',
        repo_url: r.html_url,
        pages_url: pages,
        local_path: local,
      }
    : { missing: true, local_path: local };
  repoCache.set(name, info);
  return info;
}

async function status(url) {
  if (!url) return null;
  try {
    const res = await fetch(url.replace(/#.*$/, ''), { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000) });
    return res.status;
  } catch {
    return 0;
  }
}

const joinUrl = (base, rel) => (rel ? new URL(rel, base.endsWith('/') ? base : `${base}/`).toString() : base);

const talks = [];
for (const t of config.talks || []) {
  const name = t.repo_name || t.repo;
  const info = repoInfo(name);
  const base = info.pages_url;
  const decks = (t.decks || [{ label: null, path: t.deck_path }]).map((d) => ({
    label: d.label,
    url: t.deck_url && !t.decks ? t.deck_url : base ? joinUrl(base, d.path) : null,
  }));
  for (const d of decks) d.http = await status(d.url);
  const live = decks.some((d) => d.http === 200);
  // No live deck but a public repo: link the repo's materials instead.
  const delivery = live ? 'link' : info.repo_url && !info.private ? 'repo' : 'none';
  const shown = live ? decks : delivery === 'repo' ? [{ label: 'Materials on GitHub', url: info.repo_url, http: 200 }] : decks;
  const publish = t.publish !== false && !info.private && delivery !== 'none';
  talks.push({
    id: `repo-${slugify(name)}`,
    slug: slugify(`${t.date}-${t.title}`).slice(0, 90).replace(/-+$/, ''),
    ...t,
    year: Number(String(t.date).slice(0, 4)),
    date: String(t.date),
    date_precision: t.date_precision || 'day',
    delivery,
    github: info,
    decks: shown,
    publish,
    ...(publish ? {} : { hold_reason: t.hold_reason || (info.private ? 'private repository' : 'deck URL does not resolve') }),
  });
}
// Disambiguate slugs within the repo catalog (series share titles and sometimes dates).
const seen = new Map();
for (const t of talks) {
  const n = seen.get(t.slug) || 0;
  seen.set(t.slug, n + 1);
  if (n) t.slug = `${t.slug}-${n + 1}`;
}

const sites = [];
for (const s of config.sites || []) {
  const info = repoInfo(s.repo);
  const url = info.pages_url;
  sites.push({ ...s, date: String(s.date), github: info, url, http: await status(url) });
}

const packages = [];
for (const p of config.packages || []) {
  const info = repoInfo(p.repo);
  // A curated `url` (the package's canonical site, e.g. the CenterForAssessment Pages site) wins over this fork's Pages URL.
  const url = p.url || info.pages_url || info.repo_url;
  packages.push({ ...p, github: info, url, http: await status(p.url || info.pages_url) });
}

const experiments = [];
for (const e of config.experiments || []) {
  const names = e.repo_prefix ? allRepos.map((r) => r.name).filter((n) => n.startsWith(e.repo_prefix)).sort() : e.repos;
  const items = [];
  for (const n of names) {
    const info = repoInfo(n);
    items.push({ repo: n, description: info.description, url: info.pages_url, http: await status(info.pages_url) });
  }
  experiments.push({ title: e.title, summary: e.summary, date: String(e.date), items });
}

// Repos with Pages that the curated config does not mention — surfaced so nothing is silently missed.
const mentioned = new Set([
  ...(config.talks || []).map((t) => t.repo_name || t.repo),
  ...(config.sites || []).map((s) => s.repo),
  ...(config.packages || []).map((p) => p.repo),
  ...(config.exclude || []).map((x) => x.repo),
  ...experiments.flatMap((e) => e.items.map((i) => i.repo)),
  'dbetebenner.github.io',
]);
const unclassified = [];
for (const { name } of allRepos) {
  if (mentioned.has(name)) continue;
  const info = repoInfo(name);
  if (info.pages_url) unclassified.push({ repo: name, pages_url: info.pages_url, description: info.description });
}

const summary = {
  generated: new Date().toISOString(),
  talks: talks.length,
  talks_published: talks.filter((t) => t.publish).length,
  talks_held: talks.filter((t) => !t.publish).map((t) => `${t.repo}: ${t.hold_reason}`),
  sites: sites.length,
  packages: packages.length,
  experiments: experiments.reduce((n, e) => n + e.items.length, 0),
  unclassified_pages_repos: unclassified.map((u) => u.repo),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  `# Generated by tools/inventory/scan-repos.mjs from catalog/repos.yml — do not edit\n${yaml.dump(
    { summary, series: config.series, talks, sites, packages, experiments, unclassified },
    { lineWidth: 140, noRefs: true },
  )}`,
);
console.log(yaml.dump(summary));
