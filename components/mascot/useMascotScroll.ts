/**
 * Publishing a screen's scroll position, so the mascot can ride it.
 *
 * The mascot used to stay on its card by re-measuring the card every 40ms and
 * writing the result to its position. That is two problems at once: the sample
 * rate is well under the frame rate, so the movement steps rather than glides,
 * and `measureInWindow` is asynchronous — by the time an answer comes back the
 * list has moved on, so the mascot trails the content and then jumps to catch
 * up. Fast scrolling made both obvious.
 *
 * A scroll position, though, is knowable on the UI thread every frame. So the
 * screen publishes one, and the mascot holds the card's position as measured
 * *once* plus however far the list has scrolled since. No polling, no
 * asynchronous measurement in the hot path, and the character moves in the same
 * frame as the card underneath it.
 *
 * Attach it to whichever scroll view actually holds the mascot's containers:
 *
 *     const { scrollY, onScroll } = useMascotScroll();
 *     <SageBackground scrollY={scrollY} />
 *     <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} …>
 *
 * A screen with nothing scrollable simply does not call it.
 */
import { useEffect } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useMascotRegistry } from './registry';

export function useMascotScroll() {
  const registry = useMascotRegistry();
  /** This screen's own offset, for its parallax. */
  const scrollY = useSharedValue(0);
  const focused = useIsFocused();
  const isFocused = useSharedValue(false);
  const link = registry?.scrollLink ?? null;

  /*
   * Adopt this screen's position the moment it becomes the focused one. A
   * scroll view sitting still fires no events, so without this the shared pair
   * would still hold the *previous* screen's offset — and the first flick here
   * would jump the mascot by the difference.
   */
  useEffect(() => {
    isFocused.value = focused;
    if (focused && link) {
      link.y.value = scrollY.value;
      link.changedAt.value = Date.now();
    }
  }, [focused, link, scrollY, isFocused]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      if (isFocused.value && link) {
        link.y.value = e.contentOffset.y;
        link.changedAt.value = Date.now();
      }
    },
  });

  return { scrollY, onScroll };
}
