# Hex logos

`make-hex.mjs` draws the hex logos of the Center for Assessment R packages (SGP, SGPdata, SGPstateData, toOrdinal, randomNames) and sgpFlow. They share one grid, a copper ring around an ink hexagon, and each carries a small piece of art for what the package does. The text is outlined from Josefin Sans, so the SVGs have no font dependency.

```sh
cd tools/hex
npm install opentype.js --no-save        # the only dependency
FONT_DIR=/path/to/Josefin/ttfs node make-hex.mjs out
```

`FONT_DIR` must hold `JosefinSans-Bold.ttf` and `JosefinSans-Medium.ttf` (default `~/Library/Fonts`). The script writes `out/<package>/logo.svg`. The PNGs that go in each package's `man/figures` are rendered from those SVGs:

```sh
rsvg-convert -w 518 out/SGP/logo.svg -o out/SGP/logo.png
magick out/SGP/logo.png -resize 64x64 out/SGP/favicon.png
```

The hub shows the SVGs from `public/hex/`, named by package. To add a package, add its art and name to `PKGS`, copy the SVG to `public/hex/<name>.svg`, and give its entry in `catalog/repos.yml` a `hex:` path.
