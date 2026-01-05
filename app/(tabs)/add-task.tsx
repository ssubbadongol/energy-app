import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type EnergyLevel = 'high' | 'medium' | 'low';
type Priority = 'high' | 'medium' | 'low';

export default function AddTaskScreen() {
  const [taskName, setTaskName] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [energy, setEnergy] = useState<EnergyLevel>('medium');
  const [time, setTime] = useState('30');
  const [taskType, setTaskType] = useState('');

  const handleAddTask = () => {
    if (!taskName.trim()) {
      Alert.alert('Error', 'Please enter a task name');
      return;
    }

    Alert.alert('Success', 'Task added!', [
      { text: 'Add Another', onPress: () => {
        setTaskName('');
        setTime('30');
        setTaskType('');
      }},
      { text: 'Done', onPress: () => {
        setTaskName('');
        setTime('30');
        setTaskType('');
      }}
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Add New Task</Text>

      <View style={styles.section}>
        <Text style={styles.label}>Task Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Write project report"
          value={taskName}
          onChangeText={setTaskName}
          multiline
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Priority *</Text>
        <View style={styles.optionRow}>
          {(['high', 'medium', 'low'] as Priority[]).map(p => (
            <TouchableOpacity
              key={p}
              onPress={() => setPriority(p)}
              style={[styles.optionButton, priority === p && styles.optionButtonActive]}
            >
              <Text style={[styles.optionText, priority === p && styles.optionTextActive]}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Energy Required *</Text>
        <View style={styles.optionRow}>
          {(['high', 'medium', 'low'] as EnergyLevel[]).map(e => (
            <TouchableOpacity
              key={e}
              onPress={() => setEnergy(e)}
              style={[styles.optionButton, energy === e && styles.optionButtonActive]}
            >
              <Text style={[styles.optionText, energy === e && styles.optionTextActive]}>
                {e.charAt(0).toUpperCase() + e.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Estimated Time (minutes) *</Text>
        <TextInput
          style={styles.input}
          placeholder="30"
          value={time}
          onChangeText={setTime}
          keyboardType="numeric"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Task Type (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Admin, Creative, Deep focus"
          value={taskType}
          onChangeText={setTaskType}
        />
        <View style={styles.optionRow}>
          {['Admin', 'Deep focus', 'Creative', 'Physical'].map(type => (
            <TouchableOpacity
              key={type}
              onPress={() => setTaskType(type)}
              style={styles.suggestionChip}
            >
              <Text style={styles.suggestionText}>{type}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.addButton} onPress={handleAddTask}>
        <Text style={styles.addButtonText}>Add Task</Text>
      </TouchableOpacity>

      <Text style={styles.requiredNote}>* Required fields</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  optionButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
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
    color: '#666',
    fontWeight: '500',
  },
  optionTextActive: {
    color: '#8b5cf6',
    fontWeight: '600',
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  suggestionText: {
    fontSize: 12,
    color: '#666',
  },
  addButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  addButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  requiredNote: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 12,
  },
});