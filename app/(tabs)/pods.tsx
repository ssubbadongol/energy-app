/**
 * Pods tab.
 *
 * Pro-gated. Rooms are found by a Cloud Function (a client that could open its
 * own pod could open a thousand); messages are read and written straight
 * against Firestore under rules, so the room feels live.
 *
 * The moderation states are visible on purpose. A message that is still being
 * checked says so, and a message that was removed leaves a marker rather than
 * a hole — a room where posts silently vanish is a room nobody trusts.
 */
import { Send } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { SageBackground } from '@/components/sage/Background';
import { ProGate } from '@/components/pro/ProGate';
import { useEntitlement } from '@/components/pro/EntitlementProvider';
import { SupportSheet } from '@/components/support/SupportSheet';
import { curve, font, gutter, radius, sage, shadow, text } from '@/theme/sage';
import {
  POD_MAX_MEMBERS,
  POD_SUPPORT_STYLES,
  POD_TOPICS,
  PodUnavailable,
  formatExpiry,
  getCurrentMembership,
  joinPod,
  leavePod,
  listOpenPods,
  sendPodMessage,
  subscribeToPodMessages,
  type Pod,
  type PodDuration,
  type PodMessage,
} from '../podService';
import { subscribeToSupportPrompts, type SupportPrompt } from '../supportService';

/** Seat swatches, so a room reads as populated at a glance. */
const SEAT_COLORS = ['#cfe3d6', '#e3dcc9', '#d3dfe8', '#e6d6d4', '#d9d3e4'];

export default function PodsScreen() {
  return (
    <ProGate
      feature="Pods"
      headline="Three to five people, going through the same week"
      blurb="Small anonymous rooms that close on their own. No names, no profiles, no history to keep up with — just people who get it, for as long as you need them."
      bullets={[
        'Rooms of three to five, matched on what you are actually struggling with',
        'Fully anonymous — nobody sees your name or anything from your account',
        'Closes itself after 24 hours or a week, and takes the messages with it',
        'Checked for abuse automatically, so the room stays safe to be honest in',
      ]}
    >
      <PodsFeature />
    </ProGate>
  );
}

function PodsFeature() {
  const [membership, setMembership] = useState<{ podId: string; alias: string; pod: Pod } | null>(null);
  const [loading, setLoading] = useState(true);
  const [supportPrompt, setSupportPrompt] = useState<SupportPrompt | null>(null);

  useEffect(() => {
    let alive = true;
    getCurrentMembership().then((m) => {
      if (!alive) return;
      setMembership(m);
      setLoading(false);
    });

    // The crisis-resource offer is global to the tab: it must reach the sender
    // even if they have already backed out of the room they wrote in.
    const unsubscribe = subscribeToSupportPrompts((p) => {
      if (alive) setSupportPrompt(p);
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <SageBackground />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={sage.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      {membership ? (
        <PodRoom
          podId={membership.podId}
          alias={membership.alias}
          pod={membership.pod}
          onLeave={() => setMembership(null)}
        />
      ) : (
        <PodBrowser onJoined={setMembership} />
      )}
      <SupportSheet prompt={supportPrompt} onClose={() => setSupportPrompt(null)} />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Browsing and matchmaking
 * ------------------------------------------------------------------ */

function PodBrowser({ onJoined }: { onJoined: (m: { podId: string; alias: string; pod: Pod }) => void }) {
  const { refresh } = useEntitlement();
  const [pods, setPods] = useState<Pod[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState(false);
  const [topic, setTopic] = useState<string>(POD_TOPICS[0]);
  const [style, setStyle] = useState<string>(POD_SUPPORT_STYLES[0]);
  const [duration, setDuration] = useState<PodDuration>('24h');

  const load = useCallback(async () => {
    try {
      setPods(await listOpenPods());
    } catch (err) {
      console.warn('[pods] Could not list pods', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const join = useCallback(
    async (chosenTopic: string) => {
      if (joining) return;
      setJoining(true);
      try {
        const result = await joinPod(chosenTopic, style, duration);
        onJoined({
          podId: result.podId,
          alias: result.alias,
          pod: {
            id: result.podId,
            topic: result.topic,
            supportStyle: result.supportStyle,
            duration: result.duration,
            memberCount: result.memberCount,
            expiresAt: new Date(result.expiresAt),
            isActive: true,
          },
        });
      } catch (err) {
        if (err instanceof PodUnavailable && err.reason === 'needs_pro') {
          await refresh();
          router.push('/paywall');
        } else {
          Alert.alert('Could not join', err instanceof Error ? err.message : 'Please try again.');
        }
      } finally {
        setJoining(false);
      }
    },
    [joining, style, duration, onJoined, refresh],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <SageBackground />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={sage.primary}
          />
        }
      >
        <View style={{ paddingVertical: 8, paddingBottom: 16 }}>
          <Text style={text.title}>Pods</Text>
          <Text style={[text.body, { marginTop: 6, maxWidth: 260 }]}>
            Small anonymous rooms. They close on their own, so nothing lingers.
          </Text>
        </View>

        {/* Matchmaking preferences */}
        <View style={styles.panel}>
          <Text style={text.label}>What&apos;s going on</Text>
          <View style={styles.chipWrap}>
            {POD_TOPICS.map((t) => (
              <Chip key={t} label={t} active={topic === t} onPress={() => setTopic(t)} />
            ))}
          </View>

          <Text style={[text.label, { marginTop: 16 }]}>What would help</Text>
          <View style={styles.chipWrap}>
            {POD_SUPPORT_STYLES.map((s) => (
              <Chip key={s} label={s} active={style === s} onPress={() => setStyle(s)} />
            ))}
          </View>

          <Text style={[text.label, { marginTop: 16 }]}>How long</Text>
          <View style={styles.chipWrap}>
            <Chip label="24 hours" active={duration === '24h'} onPress={() => setDuration('24h')} />
            <Chip label="7 days" active={duration === '7d'} onPress={() => setDuration('7d')} />
          </View>

          <Pressable
            style={[styles.cta, joining && { opacity: 0.6 }]}
            disabled={joining}
            onPress={() => join(topic)}
          >
            {joining ? (
              <ActivityIndicator color={sage.onPrimary} />
            ) : (
              <Text style={text.button}>Find me a pod</Text>
            )}
          </Pressable>
          <Text style={styles.hint}>
            We&apos;ll put you in a room that already has people in it, or open a new one if there isn&apos;t
            a fit.
          </Text>
        </View>

        {/* Open rooms */}
        <Text style={[text.label, { marginTop: 26, marginBottom: 10 }]}>Rooms with space</Text>

        {loading ? (
          <ActivityIndicator color={sage.primary} style={{ marginTop: 20 }} />
        ) : pods.length === 0 ? (
          <Text style={[text.body, { paddingVertical: 8 }]}>
            Nothing open right now. Tap “Find me a pod” and you&apos;ll start one.
          </Text>
        ) : (
          pods.map((p) => {
            const full = p.memberCount >= POD_MAX_MEMBERS;
            return (
              <View key={p.id} style={styles.podCard}>
                <View style={[styles.accent, { backgroundColor: SEAT_COLORS[p.topic.length % SEAT_COLORS.length] }]} />
                <View style={styles.podTop}>
                  <Text style={[text.h2, { flex: 1 }]}>{p.topic}</Text>
                  <Text style={styles.podExpiry}>{formatExpiry(p.expiresAt)}</Text>
                </View>
                <Text style={[text.body, { marginTop: 7, marginBottom: 14 }]}>{p.supportStyle} · {p.duration} room</Text>
                <View style={styles.podFoot}>
                  <View style={{ flexDirection: 'row' }}>
                    {Array.from({ length: Math.min(p.memberCount, POD_MAX_MEMBERS) }).map((_, i) => (
                      <View
                        key={i}
                        style={[styles.seat, { backgroundColor: SEAT_COLORS[i], marginLeft: i === 0 ? 0 : -7 }]}
                      />
                    ))}
                  </View>
                  <Text style={[text.meta, { marginLeft: 4 }]}>
                    {p.memberCount} of {POD_MAX_MEMBERS}
                  </Text>
                  <Pressable
                    onPress={() => !full && join(p.topic)}
                    disabled={full || joining}
                    style={[styles.joinBtn, full && { opacity: 0.5 }]}
                  >
                    <Text style={{ fontFamily: font.heading, fontSize: 13, color: sage.primaryInk }}>
                      {full ? 'Full' : 'Join'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * The room
 * ------------------------------------------------------------------ */

function PodRoom({
  podId,
  alias,
  pod,
  onLeave,
}: {
  podId: string;
  alias: string;
  pod: Pod;
  onLeave: () => void;
}) {
  const [messages, setMessages] = useState<PodMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const unsubscribe = subscribeToPodMessages(podId, setMessages);
    return unsubscribe;
  }, [podId]);

  const send = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    setDraft('');
    setSending(true);
    try {
      await sendPodMessage(podId, trimmed);
    } catch (err) {
      Alert.alert('Not sent', err instanceof Error ? err.message : 'Please try again.');
      setDraft(trimmed);
    } finally {
      setSending(false);
    }
  }, [draft, sending, podId]);

  const confirmLeave = useCallback(() => {
    Alert.alert('Leave this pod?', 'You can find another one any time. The room stays open for the others.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await leavePod(podId);
          } catch {
            // Leaving locally is the important part — a failed server call
            // should not trap someone in a room they want out of.
          }
          onLeave();
        },
      },
    ]);
  }, [podId, onLeave]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <SageBackground />

      <View style={styles.chatHeader}>
        <Pressable onPress={confirmLeave} style={styles.iconBtn} hitSlop={6}>
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.chatTitle} numberOfLines={1}>
            {pod.topic}
          </Text>
          <Text style={text.meta}>
            you&apos;re {alias} · {pod.memberCount} here
          </Text>
        </View>
        <Text style={styles.expiryPill}>{formatExpiry(pod.expiresAt)}</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.privacyNote}>
            Names are hidden. Everything here disappears when the pod closes.
          </Text>

          {messages.map((m) => {
            if (m.type === 'system') {
              return (
                <Text key={m.id} style={styles.systemMsg}>
                  {m.text}
                </Text>
              );
            }

            if (m.hidden) {
              return (
                <Text key={m.id} style={styles.removedMsg}>
                  A message was removed for breaking the pod guidelines.
                </Text>
              );
            }

            return (
              <View key={m.id} style={[styles.row, { justifyContent: m.mine ? 'flex-end' : 'flex-start' }]}>
                <View style={{ maxWidth: '80%' }}>
                  <Text style={[styles.who, { textAlign: m.mine ? 'right' : 'left' }]}>
                    {m.mine ? 'You' : m.alias ?? 'Someone'}
                  </Text>
                  <View style={[styles.bubble, m.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[text.message, { fontSize: 14, color: m.mine ? sage.onPrimary : sage.fgBody }]}>
                      {m.text}
                    </Text>
                  </View>
                  {/* Only the author sees their own message still being checked. */}
                  {m.mine && m.moderationStatus === 'pending' ? (
                    <Text style={styles.checking}>checking…</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.inputBar}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Share with the pod"
              placeholderTextColor={sage.fgFaint}
              style={styles.input}
              multiline
              maxLength={500}
              editable={!sending}
            />
            <Pressable
              onPress={send}
              disabled={!draft.trim() || sending}
              style={[styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.5 }]}
              hitSlop={6}
            >
              <Send size={18} color={sage.onPrimary} strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: sage.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: gutter, paddingTop: 4, paddingBottom: 32 },

  panel: {
    backgroundColor: sage.surface,
    borderRadius: radius.card,
    padding: 18,
    ...shadow.card,
    ...curve,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    backgroundColor: sage.fill,
    borderRadius: 13,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...curve,
  },
  chipActive: { backgroundColor: sage.fillGreen, borderColor: sage.primary },
  chipText: { fontFamily: font.ui, fontSize: 12.5, color: sage.fgSecondary },
  chipTextActive: { color: sage.primaryInk },

  cta: {
    backgroundColor: sage.primary,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
    ...curve,
  },
  hint: {
    fontFamily: font.body,
    fontSize: 11.5,
    lineHeight: 17,
    color: sage.fgMuted,
    textAlign: 'center',
    marginTop: 10,
  },

  podCard: {
    backgroundColor: sage.surface,
    borderRadius: radius.card,
    padding: 18,
    marginBottom: 12,
    position: 'relative',
    overflow: 'hidden',
    ...shadow.card,
    ...curve,
  },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  podTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  podExpiry: {
    fontFamily: font.bodySemi,
    fontSize: 10.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: sage.primaryInk,
    backgroundColor: sage.fillGreenAlt,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
    overflow: 'hidden',
  },
  podFoot: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  seat: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: sage.surface },
  joinBtn: {
    marginLeft: 'auto',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: sage.fillGreenAlt,
    ...curve,
  },

  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: sage.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.soft,
    ...curve,
  },
  backArrow: { fontFamily: font.headingBold, fontSize: 22, color: sage.fgSecondary, marginTop: -3 },
  chatTitle: { fontFamily: font.heading, fontSize: 16, color: sage.fgBody },
  expiryPill: {
    fontFamily: font.bodySemi,
    fontSize: 10.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: sage.clay,
    backgroundColor: sage.clayFill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    overflow: 'hidden',
  },

  messages: { padding: 20, paddingTop: 4, gap: 11 },
  privacyNote: {
    fontFamily: font.body,
    fontSize: 11.5,
    color: sage.fgFaint,
    textAlign: 'center',
    paddingVertical: 6,
  },
  systemMsg: {
    fontFamily: font.body,
    fontSize: 11.5,
    color: sage.fgFaint,
    textAlign: 'center',
    paddingVertical: 2,
  },
  removedMsg: {
    fontFamily: font.body,
    fontSize: 11.5,
    fontStyle: 'italic',
    color: sage.fgMuted,
    textAlign: 'center',
    backgroundColor: sage.fill,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row' },
  who: { fontFamily: font.bodySemi, fontSize: 11, color: sage.fgFaint, marginBottom: 4, marginHorizontal: 6 },
  bubble: { paddingVertical: 12, paddingHorizontal: 15, ...shadow.soft },
  bubbleMine: { backgroundColor: sage.primary, borderRadius: 20, borderBottomRightRadius: 6 },
  bubbleTheirs: { backgroundColor: sage.surface, borderRadius: 20, borderBottomLeftRadius: 6 },
  checking: { fontFamily: font.body, fontSize: 10.5, color: sage.fgFaint, textAlign: 'right', marginTop: 3, marginRight: 6 },

  footer: { paddingHorizontal: 20, paddingBottom: 14, paddingTop: 4 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: sage.surface,
    borderRadius: 22,
    paddingVertical: 8,
    paddingLeft: 18,
    paddingRight: 8,
    ...shadow.card,
    ...curve,
  },
  input: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 14.5,
    color: sage.fgBody,
    maxHeight: 100,
    paddingVertical: 2,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: sage.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...curve,
  },
});
