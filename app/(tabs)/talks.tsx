import { LogOut, MessageCircle, Send, Volume2, VolumeX } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateWelcomeMessage, getUserProfile, loadConversationHistory, saveMessage, sendMessageToMentor } from '../aiMentorService';
import { ensureAuth, findOrCreatePod, getUserPod, isPodExpired, leavePod, sendMessage, subscribeToPodMessages } from '../podService';
import { playAudio, textToSpeech } from '../ttsService';

type TalksTab = 'ai' | 'community';

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

interface AIChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: any;
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
  // Create a more unique hash that distributes colors better
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  // Use absolute value to ensure positive index
  const index = Math.abs(hash) % USER_COLORS.length;
  return USER_COLORS[index];
};

export default function TalksScreen() {
  const [activeTab, setActiveTab] = useState<TalksTab>('ai');
  
  // Community Pods state
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

  // AI Chat state
  const [aiMessages, setAiMessages] = useState<AIChatMessage[]>([]);
  const [aiMessageText, setAiMessageText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInitializing, setAiInitializing] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [ttsEnabled, setTtsEnabled] = useState(false);

  // Initialize AI Chat
  useEffect(() => {
    if (activeTab === 'ai') {
      initializeAIChat();
    }
  }, [activeTab]);

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

  // Community Pods functions (existing code)
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
    if (activeTab === 'community') {
      loadUserPod();
    }
  }, [activeTab, loadUserPod]);

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
      
      const podId = await findOrCreatePod(struggle, supportStyle, duration);
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

  // AI Chat Screen
  const renderAIChatScreen = () => {
    if (aiInitializing) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Initializing AI Mentor...</Text>
        </View>
      );
    }

    return (
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
    );
  };

  // Community Pods screens (existing code - Join Pod Screen)
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

  // Pod Chat Screen (existing code)
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
        <Text style={styles.title}>Talks</Text>
        <Text style={styles.subtitle}>Connect and share with others</Text>
      </View>

      {/* Browser-style tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'ai' && styles.tabActive]}
          onPress={() => setActiveTab('ai')}
        >
          <Text style={[styles.tabText, activeTab === 'ai' && styles.tabTextActive]}>
            AI Chat
          </Text>
          {activeTab === 'ai' && <View style={styles.tabIndicator} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'community' && styles.tabActive]}
          onPress={() => setActiveTab('community')}
        >
          <Text style={[styles.tabText, activeTab === 'community' && styles.tabTextActive]}>
            Community Pods
          </Text>
          {activeTab === 'community' && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'ai' ? (
        renderAIChatScreen()
      ) : loading ? (
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
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    position: 'relative',
  },
  tabActive: {
    backgroundColor: '#f8f4ff',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#666',
  },
  tabTextActive: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8b5cf6',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#8b5cf6',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
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
  messageItem: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 12,
    maxWidth: '80%',
    alignSelf: 'flex-start',
  },
  ownMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#8b5cf6', // Purple for own messages
  },
  otherMessage: {
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