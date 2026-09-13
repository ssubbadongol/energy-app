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
const SCALE = 0.64;
/** Transparent margin kept around each frame. */
const PAD = 6;

const SHEETS = ['happy', 'sleeping', 'walking', 'working'];

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

/** Contiguous horizontal runs of non-background columns = one frame each. */
function frameRuns(alpha, W, H) {
  const runs = [];
  let start = -1;
  for (let x = 0; x < W; x++) {
    let filled = false;
    for (let y = 0; y < H; y++) if (alpha[y * W + x] > 8) { filled = true; break; }
    if (filled && start < 0) start = x;
    else if (!filled && start >= 0) { runs.push([start, x - 1]); start = -1; }
  }
  if (start >= 0) runs.push([start, W - 1]);
  return runs;
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
const manifest = {};

for (const name of SHEETS) {
  const png = PNG.sync.read(fs.readFileSync(path.join(SRC, `${name}.png`)));
  const { width: W, height: H, data } = png;
  const bg = backgroundMask(data, W, H);
  const alpha = alphaMask(data, bg, W, H);
  const runs = frameRuns(alpha, W, H);

  // One shared vertical window for the whole sheet keeps the ground line fixed
  // while still letting the character bob between frames.
  let top = H, bottom = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (alpha[y * W + x] > 8) { if (y < top) top = y; if (y > bottom) bottom = y; break; }
    }
  }
  top = Math.max(0, top - PAD);
  bottom = Math.min(H - 1, bottom + PAD);
  const frameH = bottom - top + 1;
  const frameW = Math.max(...runs.map((r) => r[1] - r[0] + 1)) + PAD * 2;

  const outW = Math.round(frameW * SCALE);
  const outH = Math.round(frameH * SCALE);

  runs.forEach(([rx0, rx1], idx) => {
    // Centre each frame on its own content so the sheet's layout spacing
    // doesn't leak into the animation as horizontal jitter.
    const cx = Math.round((rx0 + rx1) / 2);
    const left = cx - Math.floor(frameW / 2);
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

  manifest[name] = { frames: runs.length, width: outW, height: outH };
  console.log(name, '->', runs.length, 'frames', outW + 'x' + outH);
}

console.log(JSON.stringify(manifest, null, 2));
