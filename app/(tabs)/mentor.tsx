import { Send } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateWelcomeMessage, getUserProfile, loadConversationHistory, saveMessage, sendMessageToMentor } from '../aiMentorService';
import { curve, font, gutter, sage, shadow, text } from '@/theme/sage';

interface AIChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: any;
}

const QUICK_PROMPTS = ['I can’t start', 'Break this into steps', 'I need a slower day'];

/**
 * Mentor tab — the AI mentor chat, styled to the sage redesign.
 * Wiring to aiMentorService is preserved; the UI follows the Claude Design mockup.
 */
export default function MentorScreen() {
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    initialize();
  }, []);

  const initialize = async () => {
    try {
      setInitializing(true);
      const profile = await getUserProfile();
      setUserProfile(profile);
      const history = await loadConversationHistory();
      if (history.length === 0) {
        setMessages([{ id: 'welcome-' + Date.now(), role: 'model', text: generateWelcomeMessage(profile), timestamp: new Date() }]);
      } else {
        setMessages(history);
      }
    } catch (error) {
      console.error('Error initializing AI mentor:', error);
    } finally {
      setInitializing(false);
    }
  };

  const send = async (raw: string) => {
    const userMsg = raw.trim();
    if (!userMsg) return;
    setDraft('');
    const userMessage: AIChatMessage = { id: 'user-' + Date.now(), role: 'user', text: userMsg, timestamp: new Date() };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    try {
      await saveMessage('user', userMsg);
      const aiResponse = await sendMessageToMentor(userMsg, messages, userProfile);
      setMessages((prev) => [...prev, { id: 'model-' + Date.now(), role: 'model', text: aiResponse, timestamp: new Date() }]);
      await saveMessage('model', aiResponse);
    } catch (error: any) {
      console.error('Error sending AI message:', error);
      Alert.alert('Error', error.message || 'Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const clearChat = async () => {
    setMessages([{ id: 'welcome-' + Date.now(), role: 'model', text: 'Fresh start. What is on your mind?', timestamp: new Date() }]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.tintBand} pointerEvents="none" />

      {/* header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <View style={styles.avatarDot} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Mentor</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={text.meta}>Gentle mode · always here</Text>
          </View>
        </View>
        <Pressable onPress={clearChat} style={styles.newBtn} hitSlop={6}><Text style={styles.newBtnText}>New</Text></Pressable>
      </View>

      {initializing ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={sage.primary} />
          <Text style={[text.body, { marginTop: 12 }]}>Waking your mentor…</Text>
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.messages} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })} showsVerticalScrollIndicator={false}>
            {messages.map((m) => {
              const mine = m.role === 'user';
              return (
                <View key={m.id} style={[styles.row, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[text.message, { color: mine ? sage.onPrimary : sage.fgBody }]}>{m.text}</Text>
                  </View>
                </View>
              );
            })}
            {loading && (
              <View style={styles.row}>
                <View style={[styles.bubble, styles.bubbleTheirs, styles.typing]}>
                  <View style={styles.typingDot} />
                  <View style={styles.typingDot} />
                  <View style={styles.typingDot} />
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
              {QUICK_PROMPTS.map((p) => (
                <Pressable key={p} onPress={() => send(p)}><Text style={styles.prompt}>{p}</Text></Pressable>
              ))}
            </ScrollView>
            <View style={styles.inputBar}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Say anything, even messy"
                placeholderTextColor={sage.fgFaint}
                style={styles.input}
                multiline
                maxLength={500}
                onSubmitEditing={() => send(draft)}
              />
              <Pressable onPress={() => send(draft)} disabled={!draft.trim() || loading} style={[styles.sendBtn, (!draft.trim() || loading) && { opacity: 0.5 }]} hitSlop={6}>
                <Send size={18} color={sage.onPrimary} strokeWidth={2.5} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: sage.bg },
  tintBand: { position: 'absolute', top: 0, left: 0, right: 0, height: 160, backgroundColor: sage.bgTintTop, opacity: 0.4 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: gutter, paddingTop: 10, paddingBottom: 16 },
  avatar: { width: 44, height: 44, borderRadius: 18, backgroundColor: sage.surface, alignItems: 'center', justifyContent: 'center', ...shadow.soft, ...curve },
  avatarDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: sage.leafSoft },
  headerTitle: { fontFamily: font.heading, fontSize: 17, color: sage.fgBody },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: sage.leaf },
  newBtn: { backgroundColor: sage.surface, borderRadius: 13, paddingVertical: 8, paddingHorizontal: 13, ...shadow.soft, ...curve },
  newBtnText: { fontFamily: font.heading, fontSize: 12, color: sage.fgSecondary },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  messages: { padding: 20, paddingTop: 4, gap: 12 },
  row: { flexDirection: 'row' },
  bubble: { maxWidth: '80%', paddingVertical: 13, paddingHorizontal: 16, ...shadow.soft },
  bubbleMine: { backgroundColor: sage.primary, borderRadius: 22, borderBottomRightRadius: 8 },
  bubbleTheirs: { backgroundColor: sage.surface, borderRadius: 22, borderBottomLeftRadius: 8 },
  typing: { flexDirection: 'row', gap: 5, paddingVertical: 16 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: sage.leafSoft },

  footer: { paddingHorizontal: 20, paddingBottom: 14, paddingTop: 4 },
  prompt: { borderWidth: 1, borderColor: sage.ruleStrong, backgroundColor: sage.surface, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 14, fontFamily: font.ui, fontSize: 12.5, color: sage.primaryInk, overflow: 'hidden' },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: sage.surface, borderRadius: 22, paddingVertical: 8, paddingLeft: 18, paddingRight: 8, ...shadow.card, ...curve },
  input: { flex: 1, fontFamily: font.body, fontSize: 14.5, color: sage.fgBody, maxHeight: 100, paddingVertical: 2 },
  sendBtn: { width: 40, height: 40, borderRadius: 15, backgroundColor: sage.primary, alignItems: 'center', justifyContent: 'center', ...curve },
});
