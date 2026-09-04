import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SageBackground } from '@/components/sage/Background';
import { curve, energy, type EnergyKey, font, gutter, radius, sage, shadow, text } from '@/theme/sage';
import { getLifeTasks, initializeLifeTasks, updateLifeTasks } from './lifeTaskStorage';
import { type EnergyTier, type MentorTone, saveUserProfile, setOnboarded } from './userProfileStorage';

/* Everyday-basics groups → the lifeTaskStorage default ids they enable. */
const BASICS: { key: string; emoji: string; label: string; sub: string; ids: string[] }[] = [
  { key: 'meals', emoji: '🍽', label: 'Meals', sub: 'breakfast · lunch · dinner', ids: ['breakfast', 'lunch', 'dinner'] },
  { key: 'hydration', emoji: '💧', label: 'Hydration', sub: 'water through the day', ids: ['water-morning', 'water-midday'] },
  { key: 'meds', emoji: '💊', label: 'Medication', sub: 'morning · evening', ids: ['meds-morning', 'meds-evening'] },
  { key: 'movement', emoji: '🚶', label: 'Movement', sub: 'a walk or some exercise', ids: ['walk', 'exercise'] },
  { key: 'shower', emoji: '🚿', label: 'Shower', sub: 'a morning reset', ids: ['shower'] },
  { key: 'plants', emoji: '🌱', label: 'Water plants', sub: 'evening', ids: ['plants'] },
  { key: 'winddown', emoji: '😴', label: 'Wind down', sub: 'ease into sleep', ids: ['wind-down'] },
];

const TOTAL = 7; // steps 0..6

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [energyPick, setEnergyPick] = useState<EnergyKey>('mid');
  const [basics, setBasics] = useState<Set<string>>(new Set(['meals', 'hydration', 'winddown']));
  const [tone, setTone] = useState<MentorTone>('Gentle');
  const [focusOn, setFocusOn] = useState(true);
  const [saving, setSaving] = useState(false);

  const toggleBasic = (key: string) =>
    setBasics((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Enable the chosen everyday basics in the routine store.
      const enabledIds = new Set<string>();
      BASICS.forEach((b) => { if (basics.has(b.key)) b.ids.forEach((id) => enabledIds.add(id)); });
      await initializeLifeTasks();
      const tasks = getLifeTasks().map((t) => ({ ...t, enabled: enabledIds.has(t.id) }));
      await updateLifeTasks(tasks);

      await saveUserProfile({
        name: name.trim(),
        mentorTone: tone,
        defaultEnergy: energyPick as EnergyTier,
        focusEnabled: focusOn,
      });
      await setOnboarded(true);
      router.replace('/');
    } catch (error) {
      console.error('Onboarding error:', error);
      setSaving(false);
    }
  };

  const next = () => {
    if (step >= TOTAL - 1) finish();
    else setStep((s) => s + 1);
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const ctaLabel = step === 0 ? 'Begin' : step === TOTAL - 1 ? 'Enter Soft Focus' : 'Continue';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <SageBackground />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* progress */}
        <View style={styles.progressRow}>
          <View style={{ width: 38 }}>
            {step > 0 && step < TOTAL - 1 && (
              <Pressable onPress={back} style={styles.backBtn} hitSlop={8}><Text style={styles.backArrow}>‹</Text></Pressable>
            )}
          </View>
          <View style={styles.dots}>
            {Array.from({ length: TOTAL }).map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive, i < step && styles.dotDone]} />
            ))}
          </View>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <View style={styles.center}>
              <View style={styles.logoDot} />
              <Text style={styles.bigTitle}>Soft Focus</Text>
              <Text style={styles.lead}>A gentler way to keep your day and your basics in view. Let&apos;s set it up around you — a minute, tops.</Text>
            </View>
          )}

          {step === 1 && (
            <View>
              <Text style={styles.q}>What should we call you?</Text>
              <Text style={styles.qSub}>Just a first name is perfect — it&apos;s only used to greet you.</Text>
              <View style={styles.inputCard}>
                <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={sage.fgFaint} style={styles.input} autoFocus returnKeyType="next" onSubmitEditing={next} />
              </View>
            </View>
          )}

          {step === 2 && (
            <View>
              <Text style={styles.q}>What&apos;s your energy usually like?</Text>
              <Text style={styles.qSub}>We&apos;ll start your day matched to this — you can nudge it any time.</Text>
              <View style={{ gap: 10, marginTop: 4 }}>
                {(['high', 'mid', 'low'] as EnergyKey[]).map((k) => {
                  const on = energyPick === k;
                  return (
                    <Pressable key={k} onPress={() => setEnergyPick(k)} style={[styles.optRow, on && { borderColor: energy[k].bar, backgroundColor: energy[k].bg }]}>
                      <View style={[styles.optBar, { width: energy[k].barW, backgroundColor: energy[k].bar }]} />
                      <Text style={[styles.optLabel, { color: on ? energy[k].fg : sage.fgBody }]}>{energy[k].label}</Text>
                      {on && <Check size={18} color={energy[k].fg} strokeWidth={2.5} style={{ marginLeft: 'auto' }} />}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {step === 3 && (
            <View>
              <Text style={styles.q}>Which everyday basics should we keep gently in view?</Text>
              <Text style={styles.qSub}>Pick what applies. These become your Life routine — add, remove, or retime them later.</Text>
              <View style={{ gap: 10, marginTop: 4 }}>
                {BASICS.map((b) => {
                  const on = basics.has(b.key);
                  return (
                    <Pressable key={b.key} onPress={() => toggleBasic(b.key)} style={[styles.basicRow, on && styles.basicRowOn]}>
                      <Text style={styles.basicEmoji}>{b.emoji}</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.basicLabel}>{b.label}</Text>
                        <Text style={styles.basicSub}>{b.sub}</Text>
                      </View>
                      <View style={[styles.checkbox, { borderColor: on ? sage.primary : sage.ruleStrong, backgroundColor: on ? sage.primary : 'transparent' }]}>
                        {on && <Check size={13} color={sage.onPrimary} strokeWidth={3} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {step === 4 && (
            <View>
              <Text style={styles.q}>How should your mentor talk to you?</Text>
              <Text style={styles.qSub}>Your call, and you can switch whenever.</Text>
              <View style={{ gap: 12, marginTop: 4 }}>
                {([
                  { key: 'Gentle', title: 'Gentle', blurb: 'Soft, encouraging, no pressure. Meets you where you are.' },
                  { key: 'Direct', title: 'Direct', blurb: 'Clear and to the point. Names the next small step.' },
                ] as { key: MentorTone; title: string; blurb: string }[]).map((o) => {
                  const on = tone === o.key;
                  return (
                    <Pressable key={o.key} onPress={() => setTone(o.key)} style={[styles.toneCard, on && styles.toneCardOn]}>
                      <View style={styles.toneHead}>
                        <Text style={[styles.toneTitle, on && { color: sage.primaryDeep }]}>{o.title}</Text>
                        {on && <Check size={18} color={sage.primaryDeep} strokeWidth={2.5} />}
                      </View>
                      <Text style={styles.toneBlurb}>{o.blurb}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {step === 5 && (
            <View>
              <Text style={styles.q}>Turn on focus tracking?</Text>
              <Text style={styles.qSub}>Focus sessions use your front camera, entirely on-device, to notice when you drift and nudge you back. The video never leaves your phone.</Text>
              <View style={{ gap: 12, marginTop: 4 }}>
                {[
                  { val: true, title: 'Yes, use the camera', blurb: 'Get live focus feedback during sessions.' },
                  { val: false, title: 'Not now', blurb: 'Skip it — you can enable it later in Focus.' },
                ].map((o) => {
                  const on = focusOn === o.val;
                  return (
                    <Pressable key={String(o.val)} onPress={() => setFocusOn(o.val)} style={[styles.toneCard, on && styles.toneCardOn]}>
                      <View style={styles.toneHead}>
                        <Text style={[styles.toneTitle, on && { color: sage.primaryDeep }]}>{o.title}</Text>
                        {on && <Check size={18} color={sage.primaryDeep} strokeWidth={2.5} />}
                      </View>
                      <Text style={styles.toneBlurb}>{o.blurb}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {step === 6 && (
            <View style={styles.center}>
              <View style={styles.doneCircle}><Check size={34} color={sage.onPrimary} strokeWidth={3} /></View>
              <Text style={styles.bigTitle}>{name.trim() ? `You're all set, ${name.trim()}` : "You're all set"}</Text>
              <Text style={styles.lead}>Your day, your routine, and your mentor are tuned to you. Nothing here is fixed — reshape it any time.</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable onPress={next} disabled={saving} style={[styles.cta, saving && { opacity: 0.6 }]}>
            <Text style={text.button}>{ctaLabel}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: sage.bg },

  progressRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 4 },
  backBtn: { width: 38, height: 38, borderRadius: 14, backgroundColor: sage.surface, alignItems: 'center', justifyContent: 'center', ...shadow.soft, ...curve },
  backArrow: { fontFamily: font.headingBold, fontSize: 22, color: sage.fgSecondary, marginTop: -3 },
  dots: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: sage.ruleStrong },
  dotActive: { width: 22, backgroundColor: sage.primary },
  dotDone: { backgroundColor: sage.leafSoft },

  body: { paddingHorizontal: gutter, paddingTop: 24, paddingBottom: 24, flexGrow: 1, justifyContent: 'center' },
  center: { alignItems: 'center', paddingHorizontal: 8 },
  logoDot: { width: 64, height: 64, borderRadius: 26, backgroundColor: sage.leafSoft, marginBottom: 22 },
  bigTitle: { fontFamily: font.headingBold, fontSize: 28, color: sage.fg, textAlign: 'center' },
  lead: { fontFamily: font.body, fontSize: 14.5, lineHeight: 22, color: sage.fgSecondary, textAlign: 'center', marginTop: 12, maxWidth: 320 },

  q: { fontFamily: font.heading, fontSize: 22, lineHeight: 29, color: sage.fg },
  qSub: { fontFamily: font.body, fontSize: 13.5, lineHeight: 20, color: sage.fgSecondary, marginTop: 8, marginBottom: 18 },

  inputCard: { backgroundColor: sage.surface, borderRadius: radius.card, paddingHorizontal: 18, paddingVertical: 6, ...shadow.card, ...curve, marginTop: 4 },
  input: { fontFamily: font.heading, fontSize: 18, color: sage.fgBody, paddingVertical: 14 },

  optRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: sage.surface, borderRadius: radius.card, borderWidth: 2, borderColor: 'transparent', paddingVertical: 18, paddingHorizontal: 18, ...shadow.soft, ...curve },
  optBar: { height: 6, borderRadius: 3 },
  optLabel: { fontFamily: font.heading, fontSize: 16 },

  basicRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: sage.surface, borderRadius: radius.card, borderWidth: 2, borderColor: 'transparent', paddingVertical: 14, paddingHorizontal: 16, ...shadow.soft, ...curve },
  basicRowOn: { borderColor: sage.leafSoft, backgroundColor: sage.fillGreenAlt },
  basicEmoji: { fontSize: 22 },
  basicLabel: { fontFamily: font.heading, fontSize: 15.5, color: sage.fgBody },
  basicSub: { fontFamily: font.body, fontSize: 12, color: sage.fgMuted, marginTop: 2 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },

  toneCard: { backgroundColor: sage.surface, borderRadius: radius.card, borderWidth: 2, borderColor: 'transparent', padding: 18, ...shadow.soft, ...curve },
  toneCardOn: { borderColor: sage.leafSoft, backgroundColor: sage.fillGreenAlt },
  toneHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toneTitle: { fontFamily: font.heading, fontSize: 17, color: sage.fgBody },
  toneBlurb: { fontFamily: font.body, fontSize: 13, lineHeight: 19, color: sage.fgSecondary, marginTop: 6 },

  doneCircle: { width: 72, height: 72, borderRadius: 30, backgroundColor: sage.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 22, ...shadow.card },

  footer: { paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 10 },
  cta: { borderRadius: 22, paddingVertical: 17, alignItems: 'center', backgroundColor: sage.primary, ...shadow.card, ...curve },
});
