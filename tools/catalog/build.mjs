#!/usr/bin/env node
// Merge the generated scans with human overrides into catalog/talks.yml — the single source of truth
// for every listing, landing page, and conversion job.
//
// Inputs:  catalog/generated/legacy.yml   (scan-legacy.mjs)
//          catalog/generated/repos.yml    (scan-repos.mjs)
//          catalog/generated/converted.yml (tools/convert, optional)
//          catalog/shards.yml, catalog/overrides.yml
// Output:  catalog/talks.yml (published only), catalog/generated/catalog.full.yml

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const read = (p, dflt = {}) => (fs.existsSync(p) ? yaml.load(fs.readFileSync(p, 'utf8'), { schema: yaml.CORE_SCHEMA }) || dflt : dflt);

const legacy = read('catalog/generated/legacy.yml').talks || [];
const repos = read('catalog/generated/repos.yml');
const converted = read('catalog/generated/converted.yml').decks || {};
const shards = read('catalog/shards.yml');
const overrides = read('catalog/overrides.yml').talks || {};

const shardFor = (year) => shards.shards.find((s) => year >= s.from && year <= s.to);

const talks = [];

// Repo talks that stand in for a legacy folder: a live repo deck replaces the conversion;
// a repo without a deck attaches its materials link to the converted legacy deck instead.
const replaced = new Map();
for (const r of repos.talks || []) if (r.replaces_legacy) replaced.set(r.replaces_legacy, r);

for (const t of legacy) {
  const owner = [...replaced.entries()].find(([folder]) => t.source.primary.startsWith(`${folder}/`));
  const entry = { ...t };
  if (owner) {
    const [, r] = owner;
    if (r.delivery === 'link') {
      entry.publish = false;
      entry.hold_reason = `superseded by live deck in ${r.repo}`;
      entry.superseded_by = r.id;
    } else {
      entry.related_repo = r.github?.repo_url;
    }
  }
  const shard = shardFor(entry.year);
  entry.shard = shard.repo;
  entry.deck_url = `${shards.pages_base}/${shard.repo}/${entry.slug}/`;
  entry.originals_url = `https://github.com/${shards.owner}/${shard.repo}/releases/tag/${shards.release_tag}`;
  const conv = converted[entry.id];
  if (conv) Object.assign(entry, { converted: conv, slides: conv.slides ?? entry.slides });
  talks.push(entry);
}

for (const r of repos.talks || []) {
  if (r.replaces_legacy && r.delivery !== 'link') continue; // folded into the legacy entry above
  talks.push({
    ...r,
    deck_url: r.decks?.[0]?.url || null,
  });
}

// Apply overrides by id or slug.
const index = new Map();
for (const t of talks) {
  index.set(t.id, t);
  index.set(t.slug, t);
}
const unknown = [];
for (const [key, patch] of Object.entries(overrides)) {
  const t = index.get(key);
  if (!t) { unknown.push(key); continue; }
  Object.assign(t, patch);
  if (patch.publish === true) delete t.hold_reason;
}

// Series: collect members so landing pages can cross-link.
for (const t of talks) {
  if (!t.series) continue;
  t.series_members = talks.filter((o) => o.series === t.series && o.id !== t.id).map((o) => o.id);
}

talks.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

const published = talks.filter((t) => t.publish);
const summary = {
  generated: new Date().toISOString(),
  talks: talks.length,
  published: published.length,
  held: talks.length - published.length,
  by_delivery: published.reduce((acc, t) => ((acc[t.delivery] = (acc[t.delivery] || 0) + 1), acc), {}),
  converted: published.filter((t) => t.delivery === 'convert' && t.converted?.status === 'ok').length,
  signature: talks.filter((t) => t.signature).map((t) => t.id),
  ...(unknown.length ? { unknown_override_keys: unknown } : {}),
};

const rest = {
  series: repos.series || {},
  sites: repos.sites || [],
  packages: repos.packages || [],
  experiments: repos.experiments || [],
};
const dump = (o) => yaml.dump(o, { lineWidth: 140, noRefs: true });

// The full catalog (held talks, absolute paths) stays local; the committed catalog is public.
fs.writeFileSync('catalog/generated/catalog.full.yml', dump({ summary, talks, ...rest }));

const strip = ({ hold_reason, superseded_by, duplicate_of, local_path, ...t }) => {
  if (t.source) {
    const { root, ...source } = t.source;
    t.source = source;
  }
  if (t.github) {
    const { local_path: _, ...github } = t.github;
    t.github = github;
  }
  if (t.items) t.items = t.items.map(strip);
  return t;
};
const publicSummary = { ...summary };
delete publicSummary.held;
delete publicSummary.talks;
fs.writeFileSync(
  'catalog/talks.yml',
  `# Built by tools/catalog/build.mjs — edit catalog/overrides.yml or catalog/repos.yml, not this file\n${dump({
    summary: publicSummary,
    ...rest,
    sites: rest.sites.map(strip),
    packages: rest.packages.map(strip),
    experiments: rest.experiments.map(strip),
    talks: published.map(strip),
  })}`,
);
console.log(dump(summary));
