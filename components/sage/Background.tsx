import React from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';

// Natural size of assets/background/bg-screen.png (853 × 1844).
const IMG_ASPECT = 1844 / 853; // height / width
const PARALLAX = 18; // subtle drift; kept small so the bottom stays in view

/**
 * Full-bleed nature backdrop from the Claude Design handoff.
 *
 * The photo is **anchored to the bottom** and sized to cover the screen width,
 * so the foreground (the important part of the scene) is always visible; only
 * the sky at the top is cropped on shorter screens. A light translucent paper
 * wash keeps cards and text readable while letting the scene show through.
 *
 * When a scroll `Animated.Value` is passed, the photo drifts gently as the
 * user scrolls. The drift is small and the image carries top overscan, so the
 * bottom of the scene stays on screen at rest.
 */
export function SageBackground({ scrollY }: { scrollY?: Animated.Value }) {
  const { width: W, height: Hs } = useWindowDimensions();

  // Cover the screen width; grow to cover height if needed. Undistorted.
  let imgW = W;
  let imgH = Math.round(W * IMG_ASPECT);
  if (imgH < Hs + PARALLAX) {
    imgH = Hs + PARALLAX;
    imgW = Math.round(imgH / IMG_ASPECT);
  }

  const translateY = scrollY
    ? scrollY.interpolate({ inputRange: [0, 500], outputRange: [0, PARALLAX], extrapolate: 'clamp' })
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
