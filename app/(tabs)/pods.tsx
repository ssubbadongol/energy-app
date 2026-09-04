import { Send } from 'lucide-react-native';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SageBackground } from '@/components/sage/Background';
import { curve, font, gutter, radius, sage, shadow, text } from '@/theme/sage';

/* ------------------------------------------------------------------ *
 * Local placeholder state (UI-first — wire to podService later)
 * ------------------------------------------------------------------ */

interface Pod {
  id: string;
  name: string;
  blurb: string;
  expiry: string;
  count: string;
  seats: string[];
  joined: boolean;
  accent: string;
}

interface PodMsg { id: number; who: string; from: 'o' | 'u'; text: string }

const PODS: Pod[] = [
  { id: 'p1', name: 'Quiet co-study, cameras off', blurb: 'Four people working in parallel. Check-in every 25 minutes, no talking required.', expiry: '7d', count: '4 of 5', seats: ['#cfe3d6', '#e3dcc9', '#d3dfe8', '#e6d6d4'], joined: true, accent: '#a8cbb6' },
  { id: 'p2', name: 'Executive dysfunction corner', blurb: 'For the days where starting is the hard part. Post one sentence about what you are avoiding.', expiry: '24h', count: '3 of 5', seats: ['#e3dcc9', '#cfe3d6', '#d9d3e4'], joined: false, accent: '#dcc9a8' },
  { id: 'p3', name: 'Late-night thesis pod', blurb: 'Slow, quiet, mostly typing sounds. Closes at 6am.', expiry: '24h', count: '5 of 5', seats: ['#d3dfe8', '#cfe3d6', '#e6d6d4', '#e3dcc9', '#d9d3e4'], joined: false, accent: '#a8bfd4' },
  { id: 'p4', name: 'Sensory reset', blurb: 'Share what helped today. Lights, sound, texture, weather.', expiry: '7d', count: '2 of 4', seats: ['#e6d6d4', '#cfe3d6'], joined: false, accent: '#d4b0ab' },
];

const SEED_MSGS: Record<string, PodMsg[]> = {
  p1: [
    { id: 1, who: 'Heron', from: 'o', text: 'Starting a 25. Working on lab write-up.' },
    { id: 2, who: 'Moss', from: 'o', text: 'Same. Timer set, phone in the drawer.' },
    { id: 3, who: 'You', from: 'u', text: 'Joining late but joining.' },
    { id: 4, who: 'Heron', from: 'o', text: 'Late is fine. Twelve minutes left on this one.' },
  ],
  p2: [{ id: 1, who: 'Wren', from: 'o', text: 'Avoiding: the email. It has been four days.' }],
  p3: [{ id: 1, who: 'Ash', from: 'o', text: 'Chapter three, paragraph one. Again.' }],
  p4: [{ id: 1, who: 'Fern', from: 'o', text: 'Warm lamp instead of the ceiling light. Big difference.' }],
};

export default function PodsScreen() {
  const [pods, setPods] = useState<Pod[]>(PODS);
  const [activePod, setActivePod] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Record<string, PodMsg[]>>(SEED_MSGS);
  const [draft, setDraft] = useState('');

  const open = (id: string) => {
    setPods((ps) => ps.map((p) => (p.id === id ? { ...p, joined: true } : p)));
    setActivePod(id);
  };
  const send = () => {
    const t = draft.trim();
    if (!t || !activePod) return;
    setDraft('');
    setMsgs((m) => ({ ...m, [activePod]: [...(m[activePod] || []), { id: Date.now(), who: 'You', from: 'u', text: t }] }));
  };

  const pod = pods.find((p) => p.id === activePod) || null;

  if (pod) {
    const podMsgs = msgs[pod.id] || [];
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <SageBackground />
        <View style={styles.chatHeader}>
          <Pressable onPress={() => setActivePod(null)} style={[styles.iconBtn, { backgroundColor: sage.surface }]} hitSlop={6}>
            <Text style={styles.backArrow}>‹</Text>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.chatTitle} numberOfLines={1}>{pod.name}</Text>
            <Text style={text.meta}>{pod.count} here now</Text>
          </View>
          <Text style={styles.expiryPill}>{pod.expiry === '24h' ? 'closes in 9h' : 'closes in 4d'}</Text>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.messages} showsVerticalScrollIndicator={false}>
            <Text style={styles.privacyNote}>Names are hidden. Nothing is saved after the pod closes.</Text>
            {podMsgs.map((m) => {
              const mine = m.from === 'u';
              return (
                <View key={m.id} style={[styles.row, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
                  <View style={{ maxWidth: '80%' }}>
                    <Text style={[styles.who, { textAlign: mine ? 'right' : 'left' }]}>{m.who}</Text>
                    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                      <Text style={[text.message, { fontSize: 14, color: mine ? sage.onPrimary : sage.fgBody }]}>{m.text}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.inputBar}>
              <TextInput value={draft} onChangeText={setDraft} placeholder="Share with the pod" placeholderTextColor={sage.fgFaint} style={styles.input} multiline maxLength={500} onSubmitEditing={send} />
              <Pressable onPress={send} disabled={!draft.trim()} style={[styles.sendBtn, !draft.trim() && { opacity: 0.5 }]} hitSlop={6}>
                <Send size={18} color={sage.onPrimary} strokeWidth={2.5} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <SageBackground />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={{ paddingVertical: 8, paddingBottom: 16 }}>
          <Text style={text.title}>Pods</Text>
          <Text style={[text.body, { marginTop: 6, maxWidth: 250 }]}>Small anonymous rooms. They close on their own, so nothing lingers.</Text>
        </View>

        {pods.map((p) => {
          const full = p.count.startsWith('5 of 5') && !p.joined;
          return (
            <View key={p.id} style={styles.podCard}>
              <View style={[styles.accent, { backgroundColor: p.accent }]} />
              <View style={styles.podTop}>
                <Text style={[text.h2, { flex: 1 }]}>{p.name}</Text>
                <Text style={styles.podExpiry}>{p.expiry}</Text>
              </View>
              <Text style={[text.body, { marginTop: 7, marginBottom: 14 }]}>{p.blurb}</Text>
              <View style={styles.podFoot}>
                <View style={{ flexDirection: 'row' }}>
                  {p.seats.map((bg, i) => (
                    <View key={i} style={[styles.seat, { backgroundColor: bg, marginLeft: i === 0 ? 0 : -7 }]} />
                  ))}
                </View>
                <Text style={[text.meta, { marginLeft: 4 }]}>{p.count}</Text>
                <Pressable
                  onPress={() => !full && open(p.id)}
                  disabled={full}
                  style={[styles.joinBtn, p.joined ? { backgroundColor: sage.primary } : { backgroundColor: sage.fillGreenAlt }, full && { opacity: 0.5 }]}
                >
                  <Text style={{ fontFamily: font.heading, fontSize: 13, color: p.joined ? sage.onPrimary : sage.primaryInk }}>
                    {p.joined ? 'Open' : full ? 'Full' : 'Join'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: sage.bg },
  scroll: { paddingHorizontal: gutter, paddingTop: 4, paddingBottom: 32 },

  podCard: { backgroundColor: sage.surface, borderRadius: radius.card, padding: 18, marginBottom: 12, position: 'relative', overflow: 'hidden', ...shadow.card, ...curve },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  podTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  podExpiry: { fontFamily: font.bodySemi, fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: sage.primaryInk, backgroundColor: sage.fillGreenAlt, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9, overflow: 'hidden' },
  podFoot: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  seat: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: sage.surface },
  joinBtn: { marginLeft: 'auto', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 20, ...curve },

  // chat
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 },
  iconBtn: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center', ...shadow.soft, ...curve },
  backArrow: { fontFamily: font.headingBold, fontSize: 22, color: sage.fgSecondary, marginTop: -3 },
  chatTitle: { fontFamily: font.heading, fontSize: 16, color: sage.fgBody },
  expiryPill: { fontFamily: font.bodySemi, fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: sage.clay, backgroundColor: sage.clayFill, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, overflow: 'hidden' },

  messages: { padding: 20, paddingTop: 4, gap: 11 },
  privacyNote: { fontFamily: font.body, fontSize: 11.5, color: sage.fgFaint, textAlign: 'center', paddingVertical: 6 },
  row: { flexDirection: 'row' },
  who: { fontFamily: font.bodySemi, fontSize: 11, color: sage.fgFaint, marginBottom: 4, marginHorizontal: 6 },
  bubble: { paddingVertical: 12, paddingHorizontal: 15, ...shadow.soft },
  bubbleMine: { backgroundColor: sage.primary, borderRadius: 20, borderBottomRightRadius: 6 },
  bubbleTheirs: { backgroundColor: sage.surface, borderRadius: 20, borderBottomLeftRadius: 6 },

  footer: { paddingHorizontal: 20, paddingBottom: 14, paddingTop: 4 },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: sage.surface, borderRadius: 22, paddingVertical: 8, paddingLeft: 18, paddingRight: 8, ...shadow.card, ...curve },
  input: { flex: 1, fontFamily: font.body, fontSize: 14.5, color: sage.fgBody, maxHeight: 100, paddingVertical: 2 },
  sendBtn: { width: 40, height: 40, borderRadius: 15, backgroundColor: sage.primary, alignItems: 'center', justifyContent: 'center', ...curve },
});
