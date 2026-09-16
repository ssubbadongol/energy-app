/**
 * The warm pool the two lamps throw, as its own layer.
 *
 * Separate from `StudyRoom` because it is the one part of the scenery that
 * moves: the lamps come up when a focus block starts and settle back when it
 * ends, which is the room acknowledging the timer without a word of copy. An
 * SVG node cannot be wrapped in an Animated.View, so the glow lives in its own
 * `<Svg>` inside one — and sits above the furniture but below the mascot, so
 * the light falls across the desk and the character stays crisp in front of it.
 */
import { memo } from 'react';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

export const RoomLight = memo(function RoomLight() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 320 200">
      <Defs>
        <RadialGradient id="lamp" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#ffcf86" stopOpacity="0.5" />
          <Stop offset="0.55" stopColor="#ffd9a0" stopOpacity="0.2" />
          <Stop offset="1" stopColor="#ffdead" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      {/* desk lamp, then floor lamp */}
      <Circle cx="76" cy="114" r="54" fill="url(#lamp)" />
      <Circle cx="292" cy="103" r="60" fill="url(#lamp)" />
    </Svg>
  );
});

export default RoomLight;
