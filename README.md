# dbetebenner.github.io

Source for <https://dbetebenner.github.io>: Damian Betebenner's talks (2005–2026) and selected papers, styled with the [dataimago](https://github.com/dataimago) design tokens.

## What lives where

| Content | Source | Served from |
|---|---|---|
| Hub pages (home, talks, papers, code, archive, about) | this repo, Quarto website | `dbetebenner.github.io` |
| Native rebuilds of eight signature talks | `decks/<slug>/index.qmd` | `/decks/<slug>/` |
| Image-based copies of 383 older decks | [`talks-archive-2005-2009`](https://github.com/dbetebenner/talks-archive-2005-2009), [`-2010-2014`](https://github.com/dbetebenner/talks-archive-2010-2014), [`-2015-2019`](https://github.com/dbetebenner/talks-archive-2015-2019), [`-2020-2026`](https://github.com/dbetebenner/talks-archive-2020-2026) | each repo's own Pages site |
| Original slide files (PDF, PowerPoint, Keynote, LaTeX) | `originals` release of each archive repo | GitHub release downloads |
| Recent Quarto decks | their own repos | their own Pages sites, linked from the talk pages |
| Papers | `papers/<slug>/<slug>.pdf`, metadata in `catalog/papers.yml` | `/papers/<slug>/` |

The archive is split by year range so that no Pages site approaches GitHub's 1 GB limit (`catalog/shards.yml`).

## The catalog

`catalog/talks.yml` lists every published talk and is generated: do not edit it by hand. It is built from

- `tools/inventory/scan-legacy.mjs` — the presentations folder (titles, dates, formats, hashes),
- `tools/inventory/scan-repos.mjs` — the deck repos listed in `catalog/repos.yml`,
- `catalog/overrides.yml` — hand corrections: titles, dates, co-authors, publish/hold decisions, signature talks.

Private repos are listed in `catalog/repos.private.yml`, which is gitignored so their names never reach this public repo. The full catalog, including held talks, is written to `catalog/generated/` (also gitignored).

A talk's slug freezes once its deck is converted, so corrections to its date or title change the page but not the URL.

## Building

```sh
pnpm install
pnpm inventory          # rescan sources and rebuild catalog/talks.yml (needs gh and the local source folders)
pnpm site:render        # generate talk and paper pages from the catalog, then quarto render
pnpm site:preview
```

`pnpm design:check` verifies that the vendored dataimago theme in `_extensions/dbetebenner/dataimago/` matches the pinned `@dataimago/css` release.

Talks whose deck lives at its own address (a repo's Pages site) get their card image from `public/thumbs/<slug>.webp`. `node tools/site/thumbs.mjs` screenshots the title slide of each such deck that has no thumbnail yet; `--force` retakes them all and `--only <slug>` retakes one. Converted archive decks use their first slide image instead.

### Legacy decks

```sh
node tools/convert/export.mjs                     # a PDF per deck: Keynote/PowerPoint via Keynote (macOS), beamer via latexmk
node tools/convert/build-decks.mjs --shard talks-archive-2010-2014 --dir ../talks-archive-2010-2014
tools/shards/publish.sh talks-archive-2010-2014   # check assets, render, push, upload originals
```

`build-decks.mjs` is idempotent by source hash. `--retext` rewrites the deck pages and slide text without re-rasterising; `--force` rebuilds everything. `tools/shards/scaffold.mjs` writes the fixed files of an archive checkout (Quarto project, redirect, README, Pages workflow, deck extension).

### Signature rebuilds

`tools/convert/beamer-to-quarto.mjs` and `tools/convert/pptx-to-quarto.mjs` produce a first draft in `decks/<slug>/`, which is then finished by hand. A talk page embeds the native deck whenever `decks/<slug>/index.qmd` exists and links the image copy of the original slides beside it.

## Deck theme

All decks use the `deck` Quarto extension from [NCIEA_Presentation_Template](https://github.com/dbetebenner/NCIEA_Presentation_Template) (format `deck-revealjs`), vendored here in `_extensions/deck/` and in each archive repo. Update it there first, then copy it into this repo and the four archive repos.

## Checks

The `Publish site` workflow (`.github/workflows/publish.yml`) runs on every push and pull request and blocks deployment if a check fails:

- `pnpm design:check` — theme drift against the pinned design-system release;
- `tools/qa/size-budget.mjs` — total site size and per-page weight;
- lychee — internal links on every run; external links on the weekly schedule and on manual runs;
- `tools/qa/axe.mjs` — axe-core WCAG 2.1 A/AA checks in light and dark on representative pages.

Pushes to `master` deploy to Pages.

## Review notes

`review/2026-decks.md` audits the 2026 Quarto decks (theme drift, fonts, contrast, alt text, links). `review/private/` is gitignored.
