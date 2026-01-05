import { Clock, Coffee, Moon, Zap } from 'lucide-react-native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

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

export default function AllTasksScreen() {
  const [tasks] = useState<Task[]>([
    { id: 1, name: 'Write client proposal', priority: 'high', energy: 'high', time: 60, type: 'Deep focus', completed: false },
    { id: 2, name: 'Reply to emails', priority: 'medium', energy: 'low', time: 20, type: 'Admin', completed: false },
    { id: 3, name: 'Review design mockups', priority: 'high', energy: 'medium', time: 30, type: 'Creative', completed: false },
    { id: 4, name: 'Organize files', priority: 'low', energy: 'low', time: 15, type: 'Admin', completed: false },
  ]);

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

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>All Tasks</Text>
          <Text style={styles.subtitle}>{tasks.length} total tasks</Text>
        </View>

        {tasks.map(task => {
          const colors = getPriorityColor(task.priority);
          const EnergyIcon = getEnergyIcon(task.energy);
          
          return (
            <View 
              key={task.id}
              style={[styles.taskCard, { borderLeftColor: colors.border, backgroundColor: colors.bg }]}
            >
              <Text style={styles.taskName}>{task.name}</Text>
              <View style={styles.taskMeta}>
                <View style={styles.metaItem}>
                  <Clock size={16} color="#666" />
                  <Text style={styles.metaText}>{task.time}m</Text>
                </View>
                <View style={styles.metaItem}>
                  <EnergyIcon size={16} color={getEnergyColor(task.energy)} />
                  <Text style={styles.metaText}>{task.energy} energy</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaText}>Priority: {task.priority}</Text>
                </View>
                {task.type && (
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeText}>{task.type}</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
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
    marginBottom: 24,
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
  taskCard: {
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  taskName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginBottom: 8,
  },
  taskMeta: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    flexWrap: 'wrap',
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
});