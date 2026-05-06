// ============================================================================
// ELEVENLABS TEXT-TO-SPEECH SERVICE (OPTIONAL)
// ============================================================================

// Get your ElevenLabs API key from: https://elevenlabs.io
// Add to .env: EXPO_PUBLIC_ELEVENLABS_API_KEY=your_key_here
const ELEVENLABS_API_KEY = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY || '';

// Voice options - you can customize these
export const VOICE_OPTIONS = {
  sarah: {
    id: 'EXAVITQu4vr4xnSDxMaL', // Warm, empathetic female voice
    name: 'Sarah',
    description: 'Warm and empathetic',
  },
  adam: {
    id: 'pNInz6obpgDQGcFmaJgB', // Calm, supportive male voice
    name: 'Adam',
    description: 'Calm and supportive',
  },
  charlie: {
    id: 'IKne3meq5aSn9XLyUdCD', // Friendly, energetic voice
    name: 'Charlie',
    description: 'Friendly and energetic',
  },
};

// Default voice settings
const DEFAULT_VOICE_SETTINGS = {
  stability: 0.5,           // 0-1: Lower = more expressive
  similarity_boost: 0.75,   // 0-1: Higher = more consistent
  style: 0.4,               // 0-1: Style exaggeration
  use_speaker_boost: true,
};

// Convert text to speech using ElevenLabs
export const textToSpeech = async (text, voiceId = VOICE_OPTIONS.sarah.id) => {
  try {
    if (!ELEVENLABS_API_KEY) {
      console.warn('ElevenLabs API key not configured');
      return null;
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: DEFAULT_VOICE_SETTINGS,
        }),
      }
    );

    if (!response.ok) {
      console.error('ElevenLabs API error:', response.status);
      return null;
    }

    // Get audio as blob
    const audioBlob = await response.blob();
    
    // Convert blob to base64 for React Native
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Audio = reader.result;
        resolve(base64Audio);
      };
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });
  } catch (error) {
    console.error('Error generating speech:', error);
    return null;
  }
};