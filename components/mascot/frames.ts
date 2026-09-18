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

export type ClipName =
  | 'idle'
  | 'walking'
  | 'working'
  | 'sleeping'
  | 'happy'
  | 'spin'
  | 'held'
  | 'recover'
  | 'reading'
  | 'phone'
  | 'lifting';

export interface Clip {
  sources: ImageSourcePropType[];
  /** Rendered size in dp. Derived from the cut frame's aspect ratio. */
  width: number;
  height: number;
  /** Sprite frames per second. */
  fps: number;
  /** Plays once and holds its last frame when false. Defaults to looping. */
  loop?: boolean;
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
      require('../../assets/mascot/happy-3.png'),
      require('../../assets/mascot/happy-4.png'),
      require('../../assets/mascot/happy-5.png'),
      require('../../assets/mascot/happy-6.png'),
      require('../../assets/mascot/happy-7.png'),
      require('../../assets/mascot/happy-8.png'),
      require('../../assets/mascot/happy-9.png'),
      require('../../assets/mascot/happy-10.png'),
      require('../../assets/mascot/happy-11.png'),
    ],
    // Sized so the *character* matches `walking` — the panda that walks up to
    // a finished task is the same panda that celebrates it. The frame is taller
    // than the others because a quarter of it is the accent marks above the
    // head, which should float clear of the ears rather than shrink the animal.
    width: 68,
    height: 95,
    fps: 12,
    still: 4,
  },

  /**
   * Sitting and looking about — front, left, right, up, down, a blink. The
   * mascot's default: most of the time it should be doing this rather than
   * walking somewhere.
   *
   * Slow on purpose. The frames are a head turning, and at any pace quicker
   * than this it reads as a nervous twitch rather than idling.
   */
  idle: {
    sources: [
      require('../../assets/mascot/idle-0.png'),
      require('../../assets/mascot/idle-1.png'),
      require('../../assets/mascot/idle-2.png'),
      require('../../assets/mascot/idle-3.png'),
      require('../../assets/mascot/idle-4.png'),
      require('../../assets/mascot/idle-5.png'),
      require('../../assets/mascot/idle-6.png'),
      require('../../assets/mascot/idle-7.png'),
    ],
    width: 75,
    height: 88,
    fps: 2.5,
    still: 0,
  },

  /** Chasing its tail, for variety. A full turn takes about four fifths of a second. */
  spin: {
    sources: [
      require('../../assets/mascot/spin-0.png'),
      require('../../assets/mascot/spin-1.png'),
      require('../../assets/mascot/spin-2.png'),
      require('../../assets/mascot/spin-3.png'),
      require('../../assets/mascot/spin-4.png'),
      require('../../assets/mascot/spin-5.png'),
      require('../../assets/mascot/spin-6.png'),
      require('../../assets/mascot/spin-7.png'),
      require('../../assets/mascot/spin-8.png'),
    ],
    width: 84,
    height: 80,
    fps: 11,
    still: 0,
  },

  /* ---------------------------------------------------------------- *
   * Things to do on a break.
   *
   * These belong to the Pomodoro room and nowhere else — see BREAK_CLIPS
   * below. One of them is picked at random per break, so a break has
   * something in it besides the mascot pacing about.
   * ---------------------------------------------------------------- */

  /** Reading, with the odd page turn and a very contented face. */
  reading: {
    sources: [
      require('../../assets/mascot/reading-0.png'),
      require('../../assets/mascot/reading-1.png'),
      require('../../assets/mascot/reading-2.png'),
      require('../../assets/mascot/reading-3.png'),
      require('../../assets/mascot/reading-4.png'),
      require('../../assets/mascot/reading-5.png'),
    ],
    width: 79,
    height: 77,
    fps: 2.5,
    still: 0,
  },

  /** Scrolling, which is what a break usually actually looks like. */
  phone: {
    sources: [
      require('../../assets/mascot/phone-0.png'),
      require('../../assets/mascot/phone-1.png'),
      require('../../assets/mascot/phone-2.png'),
      require('../../assets/mascot/phone-3.png'),
      require('../../assets/mascot/phone-4.png'),
      require('../../assets/mascot/phone-5.png'),
    ],
    width: 82,
    height: 73,
    fps: 3,
    still: 0,
  },

  /** Curling a pair of dumbbells, with great seriousness. */
  lifting: {
    sources: [
      require('../../assets/mascot/lifting-0.png'),
      require('../../assets/mascot/lifting-1.png'),
      require('../../assets/mascot/lifting-2.png'),
      require('../../assets/mascot/lifting-3.png'),
      require('../../assets/mascot/lifting-4.png'),
      require('../../assets/mascot/lifting-5.png'),
    ],
    width: 76,
    height: 82,
    fps: 4.5,
    still: 3,
  },

  /**
   * Dangling from a finger, squirming. Loops for as long as the user holds on.
   *
   * The supplied art had a drawn human hand pinching the tail, which
   * `scripts/cut-hand-from-pick.js` removes — the thing holding the mascot is
   * the user's own finger, and a second hand beside it reads as a bug.
   */
  held: {
    sources: [
      require('../../assets/mascot/held-0.png'),
      require('../../assets/mascot/held-1.png'),
    ],
    width: 60,
    height: 88,
    fps: 5,
    still: 0,
  },

  /**
   * Put down: lands flat, lies there a beat, picks itself up and hops off.
   * Plays once — it is a reaction to being let go, not a state to sit in.
   */
  recover: {
    sources: [
      require('../../assets/mascot/recover-0.png'),
      require('../../assets/mascot/recover-1.png'),
      require('../../assets/mascot/recover-2.png'),
      require('../../assets/mascot/recover-3.png'),
      require('../../assets/mascot/recover-4.png'),
    ],
    width: 84,
    height: 87,
    fps: 7,
    loop: false,
    still: 4,
  },
};

export const CLIP_NAMES = Object.keys(CLIPS) as ClipName[];

/**
 * The things the mascot does on a Pomodoro break, one picked at random per
 * break.
 *
 * Named here rather than inline so the rule is stated once: these play in the
 * room on the Pomodoro tab and nowhere else. The mascot that roams the other
 * tabs mounts its own list, which does not include them.
 */
export const BREAK_CLIPS: ClipName[] = ['reading', 'phone', 'lifting'];

/**
 * The mascot is laid out inside one box big enough for every clip, with each
 * clip pinned to that box's bottom centre. Switching clips therefore never
 * moves the feet, and Android never has to render a child outside its parent.
 */
export const BOX_W = Math.max(...CLIP_NAMES.map((n) => CLIPS[n].width));
export const BOX_H = Math.max(...CLIP_NAMES.map((n) => CLIPS[n].height));
