import { Check, Clock, Coffee, Moon, Zap } from 'lucide-react-native';
import React, { useState } from 'react';
import { Animated, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type EnergyLevel = 'high' | 'medium' | 'low';
type Priority = 'high' | 'medium' | 'low';

interface Task {
  id: number;
  name: string;
  priority: Priority;
  energy: EnergyLevel;
  time: number;
  type: string;
  completed: boolean;
}

export default function HomeScreen() {
  const [currentEnergy, setCurrentEnergy] = useState<EnergyLevel>('medium');
  const [tasks, setTasks] = useState<Task[]>([
    { id: 1, name: 'Write client proposal', priority: 'high', energy: 'high', time: 60, type: 'Deep focus', completed: false },
    { id: 2, name: 'Reply to emails', priority: 'medium', energy: 'low', time: 20, type: 'Admin', completed: false },
    { id: 3, name: 'Review design mockups', priority: 'high', energy: 'medium', time: 30, type: 'Creative', completed: false },
    { id: 4, name: 'Organize files', priority: 'low', energy: 'low', time: 15, type: 'Admin', completed: false },
    { id: 5, name: 'Schedule team meeting', priority: 'medium', energy: 'low', time: 10, type: 'Admin', completed: false },
  ]);

  const energyMatch = (taskEnergy: EnergyLevel) => {
    if (currentEnergy === 'high') return true;
    if (currentEnergy === 'medium' && taskEnergy !== 'high') return true;
    if (currentEnergy === 'low' && taskEnergy === 'low') return true;
    return false;
  };

  const toggleTask = (id: number) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const suggestedTasks = tasks.filter(t => !t.completed && energyMatch(t.energy));
  const otherTasks = tasks.filter(t => !t.completed && !energyMatch(t.energy));
  const completedTasks = tasks.filter(t => t.completed);

  const getEnergyIcon = (level: EnergyLevel) => {
    switch(level) {
      case 'high': return Zap;
      case 'medium': return Coffee;
      case 'low': return Moon;
    }
  };

  const getEnergyColor = (level: EnergyLevel) => {
    switch(level) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#3b82f6';
    }
  };

  const getPriorityColor = (priority: Priority) => {
    switch(priority) {
      case 'high': return { border: '#ef4444', bg: '#fee2e2' };
      case 'medium': return { border: '#f59e0b', bg: '#fef3c7' };
      case 'low': return { border: '#22c55e', bg: '#dcfce7' };
    }
  };

  const getEnergyMessage = () => {
    switch(currentEnergy) {
      case 'high': return "You're at peak energy. Perfect time for challenging tasks!";
      case 'medium': return "Decent energy level. Tackle medium-priority tasks or easier high-priority ones.";
      case 'low': return "Low energy detected. Focus on simple admin tasks or take a break.";
    }
  };

  const EnergySelector = () => (
    <View style={styles.energyCard}>
      <View style={styles.energyHeader}>
        <Text style={styles.energyTitle}>How&apos;s your energy right now?</Text>
      </View>
      <View style={styles.energyButtons}>
        {(['high', 'medium', 'low'] as EnergyLevel[]).map((level) => {
          const Icon = getEnergyIcon(level);
          return (
            <TouchableOpacity
              key={level}
              onPress={() => setCurrentEnergy(level)}
              style={[
                styles.energyButton,
                currentEnergy === level && { backgroundColor: getEnergyColor(level) }
              ]}
            >
              <Icon size={20} color={currentEnergy === level ? '#fff' : '#666'} />
              <Text style={[styles.energyButtonText, currentEnergy === level && styles.energyButtonTextActive]}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const SwipeableTaskCard = ({ task, suggested }: { task: Task; suggested: boolean }) => {
    const [pan] = useState(new Animated.ValueXY());
    const colors = getPriorityColor(task.priority);
    const EnergyIcon = getEnergyIcon(task.energy);

    const panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dx) > Math.abs(gesture.dy)) {
          pan.setValue({ x: gesture.dx, y: 0 });
        }
      },
      onPanResponderRelease: (_, gesture) => {
        const swipeThreshold = 120;
        
        if (Math.abs(gesture.dx) > swipeThreshold) {
          Animated.timing(pan, {
            toValue: { x: gesture.dx > 0 ? 500 : -500, y: 0 },
            duration: 200,
            useNativeDriver: false,
          }).start(() => {
            toggleTask(task.id);
            pan.setValue({ x: 0, y: 0 });
          });
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
        }
      },
    });

    return (
      <View style={styles.swipeContainer}>
        <View style={styles.swipeBackground}>
          <Check size={24} color="#22c55e" />
          <Text style={styles.swipeText}>Complete</Text>
        </View>
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.taskCard,
            { borderLeftColor: colors.border, backgroundColor: colors.bg },
            !suggested && styles.taskCardFaded,
            {
              transform: [{ translateX: pan.x }],
            },
          ]}
        >
          <View style={styles.taskContent}>
            <View style={styles.taskMain}>
              <View style={styles.taskHeader}>
                <Text style={styles.taskName}>{task.name}</Text>
                {suggested && <View style={styles.recommendedBadge}><Text style={styles.recommendedText}>Recommended</Text></View>}
              </View>
              <View style={styles.taskMeta}>
                <View style={styles.metaItem}>
                  <Clock size={16} color="#666" />
                  <Text style={styles.metaText}>{task.time}m</Text>
                </View>
                <View style={styles.metaItem}>
                  <EnergyIcon size={16} color={getEnergyColor(task.energy)} />
                  <Text style={styles.metaText}>{task.energy} energy</Text>
                </View>
                {task.type && (
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeText}>{task.type}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.swipeHint}>← Swipe to complete →</Text>
            </View>
          </View>
        </Animated.View>
      </View>
    );
  };

  const CompletedTaskCard = ({ task }: { task: Task }) => {
    const colors = getPriorityColor(task.priority);
    const EnergyIcon = getEnergyIcon(task.energy);

    return (
      <TouchableOpacity 
        onPress={() => toggleTask(task.id)}
        style={[styles.taskCard, { borderLeftColor: colors.border, backgroundColor: colors.bg }, styles.taskCardFaded]}
      >
        <View style={styles.taskContent}>
          <View style={styles.taskMain}>
            <View style={styles.taskHeader}>
              <Text style={[styles.taskName, styles.taskNameCompleted]}>{task.name}</Text>
            </View>
            <View style={styles.taskMeta}>
              <View style={styles.metaItem}>
                <Clock size={16} color="#666" />
                <Text style={styles.metaText}>{task.time}m</Text>
              </View>
              <View style={styles.metaItem}>
                <EnergyIcon size={16} color={getEnergyColor(task.energy)} />
                <Text style={styles.metaText}>{task.energy} energy</Text>
              </View>
              {task.type && (
                <View style={styles.typeBadge}>
                  <Text style={styles.typeText}>{task.type}</Text>
                </View>
              )}
            </View>
          </View>
          <View style={[styles.checkbox, styles.checkboxChecked]}>
            <Check size={16} color="#8b5cf6" />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Today&apos;s Focus</Text>
          <Text style={styles.subtitle}>Monday, Jan 5 • 2:30 PM</Text>
        </View>

        <EnergySelector />

        <View style={styles.insightBanner}>
          <Zap size={20} color="#fff" />
          <View style={styles.insightContent}>
            <Text style={styles.insightTitle}>Good news!</Text>
            <Text style={styles.insightText}>{getEnergyMessage()}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.taskCount}>
              <Text style={styles.taskCountText}>{suggestedTasks.length} tasks</Text>
            </View>
            <Text style={styles.sectionTitle}>Matched to Your Energy</Text>
          </View>
          {suggestedTasks.map(task => (
            <SwipeableTaskCard key={task.id} task={task} suggested={true} />
          ))}
        </View>

        {otherTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.laterTitle}>Save these for later ({otherTasks.length}) • Not matched to current energy</Text>
            {otherTasks.map(task => (
              <SwipeableTaskCard key={task.id} task={task} suggested={false} />
            ))}
          </View>
        )}

        {completedTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.completedTitle}>Completed Today 🎉</Text>
            {completedTasks.map(task => (
              <CompletedTaskCard key={task.id} task={task} />
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  energyCard: {
    backgroundColor: '#f8f4ff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  energyHeader: {
    marginBottom: 16,
  },
  energyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  energyButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  energyButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    gap: 4,
  },
  energyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  energyButtonTextActive: {
    color: '#fff',
  },
  insightBanner: {
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  insightText: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.9,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  taskCount: {
    backgroundColor: '#f3e8ff',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  taskCountText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8b5cf6',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  laterTitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  completedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  swipeContainer: {
    marginBottom: 12,
    position: 'relative',
  },
  swipeBackground: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  swipeText: {
    color: '#22c55e',
    fontWeight: '600',
    fontSize: 16,
  },
  taskCard: {
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 16,
    backgroundColor: '#fff',
  },
  taskCardFaded: {
    opacity: 0.6,
  },
  taskContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  taskMain: {
    flex: 1,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  taskName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  taskNameCompleted: {
    textDecorationLine: 'line-through',
    color: '#666',
  },
  recommendedBadge: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  recommendedText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  taskMeta: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    marginBottom: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: '#666',
  },
  typeBadge: {
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeText: {
    fontSize: 11,
    color: '#666',
  },
  swipeHint: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  checkboxChecked: {
    backgroundColor: '#f3e8ff',
    borderColor: '#8b5cf6',
  },
});