/**
 * Split a labelled sprite sheet into one plain strip per animation.
 *
 * Usage: node scripts/split-labelled-sheet.js <in.png> <out1.png> [out2.png ...]
 *
 * Some sheets arrive annotated — a heading above each animation and a caption
 * under every frame. The frame cutter reads anything that is not paper as
 * artwork, so left alone it would treat "TAIL CHASE SPIN" as a frame and every
 * caption as several more.
 *
 * Headings and captions are, however, obviously not characters: they are a
 * fraction of the height. So the sheet is split into bands of rows that contain
 * anything, and only the tall ones are kept — each written out as its own
 * strip, in order, for `cut-mascot-sprites.js` to treat like any other sheet.
 *
 * A heading whose pill happens to touch the frames below it does not get its
 * own band, so each kept band is also trimmed from the top while its rows are
 * narrow: a row of frames spans most of the sheet's width, and a heading sits
 * in one corner.
 */
const fs = require('fs');
const { PNG } = require('pngjs');

const [, , inPath, ...outPaths] = process.argv;
if (!inPath || !outPaths.length) {
  console.error('usage: node scripts/split-labelled-sheet.js <in.png> <out1.png> [out2.png ...]');
  process.exit(1);
}

/** A band shorter than this share of the tallest one is writing, not a frame. */
const CHARACTER_SHARE = 0.55;
/** Paper kept around each strip, so the cutter's own padding has room. */
const MARGIN = 8;
/**
 * A heading is a solid pill of colour, so its rows contain one long unbroken
 * run of ink. The top rows of artwork are accent marks — a few thin strokes
 * scattered across the sheet — so no run in them comes close to this.
 *
 * Measuring the *span* from first to last ink instead does not work: one row
 * can hold the pill and a stray mark near the far edge, which makes a heading
 * row look as wide as a row of frames.
 */
const HEADING_RUN = 0.06;
/** Only ever trimmed from the top of a band, and never more than this of it. */
const TRIM_LIMIT = 0.35;

const png = PNG.sync.read(fs.readFileSync(inPath));
const { width: W, height: H, data } = png;

const isPaper = (x, y) => {
  const i = (y * W + x) * 4;
  return data[i + 3] < 40 || (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235);
};

const rowHasInk = [];
for (let y = 0; y < H; y++) {
  let any = false;
  for (let x = 0; x < W; x++) if (!isPaper(x, y)) { any = true; break; }
  rowHasInk.push(any);
}

const bands = [];
let start = -1;
for (let y = 0; y < H; y++) {
  if (rowHasInk[y] && start < 0) start = y;
  else if (!rowHasInk[y] && start >= 0) { bands.push([start, y - 1]); start = -1; }
}
if (start >= 0) bands.push([start, H - 1]);

const tallest = Math.max(...bands.map(([a, b]) => b - a + 1));
const kept = bands.filter(([a, b]) => (b - a + 1) >= tallest * CHARACTER_SHARE);

console.log(`${bands.length} bands, ${kept.length} of them artwork:`);
for (const [a, b] of bands) {
  const h = b - a + 1;
  const keep = h >= tallest * CHARACTER_SHARE;
  console.log(`  y ${String(a).padStart(4)}-${String(b).padStart(4)}  h=${String(h).padStart(4)}  ${keep ? 'artwork' : 'writing, dropped'}`);
}

if (kept.length !== outPaths.length) {
  console.error(`\nexpected ${outPaths.length} animation(s), found ${kept.length}`);
  process.exit(1);
}

/** The longest unbroken stretch of ink in a row. */
function longestRun(y) {
  let best = 0;
  let run = 0;
  for (let x = 0; x < W; x++) {
    if (isPaper(x, y)) run = 0;
    else if (++run > best) best = run;
  }
  return best;
}

/** How far into a band the artwork starts, skipping a heading stuck to it. */
function artStartsAt(a, b) {
  const limit = a + (b - a) * TRIM_LIMIT;
  for (let y = a; y <= b; y++) {
    if (longestRun(y) < W * HEADING_RUN) return y;
    if (y > limit) return a;
  }
  return a;
}

kept.forEach(([band0, b], i) => {
  const a = artStartsAt(band0, b);
  const trimmed = a !== band0;
  if (trimmed) console.log(`  (trimmed a heading off rows ${band0}-${a - 1})`);
  // Margin above is paper to give the cutter room — but not when a heading was
  // just cut off, or it would put the heading straight back.
  const top = trimmed ? a : Math.max(0, a - MARGIN);
  const bottom = Math.min(H - 1, b + MARGIN);
  const h = bottom - top + 1;
  const out = new PNG({ width: W, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < W; x++) {
      const s = ((top + y) * W + x) * 4;
      const t = (y * W + x) * 4;
      out.data[t] = data[s];
      out.data[t + 1] = data[s + 1];
      out.data[t + 2] = data[s + 2];
      out.data[t + 3] = 255;
    }
  }
  fs.writeFileSync(outPaths[i], PNG.sync.write(out));
  console.log(`  -> ${outPaths[i]}  ${W}x${h}`);
});
