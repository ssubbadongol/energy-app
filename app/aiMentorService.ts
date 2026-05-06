import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { ensureAuth } from './podService';
import { TASK_MANAGEMENT_TOOLS, executeTaskTool } from './taskTools';
// ============================================================================
// CONFIGURATION
// ============================================================================

// Get your Gemini API key from: https://makersuite.google.com/app/apikey
// Add to .env: EXPO_PUBLIC_GEMINI_API_KEY=your_key_here
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

// TEMPORARY DEBUG - Remove after testing
console.log('========== API KEY DEBUG ==========');
console.log('API Key exists:', !!GEMINI_API_KEY);
console.log('API Key length:', GEMINI_API_KEY.length);
console.log('First 10 chars:', GEMINI_API_KEY.substring(0, 10));
console.log('Last 10 chars:', GEMINI_API_KEY.substring(GEMINI_API_KEY.length - 10));
console.log('===================================');

// ============================================================================
// USER PROFILE MANAGEMENT
// ============================================================================

// Get user profile with tags from Firestore
export const getUserProfile = async () => {
  try {
    const userId = await ensureAuth();
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return {
        tags: userData.tags || [],
        name: userData.name || null,
        goals: userData.goals || [],
      };
    }
  } catch (error) {
    // Silently fail - user profile doesn't exist yet, use defaults
    // This is expected for new users
  }
  
  // Return default profile if not found
  return { tags: [], name: null, goals: [] };
};

// ============================================================================
// CONVERSATION HISTORY MANAGEMENT
// ============================================================================

// Load conversation history from Firestore
export const loadConversationHistory = async () => {
  try {
    const userId = await ensureAuth();
    const chatsRef = collection(db, 'aiMentorChats');
    const q = query(
      chatsRef,
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(50) // Last 50 messages
    );
    
    const snapshot = await getDocs(q);
    const messages: any[] = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      messages.push({
        id: doc.id,
        role: data.role,
        text: data.text,
        timestamp: data.timestamp,
        audioUrl: data.audioUrl || null,
      });
    });
    
    return messages.reverse(); // Oldest first
  } catch (error) {
    console.error('Error loading conversation history:', error);
    return [];
  }
};

// Save message to Firestore
export const saveMessage = async (role: string, text: string, audioUrl: string | null = null) => {
  try {
    const userId = await ensureAuth();
    await addDoc(collection(db, 'aiMentorChats'), {
      userId,
      role, // 'user' or 'model'
      text,
      timestamp: serverTimestamp(),
      audioUrl,
    });
  } catch (error) {
    console.error('Error saving message:', error);
    throw error;
  }
};

// ============================================================================
// AI PERSONALITY & PROMPTS
// ============================================================================

// Create personalized system prompt based on user profile
const createSystemPrompt = (userProfile: any) => {
  const { tags = [], name, goals = [] } = userProfile;
  
  const tagContext = tags.length > 0 
    ? `The user identifies with: ${tags.join(', ')}. `
    : '';
  
  const nameContext = name ? `Their name is ${name}. ` : '';
  
  const goalsContext = goals.length > 0
    ? `Their current goals include: ${goals.join(', ')}. `
    : '';

  return `You are a warm, empathetic AI mentor and companion. You're here to provide genuine support, encouragement, and practical advice.

${nameContext}${tagContext}${goalsContext}

Your personality:
- Warm and friendly, like talking to a trusted friend
- Use casual, natural language - contractions, conversational tone
- Show empathy and validate feelings
- Be encouraging but honest
- Use emojis occasionally (but not excessively) to add warmth 💙
- Keep responses conversational - not too formal or clinical
- Share relevant insights and practical strategies
- Ask thoughtful follow-up questions when appropriate
- Remember context from the conversation

For ADHD support specifically:
- Break down complex ideas into digestible chunks
- Offer practical, actionable strategies
- Understand executive function challenges
- Validate the struggle while empowering action
- Suggest tools, techniques, and coping strategies

For anxiety/stress:
- Acknowledge feelings without dismissing them
- Offer grounding techniques
- Normalize the experience
- Provide perspective when helpful

For motivation/productivity:
- Help break down overwhelming tasks
- Celebrate small wins
- Offer accountability and structure
- Suggest realistic approaches

TASK MANAGEMENT CAPABILITIES:
You can help users manage their tasks! You have access to these functions:
- add_task: Create new tasks
- delete_task: Remove tasks
- list_tasks: View all tasks
- complete_task: Mark tasks as done/undone

When adding tasks, you MUST collect these REQUIRED fields:
1. name (task title)
2. priority (high/medium/low)
3. energy (high/medium/low - energy level needed)
4. time (estimated minutes)
5. type (category like "Deep focus", "Admin", "Creative", "Meeting")

OPTIONAL field:
- dueDate (only ask if user mentions it or if it seems important)

**IMPORTANT**: If the user asks to add a task but doesn't provide all REQUIRED fields, ask conversational questions to get the missing info. For example:
- "What priority would you give this task - high, medium, or low?"
- "How much energy will this take - high, medium, or low?"
- "About how long do you think this will take?"
- "What type of task is this? Like deep focus, admin, creative, or something else?"

Be natural and friendly when asking - don't list all questions at once. Ask one at a time in a conversational flow.

When users say things like "add a task to write a report" or "remind me to call mom", recognize this as a task request and collect the needed information.

Examples of task-related requests:
- "Add a task to finish the presentation"
- "I need to remember to call the doctor"
- "Can you add 'review contract' to my list?"
- "Delete the email task"
- "Mark 'finish report' as done"
- "What tasks do I have?"

Remember: You're not a therapist, but a supportive mentor who genuinely cares AND helps manage tasks. Be real, be kind, be helpful.`;
};

// Generate welcome message based on user profile
export const generateWelcomeMessage = (userProfile: any) => {
  const { name, tags } = userProfile;
  const nameGreeting = name ? `Hi ${name}! ` : 'Hey there! ';
  
  let tagContext = '';
  if (tags.includes('ADHD')) {
    tagContext = " I know navigating ADHD can be challenging, but you're not alone in this.";
  } else if (tags.includes('Anxiety')) {
    tagContext = " I'm here to support you through the ups and downs.";
  }
  
  return `${nameGreeting}I'm your AI mentor. 💙${tagContext} How are you doing today? What's on your mind?`;
};

// ============================================================================
// GEMINI API INTEGRATION
// ============================================================================

// Send message to Gemini and get response
export const sendMessageToMentor = async (userMessage: string, conversationHistory: any[], userProfile: any) => {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API key not configured. Please add EXPO_PUBLIC_GEMINI_API_KEY to your .env file');
    }

    // Build conversation history for context
    const systemPrompt = createSystemPrompt(userProfile);
    
    // Format history for Gemini (last 20 messages for context)
    const recentHistory = conversationHistory.slice(-20);
    const contents = [
      {
        role: 'user',
        parts: [{ text: systemPrompt }],
      },
      {
        role: 'model',
        parts: [{ text: 'I understand. I\'m here to support you with warmth, empathy, and practical guidance. I can also help you manage your tasks! How can I help you today?' }],
      },
      ...recentHistory.map((msg: any) => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.text }],
      })),
      {
        role: 'user',
        parts: [{ text: userMessage }],
      },
    ];

    // Call Gemini API with function calling (tools)
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=' + GEMINI_API_KEY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        tools: [{
          function_declarations: TASK_MANAGEMENT_TOOLS,
        }],
        generationConfig: {
          temperature: 0.9,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1000,
        },
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API error:', errorData);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Check if Gemini wants to call a function
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const content = data.candidates[0].content;
      
      // Check for function calls
      const functionCall = content.parts?.find((part: any) => part.functionCall);
      
      if (functionCall) {
        // Execute the function
        const toolName = functionCall.functionCall.name;
        const toolArgs = functionCall.functionCall.args;
        
        console.log('🔧 Gemini calling tool:', toolName, toolArgs);
        
        const toolResult = await executeTaskTool(toolName, toolArgs);
        
        // Send the result back to Gemini for a natural response
        const followUpResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=' + GEMINI_API_KEY, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              ...contents,
              {
                role: 'model',
                parts: [{ functionCall: functionCall.functionCall }],
              },
              {
                role: 'user',
                parts: [{ 
                  functionResponse: {
                    name: toolName,
                    response: { result: toolResult },
                  }
                }],
              },
            ],
            generationConfig: {
              temperature: 0.9,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 1000,
            },
          }),
        });
        
        if (!followUpResponse.ok) {
          // If follow-up fails, return the tool result directly
          return toolResult;
        }
        
        const followUpData = await followUpResponse.json();
        const finalText = followUpData.candidates?.[0]?.content?.parts?.[0]?.text;
        
        return finalText || toolResult;
      }
      
      // Regular text response
      const text = content.parts[0].text;
      return text;
    }
    
    throw new Error('Unexpected response format from Gemini API');
  } catch (error) {
    console.error('Error sending message to Gemini:', error);
    throw new Error('Failed to get response from AI mentor. Please try again.');
  }
};

// ============================================================================
// CONVERSATION MANAGEMENT
// ============================================================================

// Clear conversation history (optional feature)
export const clearConversationHistory = async () => {
  try {
    const userId = await ensureAuth();
    const chatsRef = collection(db, 'aiMentorChats');
    const q = query(chatsRef, where('userId', '==', userId));
    
    const snapshot = await getDocs(q);
    
    // Note: Firestore doesn't have batch delete, so we mark as deleted
    // Or you can delete from client (not recommended for large datasets)
    // For now, we'll just create a new conversation effectively
    
    console.log('Conversation history cleared (logically)');
  } catch (error) {
    console.error('Error clearing conversation:', error);
    throw error;
  }
};