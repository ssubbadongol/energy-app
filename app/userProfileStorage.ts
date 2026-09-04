import AsyncStorage from '@react-native-async-storage/async-storage';

export type MentorTone = 'Gentle' | 'Direct';
export type EnergyTier = 'high' | 'mid' | 'low';

export interface UserProfile {
  name: string;
  mentorTone: MentorTone;
  defaultEnergy: EnergyTier;
  focusEnabled: boolean;
}

const PROFILE_KEY = '@sf_user_profile';
const ONBOARDED_KEY = '@sf_onboarded';

export const defaultProfile: UserProfile = {
  name: '',
  mentorTone: 'Gentle',
  defaultEnergy: 'mid',
  focusEnabled: true,
};

let cache: UserProfile | null = null;

/** Load the profile (cached after first read). */
export const loadUserProfile = async (): Promise<UserProfile> => {
  if (cache) return cache;
  let loaded: UserProfile;
  try {
    const stored = await AsyncStorage.getItem(PROFILE_KEY);
    loaded = stored ? { ...defaultProfile, ...JSON.parse(stored) } : { ...defaultProfile };
  } catch {
    loaded = { ...defaultProfile };
  }
  cache = loaded;
  return loaded;
};

/** Synchronous read of the last-loaded profile (defaults until loaded). */
export const getUserProfileSync = (): UserProfile => cache ?? { ...defaultProfile };

export const saveUserProfile = async (patch: Partial<UserProfile>) => {
  cache = { ...(cache ?? defaultProfile), ...patch };
  try {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error saving user profile:', error);
  }
};

export const isOnboarded = async (): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(ONBOARDED_KEY)) === 'true';
  } catch {
    return false;
  }
};

export const setOnboarded = async (value: boolean) => {
  try {
    await AsyncStorage.setItem(ONBOARDED_KEY, value ? 'true' : 'false');
  } catch (error) {
    console.error('Error saving onboarded flag:', error);
  }
};
