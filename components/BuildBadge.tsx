/**
 * A small corner marker naming the build.
 *
 * The launcher icon and app name already differ per variant, but once you are
 * inside the app all three look identical — which is exactly when it matters,
 * because a bug report or a screenshot from the wrong build costs an hour.
 * Renders nothing at all in production.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { VARIANT_LABEL, isProductionBuild } from '@/app/appEnv';
import { font, sage } from '@/theme/sage';

export function BuildBadge() {
  if (isProductionBuild || !VARIANT_LABEL) return null;

  return (
    // `pointerEvents: none` so the badge can never swallow a tap meant for the
    // UI underneath it.
    <View style={styles.wrap} pointerEvents="none">
      <Text style={styles.text}>{VARIANT_LABEL}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderBottomLeftRadius: 8,
    backgroundColor: sage.fgMuted,
    opacity: 0.75,
  },
  text: {
    fontFamily: font.bodyBold,
    fontSize: 9,
    letterSpacing: 1.2,
    color: sage.bg,
  },
});
