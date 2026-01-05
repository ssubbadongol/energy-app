// FILE: app/(tabs)/index.tsx
// This is your main home screen with tasks

import { Check, Clock, Coffee, Moon, Plus, Zap } from 'lucide-react-native';
import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

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
  const [showAddTask, setShowAddTask] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([
    { id: 1, name: 'Write client proposal', priority: 'high', energy: 'high', time: 60, type: 'Deep focus', completed: false },
    { id: 2, name: 'Reply to emails', priority: 'medium', energy: 'low', time: 20, type: 'Admin', completed: false },
    { id: 3, name: 'Review design mockups', priority: 'high', energy: 'medium', time: 30, type: 'Creative', completed: false },
    { id: 4, name: 'Organize files', priority: 'low', energy: 'low', time: 15, type: 'Admin', completed: false },
    { id: 5, name: 'Schedule team meeting', priority: 'medium', energy: 'low', time: 10, type: 'Admin', completed: false },
    { id: 6, name: 'Brainstorm campaign ideas', priority: 'medium', energy: 'high', time: 45, type: 'Creative', completed: true },
  ]);

  // New task form state
  const [newTask, setNewTask] = useState({
    name: '',
    priority: 'medium' as Priority,
    energy: 'medium' as EnergyLevel,
    time: 30,
    type: 'Admin'
  });

  const energyMatch = (taskEnergy: EnergyLevel) => {
    if (currentEnergy === 'high') return true;
    if (currentEnergy === 'medium' && taskEnergy !== 'high') return true;
    if (currentEnergy === 'low' && taskEnergy === 'low') return true;
    return false;
  };

  const toggleTask = (id: number) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const addTask = () => {
    if (!newTask.name.trim()) return;
    
    const task: Task = {
      id: Date.now(),
      ...newTask,
      completed: false
    };
    
    setTasks([...tasks, task]);
    setNewTask({ name: '', priority: 'medium', energy: 'medium', time: 30, type: 'Admin' });
    setShowAddTask(false);
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

  const TaskCard = ({ task, suggested }: { task: Task; suggested: boolean }) => {
    const colors = getPriorityColor(task.priority);
    const EnergyIcon = getEnergyIcon(task.energy);

    return (
      <View style={[styles.taskCard, { borderLeftColor: colors.border, backgroundColor: colors.bg }, !suggested && styles.taskCardFaded]}>
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
              <View style={styles.typeBadge}>
                <Text style={styles.typeText}>{task.type}</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity 
            onPress={() => toggleTask(task.id)}
            style={[styles.checkbox, task.completed && styles.checkboxChecked]}
          >
            {task.completed && <Check size={16} color="#8b5cf6" />}
          </TouchableOpacity>
        </View>
      </View>
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
            <TaskCard key={task.id} task={task} suggested={true} />
          ))}
        </View>

        {otherTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.laterTitle}>Save these for later ({otherTasks.length}) • Not matched to current energy</Text>
            {otherTasks.map(task => (
              <TaskCard key={task.id} task={task} suggested={false} />
            ))}
          </View>
        )}

        {completedTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.completedTitle}>Completed Today 🎉</Text>
            {completedTasks.map(task => (
              <TaskCard key={task.id} task={task} suggested={false} />
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add Task Button */}
      <TouchableOpacity 
        style={styles.fab}
        onPress={() => setShowAddTask(true)}
      >
        <Plus size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add Task Modal */}
      <Modal
        visible={showAddTask}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add New Task</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Task name"
              value={newTask.name}
              onChangeText={(text) => setNewTask({...newTask, name: text})}
            />

            <Text style={styles.label}>Priority</Text>
            <View style={styles.optionRow}>
              {(['high', 'medium', 'low'] as Priority[]).map(p => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setNewTask({...newTask, priority: p})}
                  style={[styles.optionButton, newTask.priority === p && styles.optionButtonActive]}
                >
                  <Text style={styles.optionText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Energy Required</Text>
            <View style={styles.optionRow}>
              {(['high', 'medium', 'low'] as EnergyLevel[]).map(e => (
                <TouchableOpacity
                  key={e}
                  onPress={() => setNewTask({...newTask, energy: e})}
                  style={[styles.optionButton, newTask.energy === e && styles.optionButtonActive]}
                >
                  <Text style={styles.optionText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Time (minutes)</Text>
            <TextInput
              style={styles.input}
              placeholder="30"
              keyboardType="numeric"
              value={String(newTask.time)}
              onChangeText={(text) => setNewTask({...newTask, time: parseInt(text) || 0})}
            />

            <Text style={styles.label}>Task Type</Text>
            <View style={styles.optionRow}>
              {['Admin', 'Deep focus', 'Creative', 'Physical'].map(type => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setNewTask({...newTask, type})}
                  style={[styles.optionButton, newTask.type === type && styles.optionButtonActive]}
                >
                  <Text style={styles.optionText}>{type}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowAddTask(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.addButton]}
                onPress={addTask}
              >
                <Text style={styles.addButtonText}>Add Task</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  taskCard: {
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
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
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#111',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionButtonActive: {
    backgroundColor: '#f3e8ff',
    borderColor: '#8b5cf6',
  },
  optionText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  addButton: {
    backgroundColor: '#8b5cf6',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});