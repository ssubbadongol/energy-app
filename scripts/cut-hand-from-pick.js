/**
 * Take the human hand out of the "held" sprite sheet.
 *
 * Usage: node scripts/cut-hand-from-pick.js <in.png> <out.png>
 *
 * The supplied art shows the mascot dangling from a hand that pinches its
 * tail. The hand has to go — in the app the thing holding the mascot is the
 * user's actual finger, and a second, drawn hand next to it reads as a bug.
 *
 * Keying on skin colour alone does not work: the peach of the hand is close
 * enough to the antialiased edge between the panda's cream face and its orange
 * fur that a colour key eats the character's own outlines. What does work is
 * that the hand is entirely above the tail. Skin pixels are found, the largest
 * connected run of them is taken as the hand (the rest are those few-pixel
 * fringes), and the first row below it with no skin at all is the cut.
 *
 * Cutting straight across would leave the tail ending in a flat edge, so the
 * top few rows are then shaped into a rounded cap and re-outlined in the ink
 * the drawing already uses, which is sampled from the tail rather than
 * hard-coded.
 */
const fs = require('fs');
const { PNG } = require('pngjs');

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node scripts/cut-hand-from-pick.js <in.png> <out.png>');
  process.exit(1);
}

const png = PNG.sync.read(fs.readFileSync(inPath));
const { width: W, height: H, data } = png;

const at = (x, y) => (y * W + x) * 4;
const isPaper = (x, y) => {
  const i = at(x, y);
  return data[i + 3] < 40 || (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235);
};
const isSkin = (x, y) => {
  const i = at(x, y);
  const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
  return r >= 205 && g >= 125 && b >= 90 && r > g && g > b &&
    r - b >= 35 && r - b <= 135 && g - b >= 18;
};

/** Columns that contain anything, so each frame is handled on its own. */
function frameColumns() {
  const filled = [];
  for (let x = 0; x < W; x++) {
    let any = false;
    for (let y = 0; y < H; y++) if (!isPaper(x, y)) { any = true; break; }
    filled.push(any);
  }
  const runs = [];
  let s = -1;
  for (let x = 0; x < W; x++) {
    if (filled[x] && s < 0) s = x;
    else if (!filled[x] && s >= 0) { runs.push([s, x - 1]); s = -1; }
  }
  if (s >= 0) runs.push([s, W - 1]);
  return runs;
}

/** The largest connected blob of skin inside a column range, or null. */
function findHand(x0, x1) {
  const seen = new Uint8Array(W * H);
  let best = null;
  for (let y = 0; y < H; y++) {
    for (let x = x0; x <= x1; x++) {
      const s = y * W + x;
      if (seen[s] || !isSkin(x, y)) continue;
      const stack = [s];
      seen[s] = 1;
      const px = [];
      while (stack.length) {
        const q = stack.pop();
        px.push(q);
        const qx = q % W, qy = (q / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < x0 || nx > x1 || ny < 0 || ny >= H) continue;
          const n = ny * W + nx;
          if (seen[n] || !isSkin(nx, ny)) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
      if (!best || px.length > best.length) best = px;
    }
  }
  // A handful of pixels is an antialiasing fringe, not a hand.
  return best && best.length > 200 ? best : null;
}

const paper = [255, 255, 255, 255];
const erase = (x, y) => {
  const i = at(x, y);
  data[i] = paper[0]; data[i + 1] = paper[1]; data[i + 2] = paper[2]; data[i + 3] = paper[3];
};

let handled = 0;
for (const [x0, x1] of frameColumns()) {
  const hand = findHand(x0, x1);
  if (!hand) continue;

  let bottom = 0;
  for (const q of hand) bottom = Math.max(bottom, (q / W) | 0);

  // First row under the hand with no skin left in it at all.
  let cut = bottom + 1;
  while (cut < H) {
    let any = false;
    for (let x = x0; x <= x1; x++) if (isSkin(x, cut)) { any = true; break; }
    if (!any) break;
    cut++;
  }

  for (let y = 0; y < cut; y++) for (let x = x0; x <= x1; x++) erase(x, y);

  // Round off the stump the cut leaves in the tail.
  let lo = -1, hi = -1;
  for (let x = x0; x <= x1; x++) if (!isPaper(x, cut)) { if (lo < 0) lo = x; hi = x; }
  if (lo < 0) continue;

  const cx = (lo + hi) / 2;
  const half = (hi - lo) / 2;
  const capH = Math.max(3, Math.round(half * 0.75));

  // The outline colour the drawing already uses, sampled rather than guessed
  // at: the darkest pixel in a band of the tail just below the cap. Taking the
  // first non-paper pixel instead would land on an antialiased edge and give a
  // pale grey, which is what a hand-drawn outline never is.
  const ink = (() => {
    let best = [60, 36, 24];
    let dark = Infinity;
    for (let y = cut + capH; y < Math.min(H, cut + capH + 10); y++) {
      for (let x = lo; x <= hi; x++) {
        if (isPaper(x, y)) continue;
        const i = at(x, y);
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (lum < dark) { dark = lum; best = [data[i], data[i + 1], data[i + 2]]; }
      }
    }
    return best;
  })();

  for (let r = 0; r < capH; r++) {
    const y = cut + r;
    if (y >= H) break;
    // An ellipse from a point at the top out to the tail's full width.
    const t = (capH - r) / capH;
    const w = half * Math.sqrt(Math.max(0, 1 - t * t));
    for (let x = x0; x <= x1; x++) {
      const dx = Math.abs(x - cx);
      if (dx > w) { erase(x, y); continue; }
      if (dx > w - 3.6 && !isPaper(x, y)) {
        const i = at(x, y);
        data[i] = ink[0]; data[i + 1] = ink[1]; data[i + 2] = ink[2]; data[i + 3] = 255;
      }
    }
  }
  handled++;
  console.log(`frame x${x0}-${x1}: hand ${hand.length}px, cut at y=${cut}, cap ${capH}px`);
}

fs.writeFileSync(outPath, PNG.sync.write(png));
console.log(`removed the hand from ${handled} frame(s) -> ${outPath}`);
