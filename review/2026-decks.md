# 2026 deck audit

Read-only audit of the 2026 Quarto/RevealJS decks published under `dbetebenner.github.io`, run 2026-10-30. Nothing in any deck repo was changed.

**Method.** Published HTML was fetched with curl. Theme sources were diffed against `NCIEA_Presentation_Template/master/styles/presentation-theme.scss` (the baseline, 588 lines). Contrast uses the WCAG 2.x relative-luminance formula. Links were checked with `curl -sIL`, falling back to GET, with a 15 s timeout. axe-core 4.14 (`@axe-core/cli`) ran against each published URL. The cached ChromeDriver (152) did not match Chrome 156, so a matching ChromeDriver was fetched into `/tmp`.

**axe caveat.** Reveal.js hides every slide except the current one, so axe only sees the title slide and the deck chrome. Interior slides (figures, links, callouts) are covered by the static checks below, not by axe.

## Summary

| Deck | Theme variant (diff lines vs baseline) | CDN fonts | Link contrast on #EDEDEB | Alt text (rendered imgs with alt / total) | axe (rules / nodes) | Broken links | Fixes |
|---|---|---|---|---|---|---|---|
| WIDA_IN_Standard_Setting_Impact_Analysis | NH-WIDA `.deck-qr` (104) | Google `@import`, inlined; Noto Sans missing | #3498DB 2.69 ✗ | 0 / 15 | 4 / 4 | 0 / 0 | 7 |
| DoWEA_Presentation_102626 | DoWEA local-fonts (317) | none (vendored woff2) | #3498DB 2.69 ✗ | 18 / 19 | 4 / 4 | 0 / 1 | 7 |
| New_Hampshire_101926_Presentation | NH-WIDA `.deck-qr` (104) | Google, inlined; Noto Sans missing | #3498DB 2.69 ✗ | 23 / 35 | 4 / 4 | 0 / 4 | 8 |
| AIME_2026_Panel_Presentation, moderator deck | AIME tokens split (Paper_1-era theme, 112, plus `deck.scss`/`tokens.scss`) | Google, inlined; Noto Sans missing | #1F6FA8 4.60 ✓ (`.accent` still #3498DB ✗) | 4 / 4 | 2 / 2 | 0 / 3 | 8 (shared with provocation) |
| AIME_2026_Panel_Presentation, provocation deck | same | same | same | no images | 4 / 4 | 0 / 0 | (above) |
| AIME_2026_AI_Native_Dissertation_Training_Session | own tokens (`slides.scss`, independent of baseline) | **Google `@import` at runtime** (not embedded) | #434739 on #FEFDFB 9.39 ✓ | 2 / 2 | 3 / 3 | 0 / 4 | 5 |
| Rhode_Island_082726_Presentation | RI `.gof-grid` (76) | Google, inlined; Noto Sans missing | #3498DB 2.69 ✗ | 26 / 35 | 4 / 4 | 0 / 2 | 7 |
| IEA_TIMSS_Copula_Overview_081126 | Paper_1-era (112) | Google, inlined; Noto Sans missing | #3498DB 2.69 ✗ | 0 / 8 | 4 / 4 | 0 / 0 | 8 |
| NCIEA_2026_Retreat | baseline (0) | Google, inlined; Noto Sans missing | #3498DB 2.69 ✗ | 5 / 5 | 4 / 4 | 0 / 1 | 6 |
| Renaissance_TX_Project | older own fork (916) | Google, inlined; Noto Sans missing | #1f7a8c 4.24 ✗ | no images | 4 / 4 | 0 / 0 | 7 |
| Illinois_TAC_Meeting_052126 | Paper_1-era (112) | Google, inlined; Noto Sans missing | #3498DB 2.69 ✗ | no images | 4 / 4 | 0 / 0 | 7 |
| Betebenner_Braun_Discussion_051426 | Paper_1-era (112) | Google, inlined; Noto Sans missing | #3498DB 2.69 ✗ | 7 / 7 | 4 / 4 | 0 / 0 | 6 |
| NCIEA_2026_Colloquium | Paper_1-era (112) | Google, inlined; Noto Sans missing | #3498DB 2.69 ✗ | 19 / 19 | 4 / 4 | **2 / 2** | 7 |
| NCIEA_2026_Board_Meeting | Paper_1-era (112) | Google, inlined; Noto Sans missing | #3498DB 2.69 ✗ | 0 / 19 | 4 / 4 | **2 / 2** | 8 |
| NCME_2026_LIwLD | Paper_1-era (112) | Google, inlined; Noto Sans missing | #3498DB 2.69 ✗ | 0 / 19 | 4 / 4 | 0 / 1 | 8 |
| Michigan_TAC_042326 (site) | site theme `_tac-core.scss` (independent) | **Google `<link>` at runtime, all 102 pages** | #434739 8.15 vs page ✓; 1.05 vs body text ✗ | no images | 2 / 9 | 0 / 123 | 6 |

"Broken links" means non-2xx/3xx results over unique URLs found in the rendered anchors plus URLs printed in the source or encoded in QR codes.

## Cross-cutting findings

These recur in nearly every deck. Each deck section refers to them by code (F1–F5).

- **F1. The Noto Sans body face is never delivered.** The theme imports `family=Noto+Sans:wdth,wght@100..125,300..800`, but Noto Sans's width axis stops at 100. Google returns HTTP 400 for that family alone. Inside the combined request it returns 200 and silently drops Noto Sans, keeping only Josefin Sans and Noto Sans Mono. Every `embed-resources` deck in the Google lineage therefore embeds Josefin and Noto Sans Mono but has **no Noto Sans `@font-face`**, and body text renders in `system-ui`. The `embed-resources` setting itself holds: those decks make zero external asset requests at runtime. DoWEA (vendored fonts) is the only deck that renders the intended body face.
- **F2. The link and accent color fails AA.** #3498DB on #EDEDEB is 2.69:1 (hover #2980B9 is 3.67:1). The same color drives `.accent`, `.stat-number`, and `.key-insight strong` (2.49:1 on its tint). The AIME panel's `$di-primary-ink` #1F6FA8 reaches 4.60:1 and is the ready-made replacement.
- **F3. Secondary text fails AA.** `--color-secondary` #7c7c7c is 3.56:1. It colors the slide number (axe `color-contrast` in every Google-lineage deck), figcaptions, `.stat-label`, and `.conference-badge`. Inline fallbacks such as `var(--color-secondary, #5c5c58)` never apply, because the variable is always defined. #6b6b66 (4.57:1, the AIME token) fixes it. Other failing callout text: `.theorem-box-title` #a34e00 is 3.90:1 on its tint (#8a4500 gives 6.11:1) and `.accent-pink` #ff69b4 is 2.26:1.
- **F4. axe flags the same reveal chrome everywhere.** The menu button `<a href="#"><i class="fas fa-bars">` has no accessible name (`link-name`). The viewport meta sets `user-scalable=no, maximum-scale=1.0` (`meta-viewport`). `.active-menu-panel` is a scrollable region with no focusable content (`scrollable-region-focusable`). These are Quarto revealjs template defaults, so one script or filter fixes them for every deck.
- **F5. No description or social metadata.** No deck emits `<meta name="description">`, Open Graph, or Twitter card tags. Every deck has a `<title>`. Michigan emits only `og:title` and `og:site_name`.
- **README backlink.** No README links to the hub (`https://dbetebenner.github.io/`).
- **Slide numbers and PDF export.** Slide numbers are on in every deck. Every reveal deck ships the pdf-export plugin (`?print-pdf` or the E key works), but only IEA and the AIME panel publish a slide PDF.
- **Extension state.** The `dataimago-deck-extension` branch of NCIEA_Presentation_Template contains only its initial commit, so every [extension] fix below assumes work that has not been built yet.

---

## WIDA_IN_Standard_Setting_Impact_Analysis

Published at <https://dbetebenner.github.io/WIDA_IN_Standard_Setting_Impact_Analysis/>. Deck date in front matter: 2026-11-01 (not yet presented).

1. **Theme:** NH-WIDA `.deck-qr` lineage, byte-identical to NH; 104-line diff (adds `.deck-qr` and `.gof-grid`). The deck adds inline header CSS (`.timeline`, `.callout-row`, `.rt-*`).
2. **CDN fonts:** Google `@import` in the theme; `embed-resources: true` holds (0 runtime requests). F1 applies: Noto Sans missing, and Noto Sans Math is neither loaded nor vendored.
3. **Contrast:** link #3498DB 2.69 ✗ (F2); secondary #7c7c7c 3.56 ✗ (F3). Deck colors pass: `.answer`/`.rt-new` #8E44AD 5.00, `.rt-up` 5.18, `.rt-down` 5.73. Chart background is #F6F6F5.
4. **Alt text:** 0 of 15 rendered figure images. The figures come from the R helper `gof_figure()` and no chunk sets `fig-alt`.
5. **Metadata:** `<title>` only (F5).
6. **QR:** none. The theme supports `.deck-qr`, but the deck does not use it.
7. **Slide numbers** on. **PDF:** none published.
8. **Links:** no external anchors.
9. **axe:** `color-contrast` 1 (slide number), `link-name` 1, `meta-viewport` 1, `scrollable-region-focusable` 1.
10. **README hub link:** no.
11. **Reproducibility:** source, `render.sh`, `Makefile`, and `R/` are in the repo. Fonts are not vendored; no `_extensions`. Pages serves `main:/docs`.

**Proposed fixes**
1. [extension] Vendor Josefin Sans, Noto Sans, Noto Sans Mono, and Noto Sans Math as woff2 and drop the Google `@import` (F1).
2. [extension] Links and accents to #1F6FA8 (F2).
3. [extension] `--color-secondary` to #6b6b66 (F3).
4. [extension] Reveal chrome a11y script: menu-button `aria-label`, viewport without `user-scalable=no`, focusable menu panel (F4).
5. [extension] `description` plus `og:*`/`twitter:card` from front matter (F5).
6. [deck] Add an `alt` argument to `gof_figure()` and pass `fig-alt` for all 15 figures.
7. [deck] README: add a hub backlink.

## DoWEA_Presentation_102626

Published at <https://dbetebenner.github.io/DoWEA_Presentation_102626/DoWEA_Presentation_Betebenner_102626.html>. `render.sh` copies `docs/index.html` to this offline name, so both URLs serve the same deck.

1. **Theme:** DoWEA local-fonts lineage; 317-line diff (Google `@import` replaced by `styles/fonts.css`, larger callout text, `.gof-grid`, SVG chart styles).
2. **CDN fonts:** none. The woff2 files are vendored and subset by `tools/subset_fonts.py`, and are embedded (8 `@font-face`, all data URIs). The intended Noto Sans is present. Noto Sans Math is not included.
3. **Contrast:** link 2.69 ✗ (F2); secondary 3.56 ✗ (F3). The `#2e86c1` used in the d3 animations is 3.38 ✗. In the R charts (`R/00_helpers.R`), subtitle, caption, and axis-title text use GREY #7c7c7c (3.56 ✗), and BLUE #3498DB marks text as well.
4. **Alt text:** 18 of 19 rendered images; 18 of 18 markdown images in the source have `fig-alt`. The one without alt is not a markdown image (likely d3 or JS-inserted).
5. **Metadata:** `<title>` only (F5).
6. **QR:** `assets/img/qr_code.png` (alt present) encodes `https://dbetebenner.github.io/DoWEA_Presentation_102626/` → 200.
7. **Slide numbers** on. **PDF:** none.
8. **Links:** 1 unique, 0 broken.
9. **axe:** same 4 rules / 4 nodes as F3 and F4.
10. **README hub link:** no.
11. **Reproducibility:** source, `render.sh`, `Makefile`, `R/`, vendored fonts and d3 are all in the repo. No `_extensions`.

**Proposed fixes**
1. [extension] Adopt this deck's `fonts.css` pattern as the extension's font layer, adding Noto Sans Math (F1).
2. [extension] Links and accents to #1F6FA8 (F2).
3. [extension] `--color-secondary` to #6b6b66 (F3).
4. [extension] Reveal chrome a11y script (F4).
5. [extension] Description and social meta (F5).
6. [deck] Chart text: GREY #7c7c7c to #6b6b66 in `theme_deck()`, and the d3 `#2e86c1` text to #1F6FA8.
7. [deck] README hub backlink.

## New_Hampshire_101926_Presentation

Published at <https://dbetebenner.github.io/New_Hampshire_101926_Presentation/>.

1. **Theme:** NH-WIDA `.deck-qr` (104). Inline header CSS for `.notation-key` and `.tac-tag`.
2. **CDN fonts:** Google, inlined; `embed-resources` holds. F1 applies (no Noto Sans, no Noto Sans Math).
3. **Contrast:** link 2.69 ✗; secondary 3.56 ✗. `.notation-key` resolves to #7c7c7c, not its #5c5c58 fallback (3.56 ✗). `.tac-tag` #7a5c33 is 5.26 ✓.
4. **Alt text:** 23 of 35 rendered images; 12 `gof_figure` images have none.
5. **Metadata:** `<title>` only.
6. **QR:** a `.deck-qr` title-slide QR (alt present) targets `https://dbetebenner.github.io/New_Hampshire_101926_Presentation/` → 200.
7. **Slide numbers** on. **PDF:** `assets/exported_pdf/New Hampshire 2026 SGP Results.pdf` exists in the repo but is outside `docs/`, so it returns 404 on Pages.
8. **Links:** 4 unique (the deck URL and 3 CenterForAssessment repos), all 200.
9. **axe:** 4 rules / 4 nodes (F3, F4).
10. **README hub link:** no.
11. **Reproducibility:** source, `render.sh`, `Makefile`, `R/` in the repo; fonts not vendored.

**Proposed fixes**
1. [extension] Vendored fonts (F1).
2. [extension] #1F6FA8 accent (F2).
3. [extension] #6b6b66 secondary (F3).
4. [extension] Reveal chrome a11y (F4).
5. [extension] Description and social meta (F5).
6. [deck] Add `fig-alt` for the 12 alt-less figures.
7. [deck] Copy the exported PDF into `docs/` (rename without spaces) and link it from the closing slide or README.
8. [deck] README hub backlink.

## AIME_2026_Panel_Presentation

Published at <https://dbetebenner.github.io/AIME_2026_Panel_Presentation/decks/moderator.html> and `.../decks/betebenner-provocation.html`. Both decks belong to a Quarto website project with `output-dir: docs`.

1. **Theme:** AIME tokens split. The base `theme/presentation-theme.scss` is the Paper_1-era file (112-line diff), layered with `deck.scss` and `tokens.scss`. Compiled output: `--r-link-color` #1F6FA8 and background #EDEDEB, but `--color-primary` is still #3498DB.
2. **CDN fonts:** Google `@import` in `presentation-theme.scss`, inlined (`embed-resources: true` on both decks). F1 applies.
3. **Contrast:** link #1F6FA8 4.60 ✓ and `$di-content-secondary` #6b6b66 4.57 ✓. Failures:
   - `.accent` and `.stat-number` still #3498DB (2.69).
   - The slide number still uses `--color-secondary` #7c7c7c (axe-flagged in the provocation deck).
   - `.prod` #C0702A is 3.20.
   - White text on the `.chip` amber #B9770E is 3.68 and on yellow #9A7D0A is 3.95, both ✗. Green 4.72 and red 6.02 pass.
4. **Alt text:** moderator 4 of 4 (QR images have descriptive alt); provocation has no images.
5. **Metadata:** `<title>` is the site title plus the page title, so the moderator deck's title repeats itself: "Educational Measurement as an AI-Native Profession – Educational Measurement as an AI-Native Profession — moderator". No description or OG.
6. **QR:** generated in `moderator.qmd` with `qrcode`. The site URL → 200; the sesh-ai audience URL → 200.
7. **Slide numbers** on. **PDF:** `rendered/moderator-slides.pdf` and `rendered/betebenner-provocation-slides.pdf` → 200, linked from the site index but not from the decks.
8. **Links:** 3 unique, 0 broken.
9. **axe:** moderator has `link-name` 1 and `meta-viewport` 1. Provocation has those plus `color-contrast` 1 and `scrollable-region-focusable` 1.
10. **README hub link:** no.
11. **Reproducibility:** full source in the repo (`_quarto.yml`, decks, theme, corpus). Fonts not vendored. The moderator deck reads `data/` CSVs at render time (not inspected).

**Proposed fixes**
1. [extension] Vendored fonts (F1).
2. [extension] Set `--color-primary` to the ink token so `.accent` and `.stat-number` match the link color (F2).
3. [extension] Slide number and secondary to #6b6b66 (F3).
4. [extension] Reveal chrome a11y (F4).
5. [extension] Description and social meta (F5).
6. [deck] `.chip.amber` to #8a5a0a (5.92) and `.chip.yellow` to #7d6608 (5.56); `.prod` text to #a14f12 (4.92) where it colors text rather than chart marks.
7. [deck] `pagetitle: "Moderator"` / `"Provocation"` so `<title>` doesn't repeat the site title. Add a link to the slide PDFs on each deck's closing slide.
8. [deck] README hub backlink.

## AIME_2026_AI_Native_Dissertation_Training_Session

Published at <https://dbetebenner.github.io/AIME_2026_AI_Native_Dissertation_Training_Session/slides.html>.

1. **Theme:** independent token theme (`assets/slides.scss` plus `assets/dataimago.scss`: paper #FEFDFB, ink, forest-700 links, Noto Sans headings). It is not a lineage of the baseline (714-line diff).
2. **CDN fonts:** `@import url(fonts.googleapis.com/…Noto+Sans:wght@400;600;700…)` in the compiled theme CSS **loads at runtime**. No `embed-resources`, because `chalkboard: true` requires multi-file output. The deck loads about 30 `site_libs/` assets, which is expected.
3. **Contrast:** link #434739 on #FEFDFB 9.39 ✓; copper-700 7.17 ✓.
4. **Alt text:** 2 of 2.
5. **Metadata:** `<title>` only. The `website.description` is not emitted on the revealjs page.
6. **QR:** none.
7. **Slide numbers** on (`c/t`). **PDF:** no slide PDF; `handout.pdf` → 200.
8. **Links:** 4 unique (dissertation-ai, GitHub, the GitHub App install, intheweights), all 2xx/3xx.
9. **axe:** `link-name` 1, `meta-viewport` 1, `scrollable-region-focusable` 1. No contrast failure.
10. **README hub link:** no.
11. **Reproducibility:** full source; `_quarto.yml` website; GitHub Actions `publish.yml` (Pages build type: workflow). Fonts not vendored.

**Proposed fixes**
1. [extension] Vendor Noto Sans and Noto Sans Mono as site resources and drop the runtime Google `@import` (no third-party request when the page loads).
2. [extension] Reveal chrome a11y (F4).
3. [extension] Description and social meta (F5).
4. [deck] Publish a slide PDF via `?print-pdf` and link it from the overview page.
5. [deck] README hub backlink.

## Rhode_Island_082726_Presentation

Published at <https://dbetebenner.github.io/Rhode_Island_082726_Presentation/>.

1. **Theme:** RI `.gof-grid` (76-line diff).
2. **CDN fonts:** Google, inlined. F1 applies. Noto Sans Math is vendored and embedded.
3. **Contrast:** link 2.69 ✗, secondary 3.56 ✗ (`.notation-key` resolves to #7c7c7c); `.tac-tag` 5.26 ✓.
4. **Alt text:** 26 of 35 rendered images.
5. **Metadata:** `<title>` only.
6. **QR:** none.
7. **Slide numbers** on. **PDF:** none.
8. **Links:** 2 unique, both 200.
9. **axe:** 4 rules / 4 nodes (F3, F4).
10. **README hub link:** no.
11. **Reproducibility:** source, `render.sh`, `Makefile`, `R/`, the PSTricks figure chain, and the vendored math font are all in the repo.

**Proposed fixes**
1. [extension] Vendored fonts (F1).
2. [extension] #1F6FA8 accent (F2).
3. [extension] #6b6b66 secondary (F3).
4. [extension] Reveal chrome a11y (F4).
5. [extension] Description and social meta (F5).
6. [deck] `fig-alt` for the 9 alt-less figures.
7. [deck] README hub backlink.

## IEA_TIMSS_Copula_Overview_081126

Published at <https://dbetebenner.github.io/IEA_TIMSS_Copula_Overview_081126/> (Pages serves `main:/`). This is a publish-only repo.

1. **Theme:** Paper_1-era (`Paper_1/styles/presentation-theme.scss`, 112-line diff).
2. **CDN fonts:** Google, inlined. F1 applies (no Noto Sans; no Noto Sans Math).
3. **Contrast:** link 2.69 ✗, secondary 3.56 ✗.
4. **Alt text:** 0 of 8 rendered images.
5. **Metadata:** `<title>` only.
6. **QR:** none.
7. **Slide numbers** on. **PDF:** `IEA_Presentation_Braun_Betebenner_081826.pdf` → 200, but nothing links to it.
8. **Links:** none.
9. **axe:** 4 rules / 4 nodes.
10. **README hub link:** no.
11. **Reproducibility:** the source is not in the repo. **Source drift:** the README names `IEA_TIMSS_Copula_Overview.qmd` (Paper_1, dated 2026-08-11). The published `<title>` ("Methodological Advances…") and date (18 Aug 2026) instead match `Paper_1/TIMSS_Braun_Betebenner_Draft_Final.qmd`, identified by title string only; that file was not read. No render script covers it: Paper_1's `_quarto.yml` is a manuscript project that does not list the deck files, and `render.sh` does not reference them.

**Proposed fixes**
1. [deck] Correct the README source path to the file that actually produced the published deck, and record the render command and Paper_1 commit.
2. [deck] Link the PDF from the README.
3. [deck] Add `fig-alt` to the 8 figures in the true source.
4. [extension] Vendored fonts (F1). Applies only if the deck is re-rendered.
5. [extension] #1F6FA8 accent (F2).
6. [extension] #6b6b66 secondary (F3).
7. [extension] Reveal chrome a11y (F4) and social meta (F5).
8. [deck] README hub backlink.

## NCIEA_2026_Retreat

Published at <https://dbetebenner.github.io/NCIEA_2026_Retreat/ai_workflows.html> (Pages serves `main:/`).

1. **Theme:** baseline (0-line diff).
2. **CDN fonts:** Google, inlined. F1 applies; Noto Sans Math is vendored and embedded.
3. **Contrast:** link 2.69 ✗, secondary 3.56 ✗.
4. **Alt text:** 5 of 5.
5. **Metadata:** `<title>` only.
6. **QR:** none.
7. **Slide numbers** on. **PDF:** none.
8. **Links:** 1 unique (the GitHub source), 200.
9. **axe:** 4 rules / 4 nodes.
10. **README hub link:** no.
11. **Reproducibility:** `ai_workflows.qmd` is in the repo root alongside the rendered HTML. There is no `_quarto.yml` or render script; the math font is vendored.

**Proposed fixes**
1. [extension] Vendored fonts (F1).
2. [extension] #1F6FA8 accent (F2).
3. [extension] #6b6b66 secondary (F3).
4. [extension] Reveal chrome a11y (F4).
5. [extension] Description and social meta (F5).
6. [deck] README hub backlink, plus a one-line render command.

## Renaissance_TX_Project

Published at <https://dbetebenner.github.io/Renaissance_TX_Project/>.

1. **Theme:** older own fork (639 lines, 916-line diff; teal palette, no token comments).
2. **CDN fonts:** Google, inlined. F1 applies.
3. **Contrast:** link #1f7a8c 4.24 ✗ for normal text; `--color-secondary` #6f716d 4.21 ✗ (axe flags the slide number); `--color-accent` #c46a2f 3.29 ✗.
4. **Alt text:** no content images (text and tables only).
5. **Metadata:** `pagetitle` only; no title or author in the front matter, no description or OG.
6. **QR:** none.
7. **Slide numbers** on. **PDF:** none.
8. **Links:** none.
9. **axe:** 4 rules / 4 nodes.
10. **README hub link:** no (15-line README).
11. **Reproducibility:** `_quarto.yml` renders `docs/index.qmd`; the theme is in `docs/styles/`. Fonts not vendored.

**Proposed fixes**
1. [extension] Move onto the shared theme with a teal brand override, or keep the fork and apply 2–3.
2. [deck] Link to #155f6e (6.19); accent text to a ≥4.5 shade.
3. [deck] Secondary to #5f615d (5.34).
4. [extension] Vendored fonts (F1).
5. [extension] Reveal chrome a11y (F4).
6. [extension] Description and social meta (F5); add `title:` to the front matter.
7. [deck] README hub backlink.

## Illinois_TAC_Meeting_052126

Published at <https://dbetebenner.github.io/Illinois_TAC_Meeting_052126/>.

1. **Theme:** Paper_1-era (112-line diff).
2. **CDN fonts:** Google, inlined. F1 applies; the math font is vendored (`docs/assets/fonts/`) and embedded.
3. **Contrast:** link 2.69 ✗, secondary 3.56 ✗.
4. **Alt text:** no content images.
5. **Metadata:** `<title>` only.
6. **QR:** none.
7. **Slide numbers** on. **PDF:** none.
8. **Links:** none.
9. **axe:** 4 rules / 4 nodes.
10. **README hub link:** no (the README is 2 lines).
11. **Reproducibility:** `_quarto.yml` plus `docs/index.qmd` and `docs/styles/` are in the repo.

**Proposed fixes**
1. [extension] Vendored fonts (F1).
2. [extension] #1F6FA8 accent (F2).
3. [extension] #6b6b66 secondary (F3).
4. [extension] Reveal chrome a11y (F4).
5. [extension] Description and social meta (F5).
6. [deck] Expand the README: purpose, date, render command.
7. [deck] README hub backlink.

## Betebenner_Braun_Discussion_051426

Published at <https://dbetebenner.github.io/Betebenner_Braun_Discussion_051426/>. Publish-only repo; the source is `Paper_1/Betebenner_Braun_HB_Response_051426.qmd`.

1. **Theme:** Paper_1-era (112).
2. **CDN fonts:** Google, inlined. F1 applies; math font embedded.
3. **Contrast:** link 2.69 ✗, secondary 3.56 ✗.
4. **Alt text:** 7 of 7.
5. **Metadata:** `<title>` only.
6. **QR:** none.
7. **Slide numbers** on. **PDF:** none.
8. **Links:** none.
9. **axe:** 4 rules / 4 nodes.
10. **README hub link:** no.
11. **Reproducibility:** source only in Paper_1, which has no render script for the deck. The deck uses `include-in-header` for the math font and `presentation-figure-modal.js`.

**Proposed fixes**
1. [deck] Record the source path, render command, and Paper_1 commit in the README.
2. [extension] Vendored fonts (F1).
3. [extension] #1F6FA8 accent (F2).
4. [extension] #6b6b66 secondary (F3).
5. [extension] Reveal chrome a11y (F4) and social meta (F5).
6. [deck] README hub backlink.

## NCIEA_2026_Colloquium

Published at <https://dbetebenner.github.io/NCIEA_2026_Colloquium/>. Publish-only repo; the source is `Paper_1/NCIEA_2026_Colloquium_Staff_Presentation.qmd`.

1. **Theme:** Paper_1-era (112).
2. **CDN fonts:** Google, inlined. F1 applies; math font embedded. The README notes that the LIwLD interactive under `docs/assets/apps` is the one non-embedded asset. No non-data `src`/`data-src` was found in the rendered deck.
3. **Contrast:** link 2.69 ✗, secondary 3.56 ✗.
4. **Alt text:** 19 of 19.
5. **Metadata:** `<title>` only.
6. **QR:** the QR encodes `https://dbetebenner.github.io/NCIEA_2026_Colloquium/docs/assets/In_Order_We_Trust.pdf` → **404**. Pages serves `/docs` as the site root, so `/docs/` must not appear in the URL. `…/NCIEA_2026_Colloquium/assets/In_Order_We_Trust.pdf` → 200.
7. **Slide numbers** on. **PDF:** the paper PDF exists at the corrected path.
8. **Links:** the clickable link targets `https://dbetebenner.github.io/NCME_2026_LIwLD/docs/assets/In_Order_We_Trust.pdf` → **404**; without `/docs` → 200. 2 of 2 broken.
9. **axe:** 4 rules / 4 nodes.
10. **README hub link:** no.
11. **Reproducibility:** source only in Paper_1; no render script.

**Proposed fixes**
1. [deck] QR and link: drop `/docs` from both URLs, re-generate the QR, and point both at the same target.
2. [deck] Record the source path, render command, and Paper_1 commit in the README.
3. [extension] Vendored fonts (F1).
4. [extension] #1F6FA8 accent (F2).
5. [extension] #6b6b66 secondary (F3).
6. [extension] Reveal chrome a11y (F4) and social meta (F5).
7. [deck] README hub backlink.

## NCIEA_2026_Board_Meeting

Published at <https://dbetebenner.github.io/NCIEA_2026_Board_Meeting/>. Publish-only repo; the source is `Paper_1/NCIEA_2026_Board_presentation.qmd`.

1. **Theme:** Paper_1-era (112).
2. **CDN fonts:** Google, inlined. F1 applies; math font embedded.
3. **Contrast:** link 2.69 ✗, secondary 3.56 ✗.
4. **Alt text:** 0 of 19 rendered images (6 of 19 source images carry caption text but no `fig-alt`).
5. **Metadata:** `<title>` only.
6. **QR:** the QR encodes `…/NCIEA_2026_Board_Meeting/docs/assets/In_Order_We_Trust.pdf` → **404**. The corrected path (no `/docs`) → 200. The QR image has no alt.
7. **Slide numbers** on. **PDF:** the paper PDF exists at the corrected path.
8. **Links:** the clickable link targets `…/NCME_2026_LIwLD/docs/assets/In_Order_We_Trust.pdf` → **404**. The QR and the link also point at different repos. 2 of 2 broken.
9. **axe:** 4 rules / 4 nodes.
10. **README hub link:** no.
11. **Reproducibility:** source only in Paper_1; no render script.

**Proposed fixes**
1. [deck] QR and link: drop `/docs`, re-generate the QR, and use one target for both.
2. [deck] `fig-alt` on all 19 images, including the QR.
3. [deck] Record the source path, render command, and Paper_1 commit in the README.
4. [extension] Vendored fonts (F1).
5. [extension] #1F6FA8 accent (F2).
6. [extension] #6b6b66 secondary (F3).
7. [extension] Reveal chrome a11y (F4) and social meta (F5).
8. [deck] README hub backlink.

## NCME_2026_LIwLD

Published at <https://dbetebenner.github.io/NCME_2026_LIwLD/>. Publish-only repo; the source is `Paper_1/NCME_2026_presentation.qmd`.

1. **Theme:** Paper_1-era (112).
2. **CDN fonts:** Google, inlined. F1 applies; math font embedded.
3. **Contrast:** link 2.69 ✗, secondary 3.56 ✗.
4. **Alt text:** 0 of 19 rendered images (10 of 19 source images carry caption text only).
5. **Metadata:** `<title>` only.
6. **QR:** the QR encodes `https://github.com/dbetebenner/NCME_2026_LIwLD/blob/main/docs/assets/In_Order_We_Trust.pdf` → 200. It resolves, but to the GitHub file viewer rather than the PDF. The Pages URL `…/NCME_2026_LIwLD/assets/In_Order_We_Trust.pdf` → 200.
7. **Slide numbers** on. **PDF:** the paper PDF is in `docs/assets/`.
8. **Links:** 1 unique, 200.
9. **axe:** 4 rules / 4 nodes.
10. **README hub link:** no.
11. **Reproducibility:** source only in Paper_1; no render script.

**Proposed fixes**
1. [deck] Optional: re-point the QR and link at the Pages PDF URL (it opens directly on phones).
2. [deck] `fig-alt` on all 19 images.
3. [deck] Record the source path, render command, and Paper_1 commit in the README.
4. [extension] Vendored fonts (F1).
5. [extension] #1F6FA8 accent (F2).
6. [extension] #6b6b66 secondary (F3).
7. [extension] Reveal chrome a11y (F4) and social meta (F5).
8. [deck] README hub backlink.

## Michigan_TAC_042326 (corpus website)

Published at <https://dbetebenner.github.io/Michigan_TAC_042326/>. A Quarto website of 102 pages (from the sitemap), built by GitHub Actions `publish.yml`.

1. **Theme:** independent site theme (`styles/_tac-core.scss` plus `tac-light.scss`/`tac-dark.scss`, stone/forest/ink tokens, light and dark). Not a deck lineage.
2. **CDN fonts:** Google Fonts `<link>` (Josefin, Noto Sans, Noto Sans Mono) injected through `_quarto.yml` `include-in-header` on **all 102 pages**, with preconnects to googleapis and gstatic. Noto Sans Math is vendored and loads via `local()` then `url()`. Not a single-file build, so `embed-resources` does not apply.
3. **Contrast:** light links #434739 on #EDEDEB 8.15 ✓; dark links #98a384 on #141410 6.95 ✓. However, links sit 1.05:1 against the surrounding ink text with no underline. axe `link-in-text-block` flags 8 such links on the index.
4. **Alt text:** no `<img>` on any page.
5. **Metadata:** `<title>` is present. Only `og:title` and `og:site_name` are emitted (`open-graph: true`, but pages have no `description`). No `<meta name="description">`, `og:image`, or twitter card.
6. **QR:** none.
7. **Slide numbers:** n/a. **PDF:** `documents/meeting-summary-2026-04.pdf` and `documents/ai-native-tac.pdf` → 200, linked from the index.
8. **Links:** 102 sitemap pages plus 20 index-relative links plus 1 external, all 200.
9. **axe (index):** `link-in-text-block` 8 (serious), `aria-allowed-role` 1 (minor; Quarto's `.navbar-toggler` with `role="menu"`).
10. **README hub link:** no.
11. **Reproducibility:** full source in the repo (`_quarto.yml`, wikilink filter, styles, the workflow); math font vendored.

**Proposed fixes**
1. [deck] Underline in-text links (`text-decoration: underline` on `main a`), or use a link color at ≥3:1 against body text.
2. [deck] Vendor Josefin, Noto Sans, and Noto Sans Mono as site resources and remove the Google `<link>`/preconnects from `_quarto.yml` (same token set as the extension).
3. [deck] Set `website.open-graph.description`/`image` and `twitter-card: true`; add a `description:` to `index.qmd` and the two document pages.
4. [deck] Optional: patch the `.navbar-toggler` role (minor; Quarto default).
5. [deck] README hub backlink.
6. [extension] Once the deck extension's font layer exists, reuse its woff2 set here (shared fonts, not a theme).

---

## Decisions needed

**Global (decide once):**
- **G1.** Approve the extension's default text accent #1F6FA8, keeping #3498DB for non-text (borders, fills)? Approve / skip.
- **G2.** Approve the secondary text color #6b6b66 (from #7c7c7c)? Approve / skip.
- **G3.** Ship vendored woff2 fonts (Josefin, Noto Sans, Noto Sans Mono, Noto Sans Math) in the extension and drop the Google `@import`? This repairs the missing Noto Sans body face. Approve / skip.
- **G4.** Ship the reveal chrome a11y script (menu-button label, zoomable viewport, focusable menu panel) and the description/OG/Twitter meta in the extension? Approve / skip.
- **G5.** Add a hub backlink line to every README? Approve / skip.
- **G6.** Re-render past (already-presented) decks with the extension, or freeze them and fix only links, QR codes, and READMEs? Re-render / freeze.

**Per deck:**

| Deck | Question |
|---|---|
| WIDA_IN_Standard_Setting_Impact_Analysis | Adopt the extension before the 2026-11-01 presentation, add `gof_figure()` alt text, and add a title-slide deck QR like NH? |
| DoWEA_Presentation_102626 | Fix chart text colors (GREY, `#2e86c1`) in the R and d3 sources and re-render? |
| New_Hampshire_101926_Presentation | Publish the exported PDF in `docs/`, and add alt text for 12 figures? |
| AIME_2026_Panel_Presentation | Darken `.chip` amber/yellow and `.prod` text, fix `pagetitle`, and link the PDFs from the decks? (The session is past; is a re-render acceptable?) |
| AIME_2026_AI_Native_Dissertation_Training_Session | Vendor fonts to remove the runtime Google request, and publish a slide PDF? |
| Rhode_Island_082726_Presentation | Add alt text for 9 figures and re-render with the extension? |
| IEA_TIMSS_Copula_Overview_081126 | Confirm which Paper_1 file produced the published deck, then update the README and add alt text (requires a re-render)? |
| NCIEA_2026_Retreat | Extension adoption only, plus README? |
| Renaissance_TX_Project | Merge onto the shared theme with a teal override, or keep the fork and fix three colors? |
| Illinois_TAC_Meeting_052126 | Expand the 2-line README, plus extension adoption? |
| Betebenner_Braun_Discussion_051426 | README source/render provenance only, or also re-render? |
| NCIEA_2026_Colloquium | **Fix the broken QR and link (404)**: re-render from Paper_1 with the corrected URLs? |
| NCIEA_2026_Board_Meeting | **Fix the broken QR and link (404)** and add 19 alt texts: re-render from Paper_1? |
| NCME_2026_LIwLD | Re-point the QR to the Pages PDF, and add 19 alt texts? |
| Michigan_TAC_042326 | Underline links, vendor fonts, and complete OG/description? |
