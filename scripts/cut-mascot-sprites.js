/**
 * Cut the four mascot sprite sheets into individual transparent frames.
 *
 * Usage: node scripts/cut-mascot-sprites.js
 * Reads  /mascot/{happy,sleeping,walking,working}.png
 * Writes /assets/mascot/<clip>-<n>.png, consumed by components/mascot/frames.ts.
 *
 * The sheets are opaque RGB with a near-white background, and the red panda
 * has white ears/belly/muzzle — so keying on "white is transparent" punches
 * holes through the character. Instead we flood-fill the background inward
 * from the sheet border, which only ever reaches pixels actually connected to
 * the outside, and then feather the one-pixel boundary by luminance so the
 * dark outline keeps its antialiasing.
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SRC = path.join(__dirname, '..', 'mascot');
const OUT = path.join(__dirname, '..', 'assets', 'mascot');

/** Background is anything this bright that the border can reach. */
const BG_LUM = 236;
/** Boundary feather: lum >= FEATHER_HI -> alpha 0, lum <= FEATHER_LO -> opaque. */
const FEATHER_HI = 236;
const FEATHER_LO = 175;
/** One scale for every sheet, so the mascot never changes size mid-animation. */

/** Transparent margin kept around each frame. */
const PAD = 6;

/**
 * The sheets, and how much each is scaled on the way out.
 *
 * The first four arrive at roughly three times the size they are ever drawn
 * at, so they are taken down to something sensible for a phone. `held` and
 * `recover` arrive far smaller — around a hundred pixels of character rather
 * than three hundred — so they are kept at full size; downscaling them too
 * would leave the mascot visibly softer while it is being carried than it is
 * the moment you let go.
 */
const SHEETS = {
  happy: 0.64,
  sleeping: 0.64,
  walking: 0.64,
  working: 0.64,
  held: 1,
  recover: 1,
  idle: 1,
  spin: 1,
  reading: 1,
  phone: 1,
  lifting: 1,
};

const lumOf = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** Mark every near-white pixel reachable from the border. */
function backgroundMask(data, W, H) {
  const bg = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  let top = 0;
  const push = (p) => {
    if (bg[p]) return;
    if (lumOf(data, p * 4) < BG_LUM) return;
    bg[p] = 1;
    stack[top++] = p;
  };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (top > 0) {
    const p = stack[--top];
    const x = p % W, y = (p / W) | 0;
    if (x > 0) push(p - 1);
    if (x < W - 1) push(p + 1);
    if (y > 0) push(p - W);
    if (y < H - 1) push(p + W);
  }
  return bg;
}

/** Per-pixel alpha: 0 in the background, feathered on the boundary, else opaque. */
function alphaMask(data, bg, W, H) {
  const alpha = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (bg[p]) continue;
      let touchesBg = false;
      for (let dy = -1; dy <= 1 && !touchesBg; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (bg[ny * W + nx]) { touchesBg = true; break; }
        }
      }
      if (!touchesBg) { alpha[p] = 255; continue; }
      const l = lumOf(data, p * 4);
      const t = (FEATHER_HI - l) / (FEATHER_HI - FEATHER_LO);
      alpha[p] = Math.max(0, Math.min(255, Math.round(t * 255)));
    }
  }
  return alpha;
}

/** Contiguous runs of `true` in a flag array, as [start, end] pairs. */
function runsOf(filled) {
  const runs = [];
  let start = -1;
  for (let i = 0; i < filled.length; i++) {
    if (filled[i] && start < 0) start = i;
    else if (!filled[i] && start >= 0) { runs.push([start, i - 1]); start = -1; }
  }
  if (start >= 0) runs.push([start, filled.length - 1]);
  return runs;
}

/**
 * Turn raw column runs into one run per frame.
 *
 * Column runs are not quite frames. A sparkle drawn clear of the character
 * becomes a run of its own — a sliver a tenth the width of a frame — and two
 * frames whose accent marks reach towards each other become a single run twice
 * the normal width. Both happen in hand-drawn sheets and neither is something
 * the sheet's author should have to think about.
 *
 * So: a run far narrower than the rest is a stray mark, and belongs to the
 * frame it is nearest; a run far wider than the rest is frames that have run
 * together, and is divided evenly. Everything is measured against the median
 * run, so the rule needs no notion of how big a frame is meant to be.
 */
function tidyRuns(runs) {
  if (runs.length < 3) return runs;

  const widths = runs.map(([a, b]) => b - a + 1).sort((p, q) => p - q);
  const median = widths[widths.length >> 1];

  // Fold strays into whichever neighbour is closer.
  const kept = [];
  for (const run of runs) {
    if (run[1] - run[0] + 1 >= median * 0.4) {
      kept.push([...run]);
      continue;
    }
    const prev = kept[kept.length - 1];
    const next = runs[runs.indexOf(run) + 1];
    const toPrev = prev ? run[0] - prev[1] : Infinity;
    const toNext = next ? next[0] - run[1] : Infinity;
    if (toPrev <= toNext && prev) prev[1] = run[1];
    else if (next) next[0] = Math.min(next[0], run[0]);
    else if (prev) prev[1] = run[1];
  }

  // Divide any run that is really several frames touching.
  const out = [];
  for (const [a, b] of kept) {
    const n = Math.max(1, Math.round((b - a + 1) / median));
    if (n === 1) {
      out.push([a, b]);
      continue;
    }
    const step = (b - a + 1) / n;
    for (let i = 0; i < n; i++) {
      out.push([Math.round(a + i * step), Math.round(a + (i + 1) * step) - 1]);
    }
  }
  return out;
}

/**
 * Cut the sheet into frames, reading order.
 *
 * Sheets are not all one strip: a longer animation is laid out as a grid, so
 * rows are found first (bands of pixel rows that contain anything at all) and
 * then columns within each band. A single-row sheet is just the case where
 * there is one band, so this handles both without a flag.
 *
 * Each frame carries its own band's baseline, which is what keeps the ground
 * line steady when frames come from different rows.
 */
function findFrames(alpha, W, H) {
  const rowFilled = new Array(H).fill(false);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) if (alpha[y * W + x] > 8) { rowFilled[y] = true; break; }
  }

  const frames = [];
  for (const [by0, by1] of runsOf(rowFilled)) {
    const colFilled = new Array(W).fill(false);
    for (let x = 0; x < W; x++) {
      for (let y = by0; y <= by1; y++) if (alpha[y * W + x] > 8) { colFilled[x] = true; break; }
    }
    for (const [x0, x1] of tidyRuns(runsOf(colFilled))) {
      frames.push({ x0, x1, top: by0, bottom: by1 });
    }
  }
  return frames;
}

/** Area-average downscale over premultiplied colour, so edges don't darken. */
function downscale(src, sw, sh, dw, dh) {
  const out = new PNG({ width: dw, height: dh });
  const d = out.data;
  for (let dy = 0; dy < dh; dy++) {
    const y0 = (dy * sh) / dh, y1 = ((dy + 1) * sh) / dh;
    for (let dx = 0; dx < dw; dx++) {
      const x0 = (dx * sw) / dw, x1 = ((dx + 1) * sw) / dw;
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const i = (sy * sw + sx) * 4;
          const av = src[i + 3] / 255;
          r += src[i] * av; g += src[i + 1] * av; b += src[i + 2] * av; a += src[i + 3];
          n++;
        }
      }
      const j = (dy * dw + dx) * 4;
      if (!n || a === 0) { d[j] = d[j + 1] = d[j + 2] = d[j + 3] = 0; continue; }
      const am = a / n;
      d[j] = Math.round((r / n) / (am / 255));
      d[j + 1] = Math.round((g / n) / (am / 255));
      d[j + 2] = Math.round((b / n) / (am / 255));
      d[j + 3] = Math.round(am);
    }
  }
  return out;
}

fs.mkdirSync(OUT, { recursive: true });
// A re-cut of a sheet with fewer frames than last time must not leave the
// extras behind for frames.ts to pick up.
// Built with RegExp rather than a literal so the sheet list stays the single
// source of truth. Note the doubled backslashes: inside a template literal a
// lone \d collapses to a plain d, which quietly made this match nothing.
// Built with RegExp so the sheet list stays the single source of truth. The
// backslashes are doubled because inside a template literal a lone \d
// collapses to a plain d — which quietly made this sweep match nothing at all.
const cut = new RegExp(`^(${Object.keys(SHEETS).join('|')})-\\d+\\.png$`);
for (const f of fs.readdirSync(OUT)) {
  if (cut.test(f)) fs.unlinkSync(path.join(OUT, f));
}
const manifest = {};

for (const [name, scale] of Object.entries(SHEETS)) {
  const png = PNG.sync.read(fs.readFileSync(path.join(SRC, `${name}.png`)));
  const { width: W, height: H, data } = png;
  const bg = backgroundMask(data, W, H);
  const alpha = alphaMask(data, bg, W, H);
  const frames = findFrames(alpha, W, H);
  if (!frames.length) throw new Error(`${name}.png: nothing found on the sheet`);

  // One frame size for the whole sheet, big enough for the largest frame in it.
  // Every frame is then bottom-aligned on its own row's baseline, which is what
  // keeps the character's feet steady across the clip — including across rows.
  const frameW = Math.max(...frames.map((f) => f.x1 - f.x0 + 1)) + PAD * 2;
  const frameH = Math.max(...frames.map((f) => f.bottom - f.top + 1)) + PAD * 2;

  const outW = Math.round(frameW * scale);
  const outH = Math.round(frameH * scale);

  frames.forEach((f, idx) => {
    // Centre each frame on its own content so the sheet's layout spacing
    // doesn't leak into the animation as horizontal jitter.
    const cx = Math.round((f.x0 + f.x1) / 2);
    const left = cx - Math.floor(frameW / 2);
    const top = f.bottom + PAD - frameH + 1;
    const buf = Buffer.alloc(frameW * frameH * 4);
    for (let y = 0; y < frameH; y++) {
      for (let x = 0; x < frameW; x++) {
        const sx = left + x, sy = top + y;
        const j = (y * frameW + x) * 4;
        if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;
        const p = sy * W + sx;
        const a = alpha[p];
        if (!a) continue;
        buf[j] = data[p * 4];
        buf[j + 1] = data[p * 4 + 1];
        buf[j + 2] = data[p * 4 + 2];
        buf[j + 3] = a;
      }
    }
    const small = downscale(buf, frameW, frameH, outW, outH);
    const file = `${name}-${idx}.png`;
    fs.writeFileSync(path.join(OUT, file), PNG.sync.write(small));
  });

  manifest[name] = { frames: frames.length, width: outW, height: outH };
  console.log(name, '->', frames.length, 'frames', outW + 'x' + outH);
}

console.log(JSON.stringify(manifest, null, 2));
