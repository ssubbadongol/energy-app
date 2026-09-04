import { Send, Volume2, VolumeX } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateWelcomeMessage, getUserProfile, loadConversationHistory, saveMessage, sendMessageToMentor } from '../aiMentorService';
import { playAudio, textToSpeech } from '../ttsService';

interface AIChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: any;
}

/**
 * Mentor tab — the AI mentor chat.
 *
 * Split out of the former combined "Talks" screen; this is the `'ai'` half.
 * The community pod chat now lives in its own `pods.tsx` tab.
 */
export default function MentorScreen() {
  const [aiMessages, setAiMessages] = useState<AIChatMessage[]>([]);
  const [aiMessageText, setAiMessageText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInitializing, setAiInitializing] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [ttsEnabled, setTtsEnabled] = useState(false);

  useEffect(() => {
    initializeAIChat();
  }, []);

  const initializeAIChat = async () => {
    try {
      setAiInitializing(true);
      const profile = await getUserProfile();
      setUserProfile(profile);

      const history = await loadConversationHistory();

      if (history.length === 0) {
        // First time - show welcome message
        const welcomeMsg = generateWelcomeMessage(profile);
        const welcomeMessage: AIChatMessage = {
          id: 'welcome-' + Date.now(),
          role: 'model',
          text: welcomeMsg,
          timestamp: new Date(),
        };
        setAiMessages([welcomeMessage]);
      } else {
        setAiMessages(history);
      }
    } catch (error) {
      console.error('Error initializing AI mentor:', error);
    } finally {
      setAiInitializing(false);
    }
  };

  const handleSendAIMessage = async () => {
    if (!aiMessageText.trim()) return;

    const userMsg = aiMessageText.trim();
    setAiMessageText('');

    // Add user message immediately
    const userMessage: AIChatMessage = {
      id: 'user-' + Date.now(),
      role: 'user',
      text: userMsg,
      timestamp: new Date(),
    };
    setAiMessages(prev => [...prev, userMessage]);

    setAiLoading(true);

    try {
      // Save user message
      await saveMessage('user', userMsg);

      // Get AI response
      const aiResponse = await sendMessageToMentor(userMsg, aiMessages, userProfile);

      // Add AI response
      const aiMessage: AIChatMessage = {
        id: 'model-' + Date.now(),
        role: 'model',
        text: aiResponse,
        timestamp: new Date(),
      };
      setAiMessages(prev => [...prev, aiMessage]);

      // Save AI response
      await saveMessage('model', aiResponse);

      // Text-to-speech if enabled
      if (ttsEnabled) {
        try {
          const audio = await textToSpeech(aiResponse);
          if (audio) {
            await playAudio(audio);
          }
        } catch (error) {
          console.log('TTS not available:', error);
          // Silently fail - TTS is optional
        }
      }
    } catch (error: any) {
      console.error('Error sending AI message:', error);
      Alert.alert('Error', error.message || 'Failed to send message. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes < 10 ? '0' + minutes : minutes;
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerContainer}>
        <Text style={styles.title}>Mentor</Text>
        <Text style={styles.subtitle}>Your AI mentor, here to help</Text>
      </View>

      {aiInitializing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Initializing AI Mentor...</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.chatContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {/* TTS Toggle Header */}
          <View style={styles.ttsHeader}>
            {ttsEnabled ? (
              <Volume2 size={18} color="#8b5cf6" />
            ) : (
              <VolumeX size={18} color="#999" />
            )}
            <Text style={styles.ttsLabel}>Voice Responses</Text>
            <Switch
              value={ttsEnabled}
              onValueChange={setTtsEnabled}
              trackColor={{ false: '#d1d5db', true: '#c4b5fd' }}
              thumbColor={ttsEnabled ? '#8b5cf6' : '#f4f3f4'}
            />
          </View>

          <ScrollView
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
          >
            {aiMessages.map((msg) => (
              <View
                key={msg.id}
                style={[
                  styles.aiMessageItem,
                  msg.role === 'user' ? styles.aiUserMessage : styles.aiModelMessage
                ]}
              >
                <Text style={[
                  styles.messageText,
                  msg.role === 'user' && styles.aiUserMessageText
                ]}>
                  {msg.text}
                </Text>
                {msg.timestamp && (
                  <Text style={styles.messageTime}>
                    {formatTimestamp(msg.timestamp)}
                  </Text>
                )}
              </View>
            ))}
            {aiLoading && (
              <View style={[styles.aiMessageItem, styles.aiModelMessage]}>
                <ActivityIndicator size="small" color="#8b5cf6" />
                <Text style={styles.loadingText}>Thinking...</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={aiMessageText}
              onChangeText={setAiMessageText}
              placeholder="Message your AI mentor..."
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!aiMessageText.trim() || aiLoading) && styles.sendButtonDisabled]}
              onPress={handleSendAIMessage}
              disabled={!aiMessageText.trim() || aiLoading}
            >
              <Send size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerContainer: {
    backgroundColor: 'rgba(139, 92, 246, 0.85)',
    padding: 24,
    paddingTop: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  chatContainer: {
    flex: 1,
  },
  ttsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f8f4ff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9d5ff',
    gap: 8,
  },
  ttsLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  messagesContent: {
    padding: 16,
    gap: 12,
  },
  aiMessageItem: {
    padding: 12,
    borderRadius: 12,
    maxWidth: '80%',
  },
  aiUserMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#8b5cf6',
  },
  aiModelMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#f3f4f6',
  },
  aiUserMessageText: {
    color: '#fff',
  },
  messageText: {
    fontSize: 15,
    color: '#111',
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    backgroundColor: '#fff',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#d1d5db',
  },
});
