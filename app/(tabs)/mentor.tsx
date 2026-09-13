/**
 * Mentor tab.
 *
 * Pro-gated, and every turn goes through the `mentorChat` Cloud Function —
 * there is no model call, no API key and no prompt on the device.
 *
 * Two things this screen does beyond rendering a transcript:
 *
 *   - It shows a receipt when the mentor touches the user's tasks. An AI that
 *     silently edits your to-do list is unnerving; one that says "Added
 *     'Finish lab report'" underneath its reply is a collaborator.
 *   - It handles the degraded states honestly. Hitting a daily cap or a paused
 *     mentor reads as a message from the mentor, not an error dialog.
 */
import { Send } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { curve, font, gutter, radius, sage, shadow, text } from '@/theme/sage';
import {
  MentorUnavailable,
  generateWelcomeMessage,
  getMentorStatus,
  sendMessageToMentor,
  subscribeToConversation,
  type MentorMessage,
  type MentorUsage,
  type TaskEffect,
} from '../aiMentorService';
import { syncTasksFromFirestore } from '../taskStorage';
import { syncProfileToFirestore } from '../userDoc';
import { loadUserProfile, type MentorTone } from '../userProfileStorage';

const QUICK_PROMPTS = ['I can’t start', 'Break this into steps', 'I need a slower day'];

export default function MentorScreen() {
  return (
    <ProGate
      feature="Mentor"
      headline="A mentor who already knows how you work"
      blurb="Talk it through with someone who remembers your last conversation, adapts to how you asked to be spoken to, and can move things on your task list while you talk."
      bullets={[
        'Remembers your conversation, so you never start from scratch',
        'Shaped by what you told us at setup — ADHD, anxiety, gentle or direct',
        'Adds, finishes and clears tasks for you, mid-sentence',
        'Fifty messages a day, no throttling in between',
      ]}
    >
      <MentorChat />
    </ProGate>
  );
}

function MentorChat() {
  const { refresh } = useEntitlement();
  const [messages, setMessages] = useState<MentorMessage[]>([]);
  const [welcome, setWelcome] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [tone, setTone] = useState<MentorTone>('Gentle');
  const [usage, setUsage] = useState<MentorUsage | null>(null);
  const [paused, setPaused] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  /** Rendered immediately so the user's own message never lags the round trip. */
  const [pending, setPending] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    let alive = true;

    loadUserProfile().then((p) => {
      if (alive) setTone(p.mentorTone);
      // Keep the server's copy of name/tone current — it is what personalises
      // the system prompt, and the function never sees the device.
      void syncProfileToFirestore();
    });

    getMentorStatus()
      .then((status) => {
        if (!alive) return;
        setUsage(status.usage);
        setPaused(!status.mentorEnabled);
        if (!status.mentorEnabled && status.reason) setBanner(status.reason);
      })
      .catch(() => undefined);

    const unsubscribe = subscribeToConversation(
      (history) => {
        if (!alive) return;
        setMessages(history);
        // Drop the optimistic bubble only once the persisted copy of that same
        // message has arrived. Clearing on any snapshot would briefly blank
        // what the user just typed if an unrelated write landed first.
        setPending((draftText) =>
          draftText && history.some((m) => m.role === 'user' && m.text === draftText) ? null : draftText,
        );
        setInitializing(false);
      },
      () => {
        if (alive) setInitializing(false);
      },
    );

    generateWelcomeMessage().then((w) => {
      if (alive) setWelcome(w);
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const message = raw.trim();
      if (!message || sending) return;

      setDraft('');
      setPending(message);
      setSending(true);
      setBanner(null);

      try {
        const turn = await sendMessageToMentor(message);
        setUsage(turn.usage);
        setPaused(turn.degraded === 'mentor_disabled');

        // The mentor wrote to Firestore under our uid; pull those changes into
        // the local store so the Today tab agrees with what it just said.
        if (turn.tasksChanged) {
          await syncTasksFromFirestore();
        }
        // The listener delivers the persisted turn, so nothing is appended here.
      } catch (err) {
        // Hand the message back rather than losing what they wrote.
        setPending(null);
        setDraft((current) => (current.trim() ? current : message));

        if (err instanceof MentorUnavailable) {
          if (err.reason === 'needs_pro') {
            // Entitlement changed under us — re-check and let the gate take over.
            await refresh();
            router.push('/paywall');
            return;
          }
          setBanner(err.message);
        } else {
          setBanner('Something went wrong. Please try again.');
        }
      } finally {
        setSending(false);
      }
    },
    [sending, refresh],
  );

  const remaining = usage ? Math.max(0, usage.limit - usage.used) : null;
  const showWelcome = !initializing && messages.length === 0 && welcome !== null;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <SageBackground />

      <View style={styles.header}>
        <View style={styles.avatar}>
          <View style={styles.avatarDot} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Mentor</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, paused && { backgroundColor: sage.clay }]} />
            <Text style={text.meta}>
              {paused ? 'resting' : `${tone} mode`}
              {remaining !== null && remaining <= 10 ? ` · ${remaining} left today` : ''}
            </Text>
          </View>
        </View>
      </View>

      {banner ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
        </View>
      ) : null}

      {initializing ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={sage.primary} />
          <Text style={[text.body, { marginTop: 12 }]}>Waking your mentor…</Text>
        </View>
      ) : (
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
            {showWelcome ? <Bubble mine={false} body={welcome!} /> : null}

            {messages.map((m) => (
              <View key={m.id} style={{ gap: 6 }}>
                <Bubble mine={m.role === 'user'} body={m.text} />
                {m.toolEffects.length > 0 ? <TaskReceipt effects={m.toolEffects} /> : null}
              </View>
            ))}

            {pending ? <Bubble mine body={pending} /> : null}

            {sending ? (
              <View style={styles.row}>
                <View style={[styles.bubble, styles.bubbleTheirs, styles.typing]}>
                  <View style={styles.typingDot} />
                  <View style={styles.typingDot} />
                  <View style={styles.typingDot} />
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            {messages.length === 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: 10 }}
              >
                {QUICK_PROMPTS.map((p) => (
                  <Pressable key={p} onPress={() => send(p)} disabled={sending}>
                    <Text style={styles.prompt}>{p}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            <View style={styles.inputBar}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Say anything, even messy"
                placeholderTextColor={sage.fgFaint}
                style={styles.input}
                multiline
                maxLength={2000}
                editable={!sending}
              />
              <Pressable
                onPress={() => send(draft)}
                disabled={!draft.trim() || sending}
                style={[styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.5 }]}
                hitSlop={6}
              >
                <Send size={18} color={sage.onPrimary} strokeWidth={2.5} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function Bubble({ mine, body }: { mine: boolean; body: string }) {
  return (
    <View style={[styles.row, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={[text.message, { color: mine ? sage.onPrimary : sage.fgBody }]}>{body}</Text>
      </View>
    </View>
  );
}

/**
 * What the mentor did to the task list this turn.
 *
 * `list_tasks` is skipped — reading is not an action, and confirming it would
 * be noise on almost every turn.
 */
function TaskReceipt({ effects }: { effects: TaskEffect[] }) {
  const shown = effects.filter((e) => e.tool !== 'list_tasks');
  if (shown.length === 0) return null;

  return (
    <View style={styles.receipt}>
      {shown.map((e, i) => (
        <View key={`${e.tool}-${i}`} style={styles.receiptRow}>
          <Text style={[styles.receiptMark, !e.ok && { color: sage.clay }]}>{e.ok ? '✓' : '!'}</Text>
          <Text style={[styles.receiptText, !e.ok && { color: sage.clay }]}>{e.summary}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: sage.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: gutter,
    paddingTop: 10,
    paddingBottom: 16,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 18,
    backgroundColor: sage.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.soft,
    ...curve,
  },
  avatarDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: sage.leafSoft },
  headerTitle: { fontFamily: font.heading, fontSize: 17, color: sage.fgBody },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: sage.leaf },

  banner: {
    marginHorizontal: gutter,
    marginBottom: 10,
    backgroundColor: sage.clayFill,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  bannerText: { fontFamily: font.body, fontSize: 12.5, lineHeight: 19, color: sage.clay },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  messages: { padding: 20, paddingTop: 4, gap: 12 },
  row: { flexDirection: 'row' },
  bubble: { maxWidth: '80%', paddingVertical: 13, paddingHorizontal: 16, ...shadow.soft },
  bubbleMine: { backgroundColor: sage.primary, borderRadius: 22, borderBottomRightRadius: 8 },
  bubbleTheirs: { backgroundColor: sage.surface, borderRadius: 22, borderBottomLeftRadius: 8 },
  typing: { flexDirection: 'row', gap: 5, paddingVertical: 16 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: sage.leafSoft },

  receipt: {
    alignSelf: 'flex-start',
    maxWidth: '80%',
    backgroundColor: sage.fillGreen,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 13,
    gap: 4,
    ...curve,
  },
  receiptRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  receiptMark: { fontFamily: font.bodyBold, fontSize: 12, color: sage.primaryDeep, lineHeight: 17 },
  receiptText: { flex: 1, fontFamily: font.body, fontSize: 12.5, lineHeight: 17, color: sage.primaryInk },

  footer: { paddingHorizontal: 20, paddingBottom: 14, paddingTop: 4 },
  prompt: {
    borderWidth: 1,
    borderColor: sage.ruleStrong,
    backgroundColor: sage.surface,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 14,
    fontFamily: font.ui,
    fontSize: 12.5,
    color: sage.primaryInk,
    overflow: 'hidden',
  },
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
