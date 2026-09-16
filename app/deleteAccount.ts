/**
 * Account deletion, client side.
 *
 * The server does the work (`functions/src/account.ts`); this handles what has
 * to happen on the device afterwards, which the server cannot reach:
 *
 *   1. Wipe local caches. Tasks, life tasks and the pinned task live in
 *      AsyncStorage as the fast read path. Deleting the Firestore copy while
 *      leaving those behind would show the next guest on this phone the
 *      previous account's tasks — which is a worse privacy failure than not
 *      deleting at all.
 *   2. Cancel every scheduled notification, or the phone keeps nagging about
 *      tasks belonging to an account that no longer exists.
 *   3. Sign back in as a fresh guest, so the app is still usable and every
 *      screen's `ensureAuth` still resolves.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { callable } from './firebase';
import { notifyAccountSwitched, signOutToGuest } from './accountService';
import { devLog } from './devLog';
import { track } from './monitoring';

const deleteAccountCallable = callable<void, { deleted: true; tombstoned: number }>('deleteAccount');

/**
 * Every AsyncStorage key this app owns.
 *
 * Listed explicitly rather than calling `AsyncStorage.clear()`, which would
 * also wipe React Native's and Firebase's own persisted state — including the
 * auth session we are about to replace.
 */
const LOCAL_KEYS = [
  '@energy_tasks', // app/taskStorage.ts
  '@energy_life_tasks', // app/lifeTaskStorage.ts
  '@energy_last_reset_date', // app/lifeTaskStorage.ts
  '@sf_user_profile', // app/userProfileStorage.ts
  '@sf_onboarded', // app/userProfileStorage.ts
  '@sf_current_pod', // app/podService.ts
  '@soft_focus_pod_terms_accepted', // app/podTerms.ts
  // Deliberately NOT '@soft_focus_pomodoro_settings': timer lengths are a
  // property of this phone and this desk, not of the account, and wiping them
  // would be a surprise rather than a privacy improvement.
];

export async function deleteAccount(): Promise<void> {
  // Server first. If this throws, nothing local has been destroyed and the
  // user can try again — the reverse order would leave them with an empty
  // phone and an account that still exists.
  await deleteAccountCallable();

  track('account_deleted');

  await Notifications.cancelAllScheduledNotificationsAsync().catch((err) =>
    console.warn('[delete] Could not cancel notifications', err),
  );

  await AsyncStorage.multiRemove(LOCAL_KEYS).catch((err) =>
    console.warn('[delete] Could not clear local storage', err),
  );

  // The old user is gone server-side, so this mints a brand-new anonymous one.
  const uid = await signOutToGuest();
  await notifyAccountSwitched(uid);

  devLog('[delete] Account deleted; continuing as guest', uid);
}
