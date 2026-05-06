import { CameraView, useCameraPermissions } from 'expo-camera';
import { Eye, Play, Square } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { SafeAreaView } from 'react-native-safe-area-context';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Color overlays for focus screen
const OVERLAY_COLORS = [
  { name: 'No Overlay', color: 'transparent', opacity: 0 },
  { name: 'Calm Blue', color: '#3b82f6', opacity: 0.85 },
  { name: 'Forest Green', color: '#10b981', opacity: 0.85 },
  { name: 'Warm Beige', color: '#d4b896', opacity: 0.85 },
  { name: 'Soft Purple', color: '#8b5cf6', opacity: 0.85 },
  { name: 'Deep Gray', color: '#4b5563', opacity: 0.85 },
  { name: 'Ocean Teal', color: '#14b8a6', opacity: 0.85 },
];

export default function FocusScreen() {
  // Permissions
  const [permission, requestPermission] = useCameraPermissions();
  
  // Session state
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [selectedOverlay, setSelectedOverlay] = useState(OVERLAY_COLORS[0]); // Start with no overlay
  const [sessionDuration, setSessionDuration] = useState(0);
  
  // Focus tracking data
  const [focusData, setFocusData] = useState<number[]>([50]); // Start at 50%
  const [currentFocus, setCurrentFocus] = useState(50);
  
  // Temporary focus simulation state
  const [userState, setUserState] = useState<'focused' | 'distracted' | 'returning'>('focused');
  const [stateTimer, setStateTimer] = useState(0);
  
  // Refs
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Start focus session
  const startSession = async () => {
    // Check camera permission
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera Permission Required', 'Camera access is needed to track your focus. Please enable it in settings.');
        return;
      }
    }
    
    setIsSessionActive(true);
    setSessionDuration(0);
    setFocusData([50]);
    setCurrentFocus(50);
    setUserState('focused'); // Reset to focused state
    setStateTimer(0); // Reset state timer
    
    // Start timer
    timerRef.current = setInterval(() => {
      setSessionDuration(prev => prev + 1);
    }, 1000);
    
    // Start focus tracking (realistic simulation - replace with Presage)
    trackingRef.current = setInterval(() => {
      // TODO: Replace with actual Presage tracking
      // Camera is ALWAYS tracking, regardless of overlay
      // const presageFocus = await PresageFocusTracker.getCurrentFocus();
      
      // TEMPORARY: Realistic focus simulation
      setStateTimer(prev => {
        const newTimer = prev + 1;
        
        // State transitions based on realistic timings
        let newState = userState;
        
        if (userState === 'focused' && newTimer > 20 + Math.random() * 30) {
          // After 20-50 seconds of focus, user might get distracted
          if (Math.random() < 0.3) { // 30% chance
            newState = 'distracted';
            setUserState(newState);
            return 0; // Reset timer
          }
        } else if (userState === 'distracted' && newTimer > 5 + Math.random() * 10) {
          // After 5-15 seconds of distraction, user starts returning
          newState = 'returning';
          setUserState(newState);
          return 0;
        } else if (userState === 'returning' && newTimer > 3 + Math.random() * 5) {
          // After 3-8 seconds of returning, user is focused again
          newState = 'focused';
          setUserState(newState);
          return 0;
        }
        
        return newTimer;
      });
      
      // Calculate new focus based on state
      setCurrentFocus(prevFocus => {
        let targetFocus = prevFocus;
        let change = 0;
        
        switch (userState) {
          case 'focused':
            // Gradually increase focus to 75-95%
            targetFocus = 75 + Math.random() * 20;
            change = (targetFocus - prevFocus) * 0.15; // Gradual increase
            break;
          case 'distracted':
            // Drop to 20-40%
            targetFocus = 20 + Math.random() * 20;
            change = (targetFocus - prevFocus) * 0.25; // Faster decrease
            break;
          case 'returning':
            // Recovering to 50-70%
            targetFocus = 50 + Math.random() * 20;
            change = (targetFocus - prevFocus) * 0.2;
            break;
        }
        
        // Add some natural variation (breathing, micro-movements)
        const microVariation = (Math.random() - 0.5) * 3;
        
        const newFocus = Math.max(10, Math.min(100, 
          prevFocus + change + microVariation
        ));
        
        const roundedFocus = Math.round(newFocus);
        
        // Update focus data
        setFocusData(prev => {
          const updated = [...prev, roundedFocus];
          // Keep last 60 data points (1 per second for 1 minute view)
          return updated.slice(-60);
        });
        
        return roundedFocus;
      });
    }, 1000);
  };
  
  // Stop focus session
  const stopSession = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (trackingRef.current) clearInterval(trackingRef.current);
    
    setIsSessionActive(false);
    
    // Calculate average focus
    const avgFocus = focusData.reduce((a, b) => a + b, 0) / focusData.length;
    
    Alert.alert(
      'Session Complete! 🎉',
      `Duration: ${formatTime(sessionDuration)}\nAverage Focus: ${avgFocus.toFixed(1)}%`,
      [{ text: 'OK' }]
    );
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (trackingRef.current) clearInterval(trackingRef.current);
    };
  }, []);
  
  // Active session view
  const renderActiveSession = () => (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
      {/* Camera with Optional Overlay */}
      <View style={styles.cameraContainer}>
        <CameraView style={styles.camera} facing="front">
          {/* Color Overlay */}
          {selectedOverlay.opacity > 0 && (
            <View 
              style={[
                styles.colorOverlay, 
                { 
                  backgroundColor: selectedOverlay.color,
                  opacity: selectedOverlay.opacity,
                }
              ]} 
            />
          )}
          
          {/* Focus Indicator */}
          <View style={styles.cameraOverlay}>
            <View style={styles.focusIndicator}>
              <Text style={styles.focusPercentage}>{currentFocus}%</Text>
              <Text style={styles.focusLabel}>Focus</Text>
            </View>
            
            {/* Temporary: State Indicator (remove when using real Presage) */}
            <View style={styles.stateIndicator}>
              <Text style={styles.stateText}>
                {userState === 'focused' && '🎯 Focused'}
                {userState === 'distracted' && '👀 Distracted'}
                {userState === 'returning' && '↩️ Returning'}
              </Text>
              <Text style={styles.stateSubtext}>(Simulated)</Text>
            </View>
          </View>
        </CameraView>
      </View>
      
      {/* Timer */}
      <View style={styles.timerContainer}>
        <Text style={styles.timerText}>{formatTime(sessionDuration)}</Text>
      </View>
      
      {/* Overlay Toggle */}
      <View style={styles.overlayToggleContainer}>
        <Text style={styles.sectionTitle}>Color Overlay</Text>
        <Text style={styles.sectionSubtitle}>
          Camera is always tracking your focus
        </Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.overlayOptions}
        >
          {OVERLAY_COLORS.map((overlay) => (
            <TouchableOpacity
              key={overlay.name}
              style={[
                styles.overlayOption,
                selectedOverlay.name === overlay.name && styles.overlayOptionSelected,
              ]}
              onPress={() => setSelectedOverlay(overlay)}
            >
              <View 
                style={[
                  styles.overlayColorPreview,
                  { 
                    backgroundColor: overlay.color === 'transparent' ? '#f3f4f6' : overlay.color,
                  }
                ]}
              >
                {overlay.color === 'transparent' && (
                  <Eye size={20} color="#8b5cf6" />
                )}
              </View>
              <Text style={styles.overlayName}>{overlay.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      
      {/* Focus Graph */}
      <View style={styles.graphContainer}>
        <Text style={styles.sectionTitle}>Focus Over Time</Text>
        <LineChart
          data={{
            labels: [],
            datasets: [{
              data: focusData.length > 1 ? focusData : [50, 50],
            }],
          }}
          width={SCREEN_WIDTH - 40}
          height={200}
          chartConfig={{
            backgroundColor: '#f8f4ff',
            backgroundGradientFrom: '#f8f4ff',
            backgroundGradientTo: '#f8f4ff',
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(139, 92, 246, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
            style: {
              borderRadius: 16,
            },
            propsForDots: {
              r: '2',
              strokeWidth: '2',
              stroke: '#8b5cf6',
            },
          }}
          bezier
          style={styles.chart}
          withInnerLines={true}
          withOuterLines={true}
          withVerticalLabels={false}
          withHorizontalLabels={true}
          segments={4}
          yAxisSuffix="%"
          yAxisInterval={1}
          fromZero={true}
        />
        <Text style={styles.graphSubtitle}>Last {Math.min(focusData.length, 60)} seconds</Text>
      </View>
      
      {/* Stop Button */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={styles.stopButton}
          onPress={stopSession}
        >
          <Square size={24} color="#fff" fill="#fff" />
          <Text style={styles.stopButtonText}>End Session</Text>
        </TouchableOpacity>
      </View>
      
      {/* Add some bottom padding */}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
  
  // Idle state
  const renderIdleState = () => (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
      <View style={styles.idleContainer}>
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <Eye size={60} color="#8b5cf6" />
          </View>
        </View>
        
        <Text style={styles.idleTitle}>Focus Mode</Text>
        <Text style={styles.idleDescription}>
          AI-powered attention tracking to help you stay focused
        </Text>
        
        {/* How it works */}
        <View style={styles.infoSection}>
          <Text style={styles.infoSectionTitle}>How it works:</Text>
          <View style={styles.infoItem}>
            <Text style={styles.infoBullet}>📹</Text>
            <Text style={styles.infoText}>
              Camera tracks your attention in real-time
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoBullet}>🎨</Text>
            <Text style={styles.infoText}>
              Optional color overlay to avoid seeing yourself
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoBullet}>📊</Text>
            <Text style={styles.infoText}>
              Live graph shows your focus over time
            </Text>
          </View>
        </View>
        
        {/* Color preview */}
        <View style={styles.previewSection}>
          <Text style={styles.previewTitle}>Preview Color Overlays:</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.colorPreviewList}
          >
            {OVERLAY_COLORS.slice(1).map((overlay) => (
              <View key={overlay.name} style={styles.colorPreviewItem}>
                <View 
                  style={[
                    styles.colorPreviewBox,
                    { backgroundColor: overlay.color }
                  ]}
                />
                <Text style={styles.colorPreviewName}>{overlay.name}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
        
        {/* Start Button */}
        <TouchableOpacity
          style={styles.startButton}
          onPress={startSession}
        >
          <Play size={28} color="#fff" fill="#fff" />
          <Text style={styles.startButtonText}>Start Focus Session</Text>
        </TouchableOpacity>
        
        {/* Tip */}
        <View style={styles.tipBox}>
          <Text style={styles.tipText}>
            💡 Position your camera at eye level for best tracking
          </Text>
        </View>
      </View>
    </ScrollView>
  );
  
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Focus Mode</Text>
        <Text style={styles.subtitle}>AI-powered focus tracking</Text>
      </View>
      
      {isSessionActive ? renderActiveSession() : renderIdleState()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
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
  
  // ScrollView
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  
  // Idle State
  idleContainer: {
    padding: 24,
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f3e8ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  idleTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 12,
    textAlign: 'center',
  },
  idleDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  
  // Info Section
  infoSection: {
    backgroundColor: '#f8f4ff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
  },
  infoSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  infoBullet: {
    fontSize: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
  },
  
  // Preview Section
  previewSection: {
    marginBottom: 32,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginBottom: 12,
  },
  colorPreviewList: {
    gap: 12,
    paddingVertical: 4,
  },
  colorPreviewItem: {
    alignItems: 'center',
    gap: 6,
  },
  colorPreviewBox: {
    width: 60,
    height: 60,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  colorPreviewName: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  
  // Start Button
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8b5cf6',
    padding: 20,
    borderRadius: 16,
    gap: 12,
    marginBottom: 16,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  tipBox: {
    backgroundColor: '#fef3c7',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  tipText: {
    fontSize: 14,
    color: '#92400e',
    textAlign: 'center',
    lineHeight: 20,
  },
  
  // Active Session
  cameraContainer: {
    height: 400,
    backgroundColor: '#000',
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  colorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    padding: 20,
  },
  focusIndicator: {
    backgroundColor: 'rgba(139, 92, 246, 0.95)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  focusPercentage: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  focusLabel: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.9,
  },
  stateIndicator: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  stateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  stateSubtext: {
    fontSize: 10,
    color: '#fff',
    opacity: 0.7,
    marginTop: 2,
  },
  
  // Timer
  timerContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#f8f4ff',
  },
  timerText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#8b5cf6',
  },
  
  // Overlay Toggle
  overlayToggleContainer: {
    padding: 20,
    backgroundColor: '#fff',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  overlayOptions: {
    gap: 12,
    paddingVertical: 4,
  },
  overlayOption: {
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  overlayOptionSelected: {
    borderColor: '#8b5cf6',
    backgroundColor: '#f8f4ff',
  },
  overlayColorPreview: {
    width: 50,
    height: 50,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  overlayName: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    maxWidth: 70,
  },
  
  // Graph
  graphContainer: {
    padding: 20,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  graphSubtitle: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  
  // Controls
  controlsContainer: {
    padding: 20,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#ef4444',
    gap: 8,
  },
  stopButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});