/**
 * The room the mascot lives in.
 *
 * Drawn rather than shipped as an image so it costs a few kilobytes, stays
 * crisp at any stage size, and can be recoloured from the sage tokens if the
 * palette ever moves. It is pure scenery — no props, no state, no animation.
 *
 * The one thing outside this file that depends on the drawing is where the
 * mascot stands: `RUG` below is the ground it sits on, in viewBox fractions,
 * and MascotStage positions the character from those two numbers. Move the rug
 * and the mascot follows it.
 */
import { memo } from 'react';
import Svg, {
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

/** Everything is drawn in this space and scaled to the stage. 16:10. */
const VB_W = 320;
const VB_H = 200;

/** Where the mascot's feet belong, as a fraction of the stage. */
export const RUG = { x: 172 / VB_W, y: 178 / VB_H };
/**
 * How far along the floor it may wander, as a fraction of the stage. Not
 * symmetric: to the right is open floor, to the left is the desk, and a mascot
 * that strolls over to stand in front of the desk lamp just hides the desk.
 */
export const ROAM = { left: 38 / VB_W, right: 62 / VB_W };

const wood = '#c9ae90';
const woodDark = '#b1906f';
const shade = '#d8a87e';
const bulb = '#f6e3bd';
const pot = '#c9946f';

export const StudyRoom = memo(function StudyRoom() {
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
      <Defs>
        <LinearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#e1ece5" />
          <Stop offset="1" stopColor="#eef5f0" />
        </LinearGradient>
        <LinearGradient id="pane" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#dbe9f3" />
          <Stop offset="1" stopColor="#edf4ef" />
        </LinearGradient>
      </Defs>

      {/* wall, floor, skirting */}
      <Rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#wall)" />
      <Rect x="0" y="126" width={VB_W} height="74" fill="#f2e8da" />
      <Rect x="0" y="123" width={VB_W} height="4" fill="#e3ece5" />
      <Line x1="0" y1="145" x2={VB_W} y2="145" stroke="#e8dcc9" strokeWidth="1.5" />
      <Line x1="0" y1="163" x2={VB_W} y2="163" stroke="#e8dcc9" strokeWidth="1.5" />
      <Line x1="0" y1="184" x2={VB_W} y2="184" stroke="#e8dcc9" strokeWidth="1.5" />

      {/* window */}
      <G>
        <Rect x="28" y="18" width="70" height="60" rx="10" fill="#ffffff" />
        <Rect x="33" y="23" width="60" height="50" rx="7" fill="url(#pane)" />
        <Ellipse cx="50" cy="39" rx="10" ry="5" fill="#ffffff" opacity="0.8" />
        <Ellipse cx="60" cy="36" rx="6.5" ry="4" fill="#ffffff" opacity="0.65" />
        <Line x1="63" y1="23" x2="63" y2="73" stroke="#ffffff" strokeWidth="3" />
        <Line x1="33" y1="48" x2="93" y2="48" stroke="#ffffff" strokeWidth="3" />
        <Rect x="24" y="77" width="78" height="5" rx="2.5" fill="#ffffff" />
      </G>

      {/* wall shelf, books, a small pot */}
      <G>
        <Rect x="196" y="62" width="86" height="5" rx="2" fill={wood} />
        <Rect x="204" y="67" width="4" height="6" rx="1" fill={woodDark} />
        <Rect x="270" y="67" width="4" height="6" rx="1" fill={woodDark} />
        <Rect x="203" y="40" width="8" height="22" rx="1.5" fill="#7fb096" />
        <Rect x="213" y="34" width="7" height="28" rx="1.5" fill="#a58a72" />
        <Rect x="222" y="43" width="9" height="19" rx="1.5" fill="#a9c0d2" />
        <Rect x="233" y="37" width="7" height="25" rx="1.5" fill="#a8cbb6" />
        <Rect
          x="242"
          y="44"
          width="7"
          height="18"
          rx="1.5"
          fill={shade}
          transform="rotate(11 245 62)"
        />
        <Path d="M262 50 L278 50 L275.5 62 L264.5 62 Z" fill={pot} />
        <Ellipse cx="266" cy="45" rx="5" ry="7" fill="#8fbfa4" />
        <Ellipse cx="274" cy="44" rx="4.5" ry="6.5" fill="#a8cbb6" />
      </G>

      {/* rug — drawn before the furniture so everything stands on it */}
      <Ellipse cx="172" cy="178" rx="92" ry="16" fill="#e3efe8" />
      <Ellipse cx="172" cy="178" rx="68" ry="10" fill="none" stroke="#cde2d6" strokeWidth="2.5" />

      {/* potted plant */}
      <G>
        <Ellipse cx="24" cy="128" rx="7" ry="14" fill="#8fbfa4" transform="rotate(-22 24 128)" />
        <Ellipse cx="40" cy="126" rx="7" ry="15" fill="#7fb096" transform="rotate(20 40 126)" />
        <Ellipse cx="32" cy="117" rx="6.5" ry="16" fill="#a8cbb6" />
        <Path d="M16 148 L48 148 L44.5 178 L19.5 178 Z" fill={pot} />
        <Rect x="12" y="142" width="40" height="8" rx="3.5" fill="#d8a87e" />
      </G>

      {/* study desk */}
      <G>
        <Rect x="36" y="123" width="92" height="7" rx="3" fill={wood} />
        <Rect x="36" y="128" width="92" height="3" rx="1.5" fill={woodDark} />
        <Rect x="44" y="131" width="6" height="40" rx="2" fill={woodDark} />
        <Rect x="114" y="131" width="6" height="40" rx="2" fill={woodDark} />
        <Rect x="44" y="150" width="76" height="3" rx="1.5" fill={wood} />
      </G>

      {/* on the desk: lamp, mug, a stack of books */}
      <G>
        <Ellipse cx="54" cy="122" rx="11" ry="3.5" fill={woodDark} />
        <Rect x="52.5" y="97" width="3" height="26" fill="#a58a72" />
        <Rect x="54" y="95" width="19" height="3" rx="1.5" fill="#a58a72" />
        <Path d="M68 96 L76 96 L82 112 L62 112 Z" fill={shade} />
        <Ellipse cx="72" cy="112" rx="10" ry="2.6" fill={bulb} />
      </G>
      <G>
        <Rect x="97" y="119" width="23" height="4" rx="1.2" fill="#a9c0d2" />
        <Rect x="99" y="115" width="20" height="4" rx="1.2" fill="#7fb096" />
        <Rect x="98" y="111" width="21" height="4" rx="1.2" fill="#a58a72" />
      </G>
      <G>
        <Rect x="85" y="115" width="9" height="8" rx="2.2" fill="#ffffff" />
        <Path d="M94.5 117 q4 2.2 0 4.2" stroke="#dfeae3" strokeWidth="1.6" fill="none" />
      </G>

      {/* chair */}
      <G>
        <Rect x="233" y="92" width="31" height="40" rx="7" fill={wood} />
        <Rect x="233" y="92" width="31" height="7" rx="3.5" fill={woodDark} />
        <Rect x="242" y="104" width="4" height="21" rx="2" fill="#e9f1ec" />
        <Rect x="251" y="104" width="4" height="21" rx="2" fill="#e9f1ec" />
        <Rect x="225" y="127" width="47" height="8" rx="3" fill={woodDark} />
        <Rect x="229" y="121" width="39" height="8" rx="4" fill="#e8f2ec" />
        <Rect x="230" y="135" width="5" height="35" rx="2" fill={woodDark} />
        <Rect x="262" y="135" width="5" height="35" rx="2" fill={woodDark} />
      </G>

      {/* floor lamp */}
      <G>
        <Ellipse cx="292" cy="172" rx="14" ry="4" fill={woodDark} />
        <Rect x="290.5" y="105" width="3" height="67" fill="#a58a72" />
        <Path d="M279 79 L306 79 L311 105 L274 105 Z" fill={shade} />
        <Rect x="274" y="102" width="37" height="4" rx="2" fill={bulb} />
      </G>
    </Svg>
  );
});

export default StudyRoom;
