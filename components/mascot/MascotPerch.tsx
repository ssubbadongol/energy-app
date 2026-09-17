import { useContext, useEffect, useRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import {
  MascotRegistryContext,
  type MascotMood,
  type PerchRect,
  type PerchSpot,
} from './registry';

export interface MascotPerchProps {
  /** Unique within the screen. `task-12`, `energy`, `progress`, … */
  id: string;
  /** What the mascot does here. Defaults to pottering about. */
  mood?: MascotMood;
  spot?: PerchSpot;
  /** While true, the mascot comes here and stays. One caller at a time. */
  call?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * Marks a container the mascot is allowed to visit.
 *
 * Registration is gated on focus rather than on mount: the tab navigator keeps
 * screens mounted once they have been visited, so a plain mount/unmount
 * registration would leave the mascot trying to hop onto cards belonging to a
 * tab the user left. Only the focused screen's perches are ever in the pool,
 * which is also what makes "roams the *active* tab" true without the mascot
 * needing to know anything about routing.
 */
export function MascotPerch({
  id,
  mood = 'potter',
  spot = 'top',
  call = false,
  style,
  children,
}: MascotPerchProps) {
  const registry = useContext(MascotRegistryContext);
  const ref = useRef<View>(null);
  const focused = useIsFocused();

  useEffect(() => {
    if (!registry || !focused) return;

    const measure = () =>
      new Promise<PerchRect | null>((resolve) => {
        const node = ref.current;
        if (!node) return resolve(null);
        node.measureInWindow((x, y, width, height) => {
          resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
        });
      });

    registry.add({ id, mood, spot, call, measure });
    return () => registry.remove(id);
  }, [registry, focused, id, mood, spot, call]);

  // collapsable={false} keeps the view in the native tree on Android, where a
  // layout-only View is otherwise flattened away and cannot be measured.
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}

export default MascotPerch;
