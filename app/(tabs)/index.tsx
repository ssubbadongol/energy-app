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
import { colors, radius, shadows, typography } from '@/theme';
import { pinTaskToNotification } from './notificationService';
import { cancelTaskNotifications } from './taskNotificationService';
import { getSharedTasks, Task, updateSharedTasks } from './taskStorage';

type EnergyLevel = 'high' | 'medium' | 'low';

function formatCurrentTime(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const mm = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()} · ${hours}:${mm} ${ampm}`;
}

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
  if (level === 'high') return colors.warning;
  if (level === 'medium') return colors.accent;
  return '#38BDF8';
}

function getEnergyCardBorder(level: EnergyLevel): string {
  if (level === 'high') return colors.warning;
  if (level === 'medium') return colors.accent;
  return '#38BDF8';
}

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
  const borderColor = getEnergyCardBorder(task.energy as EnergyLevel);
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
    <View style={s.swipeWrapper}>
      <Animated.View style={[s.swipeBg, revealStyle]}>
        <Check size={18} color="#fff" />
      </Animated.View>

      <GestureDetector gesture={composed}>
        <Animated.View
          style={[
            s.taskCard,
            { borderLeftColor: borderColor },
            !suggested && s.taskCardFaded,
            cardStyle,
          ]}
        >
          <View style={s.taskHeader}>
            <Text style={s.taskName} numberOfLines={2}>{task.name}</Text>
            {suggested && (
              <View style={s.nowBadge}>
                <Text style={s.nowBadgeText}>Now</Text>
              </View>
            )}
          </View>

          {task.dueTime ? (
            <Text style={s.dueTime}>Due {formatDueTime(task.dueTime)}</Text>
          ) : null}

          <View style={s.taskMeta}>
            <View style={s.metaItem}>
              <Clock size={12} color={colors.textMuted} strokeWidth={1.5} />
              <Text style={s.metaText}>{task.time}m</Text>
            </View>
            <View style={s.metaItem}>
              <EnergyIcon size={12} color={getEnergyColor(task.energy as EnergyLevel)} strokeWidth={1.5} />
              <Text style={s.metaText}>{task.energy}</Text>
            </View>
            {task.type ? (
              <View style={s.typeBadge}>
                <Text style={s.typeText}>{task.type}</Text>
              </View>
            ) : null}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function CompletedTaskCard({ task, onToggle }: { task: Task; onToggle: () => void }) {
  const borderColor = getEnergyCardBorder(task.energy as EnergyLevel);

  return (
    <TouchableOpacity
      onPress={onToggle}
      style={[s.taskCard, { borderLeftColor: borderColor }, s.taskCardCompleted]}
      activeOpacity={0.7}
    >
      <Text style={[s.taskName, s.taskNameCompleted]} numberOfLines={2}>{task.name}</Text>
      {task.dueTime ? (
        <Text style={[s.dueTime, { opacity: 0.5 }]}>Due {formatDueTime(task.dueTime)}</Text>
      ) : null}
      <View style={s.taskMeta}>
        <View style={s.metaItem}>
          <Clock size={12} color={colors.textMuted} strokeWidth={1.5} />
          <Text style={s.metaText}>{task.time}m</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const [currentEnergy, setCurrentEnergy] = useState<EnergyLevel>('medium');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    setTasks(getSharedTasks());
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTasks(getSharedTasks()), 500);
    return () => clearInterval(interval);
  }, []);

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
    if (currentEnergy === 'high') return "Peak energy. Tackle your hardest tasks first.";
    if (currentEnergy === 'medium') return "Decent energy. Medium tasks or lighter versions of big ones.";
    return "Low energy. Simple tasks or a well-deserved break.";
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

  const showTips = () => {
    Alert.alert(
      'Tips',
      '· Swipe right on a task to complete it\n· Long press to pin to notifications',
      [{ text: 'Got it' }]
    );
  };

  const EnergySelector = () => (
    <View style={s.energyCard}>
      <Text style={s.energyTitle}>{"How's your energy?"}</Text>
      <View style={s.energyButtons}>
        {(['high', 'medium', 'low'] as EnergyLevel[]).map(level => {
          const Icon = getEnergyIcon(level);
          const active = currentEnergy === level;
          return (
            <TouchableOpacity
              key={level}
              onPress={() => setCurrentEnergy(level)}
              activeOpacity={0.8}
              style={[s.energyButton, active && { backgroundColor: getEnergyColor(level) + '20', borderColor: getEnergyColor(level) }]}
            >
              <Icon size={18} color={active ? getEnergyColor(level) : colors.textMuted} strokeWidth={1.5} />
              <Text style={[s.energyButtonText, active && { color: getEnergyColor(level) }]}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Ambient glow */}
      <View pointerEvents="none" style={s.ambientGlow} />

      <ScrollView
        style={s.scrollView}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{"Today's Focus"}</Text>
            <Text style={s.subtitle}>{formatCurrentTime(currentTime)}</Text>
          </View>
          <TouchableOpacity
            style={s.infoBtn}
            onPress={showTips}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Info size={18} color={colors.textMuted} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>

        <EnergySelector />

        {/* Insight */}
        <View style={s.insightBanner}>
          <Zap size={14} color={colors.accent} strokeWidth={1.5} />
          <Text style={s.insightText}>{getEnergyMessage()}</Text>
        </View>

        {/* Suggested tasks */}
        {suggestedTasks.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Matched to your energy</Text>
              <View style={s.countBadge}>
                <Text style={s.countText}>{suggestedTasks.length}</Text>
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
          <View style={s.section}>
            <Text style={s.laterTitle}>
              Save for later · {otherTasks.length} not matched
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

        {/* Completed */}
        {completedTasks.length > 0 && (
          <View style={s.section}>
            <Text style={s.completedTitle}>Done today · {completedTasks.length}</Text>
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
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>✦</Text>
            <Text style={s.emptyText}>All clear</Text>
            <Text style={s.emptySubtext}>No tasks scheduled for today</Text>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  ambientGlow: {
    position: 'absolute',
    top: -80,
    alignSelf: 'center',
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: colors.accentDim,
    opacity: 0.7,
  },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 8,
  },
  title: {
    fontFamily: typography.displayFont,
    fontSize: 28,
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 3,
  },
  subtitle: {
    fontFamily: typography.bodyFont,
    fontSize: 13,
    color: colors.textMuted,
  },
  infoBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Energy card
  energyCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  energyTitle: {
    fontFamily: typography.uiFont,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  energyButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  energyButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  energyButtonText: {
    fontFamily: typography.uiFont,
    fontSize: 12,
    color: colors.textMuted,
  },

  // Insight banner
  insightBanner: {
    backgroundColor: colors.accentDim,
    borderRadius: radius.md,
    padding: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.accent + '30',
  },
  insightText: {
    fontFamily: typography.bodyFont,
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },

  // Sections
  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: typography.headingFont,
    fontSize: 14,
    color: colors.textSecondary,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  countBadge: {
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countText: {
    fontFamily: typography.uiFont,
    fontSize: 11,
    color: colors.textMuted,
  },
  laterTitle: {
    fontFamily: typography.bodyFont,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  completedTitle: {
    fontFamily: typography.bodyFont,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 10,
    letterSpacing: 0.3,
  },

  // Swipe wrapper
  swipeWrapper: {
    marginBottom: 8,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  swipeBg: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: colors.success,
    borderRadius: radius.lg,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 20,
  },

  // Task card
  taskCard: {
    borderLeftWidth: 2,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSurface,
    ...shadows.sm,
  },
  taskCardFaded: { opacity: 0.4 },
  taskCardCompleted: { opacity: 0.4 },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  taskName: {
    fontFamily: typography.uiFont,
    fontSize: 15,
    color: colors.textPrimary,
    flex: 1,
  },
  taskNameCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  nowBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  nowBadgeText: {
    fontFamily: typography.uiFont,
    fontSize: 10,
    color: '#FFFFFF',
  },
  dueTime: {
    fontFamily: typography.bodyFont,
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 6,
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
    gap: 4,
  },
  metaText: {
    fontFamily: typography.bodyFont,
    fontSize: 12,
    color: colors.textMuted,
  },
  typeBadge: {
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  typeText: {
    fontFamily: typography.bodyFont,
    fontSize: 11,
    color: colors.textMuted,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
  },
  emptyIcon: {
    fontSize: 32,
    color: colors.textMuted,
    marginBottom: 12,
  },
  emptyText: {
    fontFamily: typography.headingFont,
    fontSize: 20,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  emptySubtext: {
    fontFamily: typography.bodyFont,
    fontSize: 14,
    color: colors.textMuted,
  },
});
