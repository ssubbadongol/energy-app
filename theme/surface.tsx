import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { palette, type Palette } from './tokens';

export type SurfaceName = 'light' | 'dark' | 'emphasis';

const SurfaceContext = createContext<{ name: SurfaceName; c: Palette }>({
  name: 'light',
  c: palette.light,
});

/**
 * Makes the active palette available to every primitive below it.
 *
 * Three surfaces, not two:
 *   light     — the default. Warm paper.
 *   dark      — the dusk variant of the whole app.
 *   emphasis  — the deep ink block. Rare, and only ever a region *within* a
 *               screen, never the screen itself.
 *
 * Wrapping a subtree flips every `Text`, `Rule`, `Button` and `ListItem`
 * inside it with no prop threading, which matters because a component that
 * forgot to handle the flip shows up instantly as a pale rectangle on a dark
 * block.
 */
export function Surface({ name = 'light', children }: { name?: SurfaceName; children: ReactNode }) {
  const value = useMemo(() => ({ name, c: palette[name] }), [name]);
  return <SurfaceContext.Provider value={value}>{children}</SurfaceContext.Provider>;
}

/** Returns the palette for the current surface. */
export function useSurface() {
  return useContext(SurfaceContext);
}

/**
 * The palette a filled control should draw itself in, so it reads as inverted
 * against whatever it is sitting on.
 */
export function useInverse(): Palette {
  const { name } = useSurface();
  return name === 'light' ? palette.emphasis : palette.light;
}
