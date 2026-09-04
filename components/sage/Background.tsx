import React from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';

// Natural size of assets/background/bg-screen.png (853 × 1844).
const IMG_ASPECT = 1844 / 853; // height / width
const PARALLAX = 64; // how far the photo drifts down over a full scroll

/**
 * Full-bleed nature backdrop from the Claude Design handoff.
 *
 * The photo is anchored to the bottom and sized to cover the screen width, so
 * the foreground/character of the scene is visible at rest; only the sky at the
 * top is cropped on shorter screens. A light paper wash keeps cards readable.
 *
 * Parallax: the image carries `PARALLAX` px of top overscan, and drifts DOWN by
 * that amount as the user scrolls (the mockup's effect). Because the drift is
 * absorbed by the overscan, there is never a gap. Driven on the JS thread
 * (useNativeDriver:false in the screens) so it also animates on web.
 */
export function SageBackground({ scrollY }: { scrollY?: Animated.Value }) {
  const { width: W, height: Hs } = useWindowDimensions();

  // Height = screen + overscan; width follows aspect. If that is narrower than
  // the screen, widen to cover (sides crop instead).
  let imgH = Hs + PARALLAX;
  let imgW = imgH / IMG_ASPECT;
  if (imgW < W) {
    imgW = W;
    imgH = Math.round(W * IMG_ASPECT);
  }
  const overscan = Math.max(0, imgH - Hs);

  const translateY = scrollY
    ? scrollY.interpolate({ inputRange: [0, 420], outputRange: [0, overscan], extrapolate: 'clamp' })
    : 0;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.Image
        source={require('../../assets/background/bg-screen.png')}
        resizeMode="cover"
        style={{ position: 'absolute', width: imgW, height: imgH, bottom: 0, left: (W - imgW) / 2, transform: [{ translateY }] }}
      />
      <View style={styles.overlay} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Translucent warm-paper wash — light enough to keep the scene's character.
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(247,250,247,0.5)' },
});

export default SageBackground;
