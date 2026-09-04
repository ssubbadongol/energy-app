import { LogOut, MessageCircle, Send } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ensureAuth, findOrCreatePod, getUserPod, isPodExpired, leavePod, sendMessage, subscribeToPodMessages } from '../podService';

interface Pod {
  id: string;
  struggle: string;
  supportStyle: string;
  duration: string;
  memberCount: number;
  isActive: boolean;
  expiresAt: any;
  [key: string]: any;
}

interface Message {
  id: string;
  type: 'user' | 'system';
  text: string;
  userId?: string;
  createdAt: any;
}

// ADHD-friendly soft colors for user messages - expanded palette
const USER_COLORS = [
  '#E8F5E9', // Soft mint green
  '#E3F2FD', // Soft sky blue
  '#FFF9C4', // Soft warm yellow
  '#F3E5F5', // Soft lavender
  '#FFE0B2', // Soft peach
  '#F0F4C3', // Soft lime
  '#FCE4EC', // Soft pink
  '#E0F2F1', // Soft teal
  '#FFF3E0', // Soft amber
  '#E1BEE7', // Soft purple
];

// Assign color based on userId - uses different hash algorithm for better distribution
const getUserColor = (userId: string): string => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  const index = Math.abs(hash) % USER_COLORS.length;
  return USER_COLORS[index];
};

/**
 * Pods tab — anonymous community support pods.
 *
 * Split out of the former combined "Talks" screen; this is the `'community'`
 * half. The AI mentor chat now lives in its own `mentor.tsx` tab.
 */
export default function PodsScreen() {
  const [currentPod, setCurrentPod] = useState<Pod | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  // Join flow state
  const [struggle, setStruggle] = useState('');
  const [supportStyle, setSupportStyle] = useState('');
  const [duration, setDuration] = useState('');
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const loadUserPod = useCallback(async () => {
    setLoading(true);
    try {
      // Ensure currentUserId is set BEFORE loading pod
      if (!currentUserId) {
        const userId = await ensureAuth();
        setCurrentUserId(userId);
      }

      const pod = await getUserPod();
      setCurrentPod(pod as Pod | null);
    } catch (error) {
      console.error('Error loading pod:', error);
    }
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => {
    loadUserPod();
  }, [loadUserPod]);

  useEffect(() => {
    // Get and store current user ID - CRITICAL for message alignment
    const getCurrentUserId = async () => {
      const userId = await ensureAuth();
      setCurrentUserId(userId);
    };
    getCurrentUserId();
  }, []);

  useEffect(() => {
    if (currentPod) {
      // Clear old messages first
      setMessages([]);

      const unsubscribe = subscribeToPodMessages(currentPod.id, (msgs: Message[]) => {
        setMessages(msgs);
      });

      return () => {
        unsubscribe();
        // Clear messages when unsubscribing
        setMessages([]);
      };
    } else {
      // No pod - clear messages
      setMessages([]);
    }
  }, [currentPod, currentUserId]);

  const handleJoinPod = async () => {
    if (!struggle || !supportStyle || !duration) {
      Alert.alert('Missing Info', 'Please answer all questions');
      return;
    }

    setJoining(true);
    try {
      // Ensure currentUserId is set BEFORE joining
      if (!currentUserId) {
        const userId = await ensureAuth();
        setCurrentUserId(userId);
      }

      await findOrCreatePod(struggle, supportStyle, duration);
      await loadUserPod();

      // Reset join form
      setStruggle('');
      setSupportStyle('');
      setDuration('');

      Alert.alert('Welcome! 🎉', 'You\'ve joined a pod. Be kind and supportive.');
    } catch (error) {
      console.error('Error joining pod:', error);
      Alert.alert('Error', 'Could not join a pod. Please try again.');
    }
    setJoining(false);
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !currentPod) return;

    const textToSend = messageText;
    setMessageText('');

    try {
      await sendMessage(currentPod.id, textToSend);
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Could not send message');
    }
  };

  const handleLeavePod = () => {
    if (!currentPod || leaving) return;

    Alert.alert(
      'Leave Pod?',
      'Are you sure you want to leave this pod? Your chat history will be cleared.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            if (leaving) return; // Prevent double-clicking

            setLeaving(true);
            try {
              const podToLeave = currentPod.id;

              // Clear UI immediately
              setCurrentPod(null);
              setMessages([]);

              // Then update Firestore
              await leavePod(podToLeave);

              Alert.alert('Left Pod', 'Chat history has been cleared. You can join a new pod.');
            } catch (error) {
              console.error('Error leaving pod:', error);
              Alert.alert('Error', 'Could not leave pod. Please try again.');
            } finally {
              setLeaving(false);
            }
          },
        },
      ]
    );
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

  const renderJoinPodScreen = () => (
    <ScrollView style={styles.content}>
      <View style={styles.joinContainer}>
        <MessageCircle size={60} color="#8b5cf6" />
        <Text style={styles.joinTitle}>Join a Community Pod</Text>
        <Text style={styles.joinSubtitle}>
          Connect with 3-5 others in a safe, temporary space
        </Text>

        {/* Question 1: Struggle */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>What brings you here today?</Text>
          <View style={styles.optionButtons}>
            {['Focus & Motivation', 'Overwhelm', 'Anxiety', 'Loneliness'].map(option => (
              <TouchableOpacity
                key={option}
                style={[styles.optionButton, struggle === option && styles.optionButtonActive]}
                onPress={() => setStruggle(option)}
              >
                <Text style={[styles.optionButtonText, struggle === option && styles.optionButtonTextActive]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Question 2: Support Style */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>What kind of support helps you most?</Text>
          <View style={styles.optionButtons}>
            {['Just listening', 'Advice & tips', 'Shared experiences'].map(option => (
              <TouchableOpacity
                key={option}
                style={[styles.optionButton, supportStyle === option && styles.optionButtonActive]}
                onPress={() => setSupportStyle(option)}
              >
                <Text style={[styles.optionButtonText, supportStyle === option && styles.optionButtonTextActive]}>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Question 3: Duration */}
        <View style={styles.questionSection}>
          <Text style={styles.questionLabel}>How long would you like this pod to last?</Text>
          <View style={styles.optionButtons}>
            {[
              { label: '24 hours', value: '24h' },
              { label: '7 days', value: '7d' },
            ].map(option => (
              <TouchableOpacity
                key={option.value}
                style={[styles.optionButton, duration === option.value && styles.optionButtonActive]}
                onPress={() => setDuration(option.value)}
              >
                <Text style={[styles.optionButtonText, duration === option.value && styles.optionButtonTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.joinButton, (!struggle || !supportStyle || !duration) && styles.joinButtonDisabled]}
          onPress={handleJoinPod}
          disabled={!struggle || !supportStyle || !duration || joining}
        >
          <Text style={styles.joinButtonText}>
            {joining ? 'Finding your pod...' : 'Join a Pod'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.privacyNote}>
          💙 Anonymous • Safe space • No judgment
        </Text>
      </View>
    </ScrollView>
  );

  const renderPodChatScreen = () => {
    if (!currentPod) return null;

    const expired = isPodExpired(currentPod);

    return (
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Pod Header */}
        <View style={styles.podHeader}>
          <View style={styles.podHeaderInfo}>
            <Text style={styles.podHeaderTitle}>Your Pod</Text>
            <Text style={styles.podHeaderSubtitle}>
              {currentPod.memberCount} {currentPod.memberCount === 1 ? 'person' : 'people'} • {currentPod.struggle}
            </Text>
          </View>
          <TouchableOpacity onPress={handleLeavePod} style={styles.leaveButton}>
            <LogOut size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <ScrollView
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((msg) => {
            const isOwnMessage = msg.type === 'user' && msg.userId === currentUserId;

            return (
              <View
                key={msg.id}
                style={[
                  styles.messageItem,
                  // System messages - center
                  msg.type === 'system' && styles.systemMessage,
                  // User messages - check if own
                  msg.type === 'user' && {
                    alignSelf: isOwnMessage ? 'flex-end' : 'flex-start',
                    backgroundColor: isOwnMessage ? '#8b5cf6' : getUserColor(msg.userId || ''),
                  }
                ]}
              >
                <Text style={[
                  styles.messageText,
                  msg.type === 'system' && styles.systemMessageText,
                  // White text for own messages (purple background)
                  msg.type === 'user' && isOwnMessage && { color: '#fff' }
                ]}>
                  {msg.text}
                </Text>
                {msg.type === 'user' && msg.createdAt && (
                  <Text style={[
                    styles.messageTime,
                    // Lighter timestamp color for own messages
                    isOwnMessage && { color: '#e9d5ff' }
                  ]}>
                    {formatTimestamp(msg.createdAt)}
                  </Text>
                )}
              </View>
            );
          })}
        </ScrollView>

        {/* Input Area */}
        {expired ? (
          <View style={styles.expiredNotice}>
            <Text style={styles.expiredText}>This pod has ended 💙</Text>
            <TouchableOpacity
              style={styles.newPodButton}
              onPress={async () => {
                // Leave the expired pod and clear state
                try {
                  if (currentPod) {
                    await leavePod(currentPod.id);
                  }
                } catch (error) {
                  console.log('Error leaving expired pod:', error);
                }
                setCurrentPod(null);
                setMessages([]);
              }}
            >
              <Text style={styles.newPodButtonText}>Join a new pod</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={messageText}
              onChangeText={setMessageText}
              placeholder="Share your thoughts..."
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.sendButton, !messageText.trim() && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={!messageText.trim()}
            >
              <Send size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerContainer}>
        <Text style={styles.title}>Pods</Text>
        <Text style={styles.subtitle}>Connect and share with others</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : currentPod ? (
        renderPodChatScreen()
      ) : (
        renderJoinPodScreen()
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
  content: {
    flex: 1,
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
  messagesContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  messagesContent: {
    padding: 16,
    gap: 12,
  },
  messageItem: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 12,
    maxWidth: '80%',
    alignSelf: 'flex-start',
  },
  systemMessage: {
    backgroundColor: '#f8f4ff',
    alignSelf: 'center',
    maxWidth: '90%',
  },
  messageText: {
    fontSize: 15,
    color: '#111',
    lineHeight: 20,
  },
  systemMessageText: {
    color: '#8b5cf6',
    textAlign: 'center',
    fontSize: 14,
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
  joinContainer: {
    padding: 20,
    alignItems: 'center',
  },
  joinTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111',
    marginTop: 20,
    marginBottom: 8,
  },
  joinSubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  questionSection: {
    width: '100%',
    marginBottom: 24,
  },
  questionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginBottom: 12,
  },
  optionButtons: {
    gap: 8,
  },
  optionButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionButtonActive: {
    backgroundColor: '#f3e8ff',
    borderColor: '#8b5cf6',
  },
  optionButtonText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
    textAlign: 'center',
  },
  optionButtonTextActive: {
    color: '#8b5cf6',
    fontWeight: '600',
  },
  joinButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 16,
    width: '100%',
  },
  joinButtonDisabled: {
    backgroundColor: '#d1d5db',
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  privacyNote: {
    fontSize: 13,
    color: '#8b5cf6',
    marginTop: 16,
    textAlign: 'center',
  },
  podHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#f8f4ff',
  },
  podHeaderInfo: {
    flex: 1,
  },
  podHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
  },
  podHeaderSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  leaveButton: {
    padding: 8,
  },
  expiredNotice: {
    padding: 20,
    paddingBottom: 12,
    backgroundColor: '#f8f4ff',
    borderTopWidth: 1,
    borderTopColor: '#e9d5ff',
    alignItems: 'center',
  },
  expiredText: {
    fontSize: 16,
    color: '#8b5cf6',
    marginBottom: 12,
  },
  newPodButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  newPodButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
