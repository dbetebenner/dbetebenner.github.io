// Hex logo family for the Center for Assessment R packages.
// Shared grid: pointy-top hexagon, viewBox 200 x 231 (R = 115.47, centre 100,115.47).
// Labels and in-art text are outlined from Josefin Sans, so the SVGs carry no font dependency.
// Usage: node make-hex.mjs <outDir>
import opentype from "opentype.js";
import fs from "node:fs";
import path from "node:path";

const FONT_DIR = process.env.FONT_DIR ?? `${process.env.HOME}/Library/Fonts`;
const load = (f) => {
  const b = fs.readFileSync(path.join(FONT_DIR, f));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const bold = load("JosefinSans-Bold.ttf");
const medium = load("JosefinSans-Medium.ttf");

const C = {
  ink: "#16170f", ink2: "#22241a", paper: "#f4f1ea", sage: "#9db08a", forest: "#5d6a4c",
  blue: "#6aa6d8", copper: "#d68b45", rose: "#e0a79a", mute: "#4a4d3c",
};
const W = 200, H = 230.94;
const HEX = [[100, 0], [200, 57.74], [200, 173.2], [100, H], [0, 173.2], [0, 57.74]];
const pts = (p) => p.map((q) => q.join(",")).join(" ");
const inset = (d) => {
  const cx = 100, cy = H / 2;
  return HEX.map(([x, y]) => {
    const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy);
    return [+(x - (dx / l) * d).toFixed(2), +(y - (dy / l) * d).toFixed(2)];
  });
};

const f2 = (n) => +n.toFixed(2);
// Text as an outlined path. anchor: "middle" | "start". tracking in em.
function text(str, { x, y, size, font = bold, anchor = "middle", tracking = 0, fill = C.paper }) {
  const scale = size / font.unitsPerEm;
  const glyphs = font.stringToGlyphs(str);
  let adv = 0;
  const widths = glyphs.map((g, i) => {
    const kern = i < glyphs.length - 1 ? font.getKerningValue(g, glyphs[i + 1]) : 0;
    const w = (g.advanceWidth + kern) * scale + tracking * size;
    adv += w;
    return w;
  });
  adv -= tracking * size;
  let cx = anchor === "middle" ? x - adv / 2 : x;
  let d = "";
  glyphs.forEach((g, i) => {
    d += g.getPath(cx, y, size).toPathData(2);
    cx += widths[i];
  });
  return { svg: `<path d="${d}" fill="${fill}"/>`, width: adv };
}

function label(name) {
  // fit the name into 112 units, cap the size at 21
  const probe = text(name, { x: 0, y: 0, size: 100, tracking: 0.04 }).width;
  const size = Math.min(21, (112 / probe) * 100);
  return text(name, { x: 100, y: 191, size, tracking: 0.04 }).svg;
}

const dot = (x, y, r, fill) => `<circle cx="${f2(x)}" cy="${f2(y)}" r="${r}" fill="${fill}"/>`;
const line = (x1, y1, x2, y2, stroke, w, extra = "") =>
  `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;

// ── Art ─────────────────────────────────────────────────────────────────────
// SGP: fan of growth-percentile curves from one prior score.
function artSGP() {
  const x0 = 46, y0 = 128, x1 = 154;
  const ends = [[52, C.rose, 2.4], [74, C.copper, 2.6], [97, C.paper, 4.2], [121, C.sage, 2.6], [144, C.blue, 2.4]];
  // fan runs from low (bottom) to high (top): flip so 90th is highest
  const flipped = ends.map(([, col, w], i) => {
    const ey = [140, 118, 96, 74, 52][i];
    return `<path d="M${x0} 96 C ${x0 + 40} 96, ${x1 - 46} ${ey}, ${x1} ${ey}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
  });
  const tips = [140, 118, 96, 74, 52].map((ey, i) => dot(x1, ey, i === 2 ? 4.4 : 3, ends[i][1]));
  return [...flipped, dot(x0, 96, 5.5, C.paper), ...tips].join("");
}

// SGPdata: longitudinal grid of student scores over four years.
function artSGPdata() {
  const xs = [48, 81, 114, 147], ys = [50, 76, 102, 128];
  const g = [];
  for (const x of xs) for (const y of ys) g.push(dot(x, y, 3.2, C.mute));
  const traj = (idx, col, w) => {
    const p = idx.map((r, c) => [xs[c], ys[r]]);
    return `<polyline points="${pts(p)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>` +
      p.map(([x, y]) => dot(x, y, 4.6, col)).join("");
  };
  return [
    ...g,
    traj([3, 2, 2, 1], C.blue, 2.4),
    traj([1, 2, 1, 0], C.sage, 2.4),
    traj([2, 3, 2, 3], C.rose, 2.4),
    traj([3, 3, 2, 1], C.copper, 3),
  ].join("");
}

// SGPstateData: proficiency bands separated by cut scores, over a state tile-map.
function artSGPstateData() {
  const out = [];
  // tile map (upper): 3 rows of rounded square tiles in a state-like cluster
  const rows = [[0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5], [1, 2, 3, 4]];
  const t = 13, gap = 3;
  rows.forEach((r, ri) => r.forEach((ci) => {
    const x = 100 - (6 * t + 5 * gap) / 2 + ci * (t + gap);
    const y = 38 + ri * (t + gap);
    out.push(`<rect x="${f2(x)}" y="${y}" width="${t}" height="${t}" rx="2.4" fill="${[C.rose, C.copper, C.sage, C.blue][(ci + ri) % 4]}" opacity="0.92"/>`);
  }));
  // cutscore scale (lower)
  const y = 126, x0 = 42, x1 = 158, cuts = [71, 100, 129];
  const bands = [[x0, cuts[0], C.rose, 14], [cuts[0], cuts[1], C.copper, 22], [cuts[1], cuts[2], C.sage, 30], [cuts[2], x1, C.blue, 38]];
  bands.forEach(([a, b, col, h]) => out.push(`<rect x="${a + 1}" y="${y - h + 8}" width="${b - a - 2}" height="${h}" rx="2" fill="${col}" opacity="0.9"/>`));
  out.push(line(x0 - 2, y + 11, x1 + 2, y + 11, C.paper, 2));
  cuts.forEach((c) => out.push(line(c, y + 6, c, y + 17, C.paper, 2.4)));
  return out.join("");
}

// toOrdinal: 1st 2nd 3rd with superscript suffixes.
function artToOrdinal() {
  const rows = [["1", "st", C.paper, C.copper], ["2", "nd", C.paper, C.sage], ["3", "rd", C.paper, C.blue]];
  const size = 34, sup = 19;
  return rows.map(([n, s, c1, c2], i) => {
    const y = 66 + i * 34;
    const a = text(n, { x: 0, y, size, anchor: "start", fill: c1 });
    const total = a.width + 1 + text(s, { x: 0, y, size: sup, anchor: "start", font: medium }).width;
    const x0 = 100 - total / 2;
    const A = text(n, { x: x0, y, size, anchor: "start", fill: c1 }).svg;
    const B = text(s, { x: x0 + a.width + 1, y: y - 16, size: sup, anchor: "start", font: medium, fill: c2 }).svg;
    return A + B;
  }).join("");
}

// randomNames: scattered name tags, one carrying die pips.
function artRandomNames() {
  const tag = (cx, cy, rot, fill, bars, pips) => {
    const w = 62, h = 34;
    let g = `<g transform="translate(${cx} ${cy}) rotate(${rot})">`;
    g += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="5" fill="${fill}"/>`;
    g += `<rect x="-6" y="${-h / 2 + 4}" width="12" height="3.4" rx="1.7" fill="${C.ink}" opacity="0.55"/>`;
    if (pips) {
      [[-14, 4], [-7, 11], [0, 4], [7, 11], [14, 4]].forEach(([px, py]) => { g += dot(px - 0, py - 1, 2.3, C.ink); });
    } else {
      bars.forEach((bw, i) => { g += `<rect x="${-w / 2 + 9}" y="${3 + i * 8}" width="${bw}" height="3.6" rx="1.8" fill="${C.ink}" opacity="0.75"/>`; });
    }
    return g + "</g>";
  };
  return [
    tag(78, 56, -14, C.blue, [34, 22]),
    tag(124, 74, 9, C.copper, [26, 38]),
    tag(86, 108, -5, C.sage, [], true),
    tag(130, 124, 12, C.rose, [38, 20]),
  ].join("");
}

const grp = (art, s, cy) => () => `<g transform="translate(100 94) scale(${s}) translate(-100 ${-cy})">${art()}</g>`;
const PKGS = {
  SGP: grp(artSGP, 1.08, 96), SGPdata: grp(artSGPdata, 1.1, 89), SGPstateData: grp(artSGPstateData, 1.15, 86),
  toOrdinal: grp(artToOrdinal, 1.05, 90), randomNames: grp(artRandomNames, 1.1, 88),
};

function hexSvg(name) {
  const title = `${name} hex logo`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${f2(H)}" role="img" aria-labelledby="t">
<title id="t">${title}</title>
<polygon points="${pts(HEX)}" fill="${C.copper}"/>
<polygon points="${pts(inset(11))}" fill="${C.ink}" stroke="${C.ink2}" stroke-width="0" stroke-linejoin="round"/>
<polygon points="${pts(inset(17))}" fill="none" stroke="${C.mute}" stroke-width="1.2" stroke-linejoin="round"/>
${PKGS[name]()}
${label(name)}
</svg>
`;
}

const out = process.argv[2] ?? "out";
for (const name of Object.keys(PKGS)) {
  fs.mkdirSync(path.join(out, name), { recursive: true });
  fs.writeFileSync(path.join(out, name, "logo.svg"), hexSvg(name));
}
console.log("wrote", Object.keys(PKGS).join(", "));
