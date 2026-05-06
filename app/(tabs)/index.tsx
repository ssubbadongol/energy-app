import { Check, Clock, Coffee, Info, Moon, Zap } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
<<<<<<< HEAD
import { pinTaskToNotification } from './notificationService';
import { cancelTaskNotifications } from './taskNotificationService';
import { getSharedTasks, Task, updateSharedTasks } from './taskStorage';

type EnergyLevel = 'high' | 'medium' | 'low';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrentTime(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const mm = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()} • ${hours}:${mm} ${ampm}`;
}
=======
import { getPinnedTask, hasPinnedTask, setPinnedTask } from '../pinnedTaskStorage';
import { getSharedTasks, initializeTasks, Task, updateSharedTasks } from '../taskStorage';
import PinnedTaskBanner from './PinnedTaskBanner';

type EnergyLevel = 'high' | 'medium' | 'low';
>>>>>>> 9f2b95e8490cc52c4047002c2d0fb70af828cc7c

function formatDueTime(dueTime: string): string {
  const [h, m] = dueTime.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function getEnergyIcon(level: EnergyLevel) {
  if (level === 'high') return Zap;
  if (level === 'medium') return Coffee;
  return Moon;
}

function getEnergyColor(level: EnergyLevel): string {
  if (level === 'high') return '#F59E0B';
  if (level === 'medium') return '#8b5cf6';
  return '#38BDF8';
}

function getEnergyCardColor(level: EnergyLevel): { border: string; bg: string } {
  if (level === 'high') return { border: '#F59E0B', bg: '#fffaf0' };
  if (level === 'medium') return { border: '#8b5cf6', bg: '#f7f3ff' };
  return { border: '#38BDF8', bg: '#f0f8ff' };
}

// ── Swipeable Task Card ───────────────────────────────────────────────────────

function TaskCard({
  task,
  suggested,
  onComplete,
  onPin,
}: {
  task: Task;
  suggested: boolean;
  onComplete: () => void;
  onPin: () => void;
}) {
  const colors = getEnergyCardColor(task.energy as EnergyLevel);
  const EnergyIcon = getEnergyIcon(task.energy as EnergyLevel);

  const translateX = useSharedValue(0);
  const bgOpacity = useSharedValue(0);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const revealStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));

  const pan = Gesture.Pan()
    .activeOffsetX([-5, 5])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      if (e.translationX > 0) {
        translateX.value = e.translationX;
        bgOpacity.value = Math.min(e.translationX / 80, 1);
      }
    })
    .onEnd((e) => {
      if (e.translationX > 80) {
        translateX.value = withTiming(420, { duration: 180 }, (finished) => {
          if (finished) {
            runOnJS(onComplete)();
            translateX.value = 0;
            bgOpacity.value = 0;
          }
        });
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        bgOpacity.value = withSpring(0);
      }
    });

  const longPress = Gesture.LongPress()
    .minDuration(400)
    .onStart(() => {
      runOnJS(Vibration.vibrate)(40);
      runOnJS(onPin)();
    });

  const composed = Gesture.Race(longPress, pan);

  return (
    <View style={styles.swipeWrapper}>
      <Animated.View style={[styles.swipeBg, revealStyle]}>
        <Check size={18} color="#fff" />
      </Animated.View>

      <GestureDetector gesture={composed}>
        <Animated.View
          style={[
            styles.taskCard,
            { borderLeftColor: colors.border, backgroundColor: '#FFFFFF' },
            !suggested && styles.taskCardFaded,
            { marginBottom: 0 },
            cardStyle,
          ]}
        >
          <View style={styles.taskHeader}>
            <Text style={styles.taskName} numberOfLines={2}>{task.name}</Text>
            {suggested && (
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>Now</Text>
              </View>
            )}
          </View>

          {task.dueTime ? (
            <Text style={styles.dueTime}>Due {formatDueTime(task.dueTime)}</Text>
          ) : null}

          <View style={styles.taskMeta}>
            <View style={styles.metaItem}>
              <Clock size={13} color="#9090b0" />
              <Text style={styles.metaText}>{task.time}m</Text>
            </View>
            <View style={styles.metaItem}>
              <EnergyIcon size={13} color={getEnergyColor(task.energy as EnergyLevel)} />
              <Text style={styles.metaText}>{task.energy}</Text>
            </View>
            {task.type ? (
              <View style={styles.typeBadge}>
                <Text style={styles.typeText}>{task.type}</Text>
              </View>
            ) : null}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ── Completed Task Card ───────────────────────────────────────────────────────

function CompletedTaskCard({ task, onToggle }: { task: Task; onToggle: () => void }) {
  const colors = getEnergyCardColor(task.energy as EnergyLevel);

  return (
    <TouchableOpacity
      onPress={onToggle}
      style={[styles.taskCard, { borderLeftColor: colors.border, backgroundColor: '#FFFFFF' }, styles.taskCardCompleted]}
      activeOpacity={0.7}
    >
      <Text style={[styles.taskName, styles.taskNameCompleted]} numberOfLines={2}>
        {task.name}
      </Text>
      {task.dueTime ? (
        <Text style={[styles.dueTime, { opacity: 0.6 }]}>Due {formatDueTime(task.dueTime)}</Text>
      ) : null}
      <View style={styles.taskMeta}>
        <View style={styles.metaItem}>
          <Clock size={13} color="#9090b0" />
          <Text style={styles.metaText}>{task.time}m</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const [currentEnergy, setCurrentEnergy] = useState<EnergyLevel>('medium');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
<<<<<<< HEAD
    setTasks(getSharedTasks());
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
=======
    // Initialize tasks from AsyncStorage on first load
    initializeTasks().then(() => {
      setTasks(getSharedTasks());
    });
    
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

>>>>>>> 9f2b95e8490cc52c4047002c2d0fb70af828cc7c
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
<<<<<<< HEAD
    const interval = setInterval(() => setTasks(getSharedTasks()), 500);
    return () => clearInterval(interval);
  }, []);
=======
    const interval = setInterval(() => {
      const latestTasks = getSharedTasks();
      setTasks(latestTasks);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const dayName = days[date.getDay()];
    const monthName = months[date.getMonth()];
    const day = date.getDate();
    
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    
    return `${dayName}, ${monthName} ${day} • ${hours}:${minutesStr} ${ampm}`;
  };
>>>>>>> 9f2b95e8490cc52c4047002c2d0fb70af828cc7c

  const isToday = (dateString?: string) => {
    if (!dateString) return true;
    return new Date(dateString).toDateString() === new Date().toDateString();
  };

  const energyMatch = (taskEnergy: EnergyLevel) => {
    if (currentEnergy === 'high') return true;
    if (currentEnergy === 'medium' && taskEnergy !== 'high') return true;
    if (currentEnergy === 'low' && taskEnergy === 'low') return true;
    return false;
  };

<<<<<<< HEAD
  const toggleTask = (id: number) => {
    const task = tasks.find(t => t.id === id);
    if (task && !task.completed && task.notificationIds?.length) {
      cancelTaskNotifications(task.notificationIds);
    }
    const updated = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    setTasks(updated);
    updateSharedTasks(updated);
  };

  const getEnergyMessage = () => {
    if (currentEnergy === 'high') return "You're at peak energy. Perfect time for challenging tasks!";
    if (currentEnergy === 'medium') return "Decent energy level. Tackle medium-priority tasks or easier high-priority ones.";
    return "Low energy detected. Focus on simple admin tasks or take a break.";
=======
  const toggleTask = async (id: number) => {
    const updatedTasks = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    setTasks(updatedTasks);
    await updateSharedTasks(updatedTasks);
>>>>>>> 9f2b95e8490cc52c4047002c2d0fb70af828cc7c
  };

  const todayTasks = tasks.filter(t => isToday(t.dueDate));
  const suggestedTasks = todayTasks.filter(t => !t.completed && energyMatch(t.energy as EnergyLevel));
  const otherTasks = todayTasks.filter(t => !t.completed && !energyMatch(t.energy as EnergyLevel));
  const completedTasks = todayTasks.filter(t => t.completed);

  const pinTask = (task: Task) => {
    pinTaskToNotification({
      id: task.id,
      name: task.name,
      type: 'task',
      time: task.time,
    }).catch(() => {});
    Alert.alert('Pinned', `"${task.name}" pinned to your notifications.`, [{ text: 'OK' }]);
  };

<<<<<<< HEAD
  const showTips = () => {
    Alert.alert(
      'Tips',
      '• Swipe right on a task to mark it complete\n• Long press a task to pin it to the top',
      [{ text: 'Got it' }]
    );
=======
  const getEnergyColor = (level: EnergyLevel) => {
    switch(level) {
      case 'high': return '#F59E0B';
      case 'medium': return '#8b5cf6';
      case 'low': return '#38BDF8';
    }
  };

  const getEnergyCardColor = (level: EnergyLevel) => {
    switch(level) {
      case 'high': return { border: '#F59E0B', bg: '#FEF3C7' };
      case 'medium': return { border: '#8b5cf6', bg: '#F3E8FF' };
      case 'low': return { border: '#38BDF8', bg: '#E0F2FE' };
    }
  };

  const getEnergyMessage = () => {
    switch(currentEnergy) {
      case 'high': return "You're at peak energy. Perfect time for challenging tasks!";
      case 'medium': return "Decent energy level. Tackle medium-priority tasks or easier high-priority ones.";
      case 'low': return "Low energy detected. Focus on simple admin tasks or take a break.";
    }
>>>>>>> 9f2b95e8490cc52c4047002c2d0fb70af828cc7c
  };

  // ── Energy selector ───────────────────────────────────────────────────────

  const EnergySelector = () => (
    <View style={styles.energyCard}>
      <Text style={styles.energyTitle}>{"How's your energy right now?"}</Text>
      <View style={styles.energyButtons}>
        {(['high', 'medium', 'low'] as EnergyLevel[]).map(level => {
          const Icon = getEnergyIcon(level);
          return (
            <TouchableOpacity
              key={level}
              onPress={() => setCurrentEnergy(level)}
              style={[
                styles.energyButton,
                currentEnergy === level && { backgroundColor: getEnergyColor(level) },
              ]}
            >
              <Icon size={20} color={currentEnergy === level ? '#fff' : '#666'} />
              <Text
                style={[
                  styles.energyButtonText,
                  currentEnergy === level && styles.energyButtonTextActive,
                ]}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
<<<<<<< HEAD
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
=======
      <PinnedTaskBanner onUpdate={() => forceUpdate({})} />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
>>>>>>> 9f2b95e8490cc52c4047002c2d0fb70af828cc7c
        <View style={styles.headerContainer}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{"Today's Focus"}</Text>
              <Text style={styles.subtitle}>{formatCurrentTime(currentTime)}</Text>
            </View>
            <TouchableOpacity
              style={styles.infoBtn}
              onPress={showTips}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.75}
            >
              <Info size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        <EnergySelector />

        {/* Energy insight banner */}
        <View style={styles.insightBanner}>
          <Zap size={18} color="#6B7280" />
          <Text style={styles.insightText}>{getEnergyMessage()}</Text>
        </View>

        {/* Suggested tasks */}
        {suggestedTasks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Matched to Your Energy</Text>
              <View style={styles.taskCountBadge}>
                <Text style={styles.taskCountText}>{suggestedTasks.length}</Text>
              </View>
            </View>
            {suggestedTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                suggested={true}
                onComplete={() => toggleTask(task.id)}
                onPin={() => pinTask(task)}
              />
            ))}
          </View>
        )}

        {/* Other tasks */}
        {otherTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.laterTitle}>
              Save for later ({otherTasks.length}) · Not matched to your energy
            </Text>
            {otherTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                suggested={false}
                onComplete={() => toggleTask(task.id)}
                onPin={() => pinTask(task)}
              />
            ))}
          </View>
        )}

        {/* Completed tasks */}
        {completedTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.completedTitle}>Completed Today 🎉</Text>
            {completedTasks.map(task => (
              <CompletedTaskCard
                key={task.id}
                task={task}
                onToggle={() => toggleTask(task.id)}
              />
            ))}
          </View>
        )}

        {suggestedTasks.length === 0 && otherTasks.length === 0 && completedTasks.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No tasks for today 🎉</Text>
            <Text style={styles.emptySubtext}>Add a task to get started</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  headerContainer: {
    backgroundColor: '#0F172A',
    marginHorizontal: -20,
    marginTop: -20,
    padding: 24,
    paddingTop: 20,
    marginBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Nunito-Bold',
    fontSize: 28,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: 'Nunito-Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
  },
  infoBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginLeft: 12,
  },

  // ── Energy Selector ──────────────────────────────────────────────────────────
  energyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  energyTitle: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 15,
    color: '#111827',
    marginBottom: 12,
  },
  energyButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  energyButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  energyButtonText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 13,
    color: '#6B7280',
  },
  energyButtonTextActive: {
    color: '#fff',
  },

  // ── Insight Banner ───────────────────────────────────────────────────────────
  insightBanner: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  insightText: {
    fontFamily: 'Nunito-Regular',
    fontSize: 13,
    color: '#6B7280',
    flex: 1,
  },

  // ── Section ──────────────────────────────────────────────────────────────────
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: 'Nunito-Bold',
    fontSize: 17,
    color: '#111827',
  },
  taskCountBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  taskCountText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 12,
    color: '#111827',
  },
  laterTitle: {
    fontFamily: 'Nunito-Regular',
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 10,
  },
  completedTitle: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 10,
  },

  // ── Swipe wrapper ────────────────────────────────────────────────────────────
  swipeWrapper: {
    marginBottom: 8,
    borderRadius: 16,
    overflow: 'hidden',
  },
  swipeBg: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#22c55e',
    borderRadius: 16,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 20,
  },

  // ── Task Card ────────────────────────────────────────────────────────────────
  taskCard: {
    borderLeftWidth: 3,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  taskCardFaded: {
    opacity: 0.45,
  },
  taskCardCompleted: {
    opacity: 0.55,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  taskName: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 15,
    color: '#111827',
    flex: 1,
  },
  taskNameCompleted: {
    textDecorationLine: 'line-through',
    color: '#6B7280',
  },
  recommendedBadge: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recommendedText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 10,
    color: '#FFFFFF',
  },
  dueTime: {
    fontFamily: 'Nunito-Regular',
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 5,
  },
  taskMeta: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontFamily: 'Nunito-Regular',
    fontSize: 12,
    color: '#6B7280',
  },
  typeBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  typeText: {
    fontFamily: 'Nunito-Regular',
    fontSize: 10,
    color: '#6B7280',
  },

  // ── Empty State ──────────────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 20,
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtext: {
    fontFamily: 'Nunito-Regular',
    fontSize: 14,
    color: '#6B7280',
  },
});
