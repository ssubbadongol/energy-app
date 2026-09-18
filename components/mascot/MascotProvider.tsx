import { useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Mascot } from './Mascot';
import { MascotRegistryContext, PerchRegistry } from './registry';

/**
 * Hosts the mascot and the registry of containers it may visit.
 *
 * Wrap the tab navigator in this. The mascot renders as a sibling *after* the
 * navigator so it draws above the screens, with `box-none` pointer events on
 * the layer so only the character itself takes touches.
 */
export function MascotProvider({ children }: { children: ReactNode }) {
  // Owned here rather than per screen so the mascot can capture them once. See
  // useMascotScroll for who writes them.
  const scrollY = useSharedValue(0);
  const scrollAt = useSharedValue(0);

  const registry = useRef<PerchRegistry>(null as unknown as PerchRegistry);
  if (!registry.current) registry.current = new PerchRegistry();
  registry.current.attachScroll({ y: scrollY, changedAt: scrollAt });

  return (
    <MascotRegistryContext.Provider value={registry.current}>
      <View style={styles.root}>
        {children}
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <Mascot />
        </View>
      </View>
    </MascotRegistryContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default MascotProvider;
