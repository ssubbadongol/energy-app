/**
 * Mascot sprite clips.
 *
 * The four sheets in /mascot are opaque RGB strips of a red panda drawn on one
 * shared canvas. `scripts/cut-mascot-sprites.js` flood-fills the background in
 * from the border (keying on white would punch holes through the ears, muzzle
 * and belly, which are also white), feathers the boundary by luminance so the
 * dark outline keeps its antialiasing, and writes one transparent PNG per
 * frame into assets/mascot. Re-run that script if the sheets change.
 *
 * Every frame of a clip shares one vertical window, so the character's ground
 * line is identical across the clip and only the intended bob moves. That is
 * why the mascot is positioned by its *feet* rather than its box.
 */
import type { ImageSourcePropType } from 'react-native';

export type ClipName = 'walking' | 'working' | 'sleeping' | 'happy';

export interface Clip {
  sources: ImageSourcePropType[];
  /** Rendered size in dp. Derived from the cut frame's aspect ratio. */
  width: number;
  height: number;
  /** Sprite frames per second. */
  fps: number;
  /** The single frame to hold under Reduce Motion — the most characterful one. */
  still: number;
}

/**
 * Display heights.
 *
 * walking/working/sleeping come off the sheets at one art scale, so they share
 * a scale factor and stay in proportion with each other. `happy` is drawn as a
 * close-up — a face peering over an edge rather than a whole animal — so it is
 * scaled down relative to the others; at true relative scale it would be half
 * the width of a phone.
 */
export const CLIPS: Record<ClipName, Clip> = {
  walking: {
    sources: [
      require('../../assets/mascot/walking-0.png'),
      require('../../assets/mascot/walking-1.png'),
      require('../../assets/mascot/walking-2.png'),
      require('../../assets/mascot/walking-3.png'),
      require('../../assets/mascot/walking-4.png'),
      require('../../assets/mascot/walking-5.png'),
    ],
    width: 75,
    height: 74,
    fps: 9,
    still: 0,
  },
  working: {
    sources: [
      require('../../assets/mascot/working-0.png'),
      require('../../assets/mascot/working-1.png'),
      require('../../assets/mascot/working-2.png'),
      require('../../assets/mascot/working-3.png'),
    ],
    width: 112,
    height: 76,
    fps: 3,
    still: 0,
  },
  sleeping: {
    sources: [
      require('../../assets/mascot/sleeping-0.png'),
      require('../../assets/mascot/sleeping-1.png'),
      require('../../assets/mascot/sleeping-2.png'),
    ],
    width: 124,
    height: 94,
    fps: 1.1,
    still: 2,
  },
  happy: {
    sources: [
      require('../../assets/mascot/happy-0.png'),
      require('../../assets/mascot/happy-1.png'),
      require('../../assets/mascot/happy-2.png'),
    ],
    width: 96,
    height: 81,
    fps: 2.4,
    still: 1,
  },
};

export const CLIP_NAMES = Object.keys(CLIPS) as ClipName[];

/**
 * The mascot is laid out inside one box big enough for every clip, with each
 * clip pinned to that box's bottom centre. Switching clips therefore never
 * moves the feet, and Android never has to render a child outside its parent.
 */
export const BOX_W = Math.max(...CLIP_NAMES.map((n) => CLIPS[n].width));
export const BOX_H = Math.max(...CLIP_NAMES.map((n) => CLIPS[n].height));
