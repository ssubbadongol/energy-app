import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar, Trash2, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { deleteTask, Task, updateTask } from '../taskStorage';

type EnergyLevel = 'high' | 'medium' | 'low';
type Priority = 'high' | 'medium' | 'low';

interface TaskEditModalProps {
  visible: boolean;
  task: Task | null;
  onClose: () => void;
  onSave: () => void;
}

export default function TaskEditModal({ visible, task, onClose, onSave }: TaskEditModalProps) {
  const [taskName, setTaskName] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [energy, setEnergy] = useState<EnergyLevel>('medium');
  const [timeInMinutes, setTimeInMinutes] = useState(30);
  const [taskType, setTaskType] = useState('');
  const [dueDate, setDueDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    if (visible && task) {
      setTaskName(task.name);
      setPriority(task.priority);
      setEnergy(task.energy);
      setTimeInMinutes(task.time);
      setTaskType(task.type || '');
      setDueDate(task.dueDate ? new Date(task.dueDate) : new Date());
    }
  }, [visible, task]);

  const handleSave = async () => {
    if (!taskName.trim()) {
      Alert.alert('Error', 'Please enter a task name');
      return;
    }

    if (!task) return;

    await updateTask(task.id, {
      name: taskName,
      priority,
      energy,
      time: timeInMinutes,
      type: taskType,
      dueDate: dueDate.toISOString(),
    });

    Alert.alert('Success', 'Task updated!');
    onSave();
    onClose();
  };

  const handleDelete = () => {
    if (!task) return;

    Alert.alert(
      'Delete Task',
      `Are you sure you want to delete "${taskName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTask(task.id);
            Alert.alert('Deleted', 'Task removed successfully');
            onSave();
            onClose();
          },
        },
      ]
    );
  };

  const formatDate = (date: Date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  const getTimePickerValue = () => {
    const date = new Date();
    date.setHours(Math.floor(timeInMinutes / 60));
    date.setMinutes(timeInMinutes % 60);
    date.setSeconds(0);
    return date;
  };

  const handleTimeChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    
    if (selectedDate) {
      const hours = selectedDate.getHours();
      const minutes = selectedDate.getMinutes();
      const totalMinutes = (hours * 60) + minutes;
      setTimeInMinutes(totalMinutes > 0 ? totalMinutes : 1);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Task</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
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
              <Text style={styles.label}>Due Date *</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Calendar size={20} color="#666" />
                <Text style={styles.dateButtonText}>{formatDate(dueDate)}</Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={dueDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (selectedDate) {
                      setDueDate(selectedDate);
                    }
                  }}
                />
              )}
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
              <Text style={styles.label}>Estimated Time *</Text>
              <TouchableOpacity
                style={styles.timeButton}
                onPress={() => setShowTimePicker(true)}
              >
                <Text style={styles.timeButtonText}>{formatTime(timeInMinutes)}</Text>
              </TouchableOpacity>
              {showTimePicker && (
                <DateTimePicker
                  value={getTimePickerValue()}
                  mode="time"
                  is24Hour={true}
                  display={Platform.OS === 'ios' ? 'spinner' : 'spinner'}
                  onChange={handleTimeChange}
                  minuteInterval={5}
                />
              )}
              {Platform.OS === 'ios' && showTimePicker && (
                <TouchableOpacity
                  style={styles.doneButton}
                  onPress={() => setShowTimePicker(false)}
                >
                  <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
              )}
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

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={handleDelete}
              >
                <Trash2 size={18} color="#ef4444" />
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111',
  },
  section: {
    marginBottom: 20,
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
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#333',
  },
  timeButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  timeButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  doneButton: {
    marginTop: 12,
    backgroundColor: '#8b5cf6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
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
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    marginBottom: 20,
  },
  deleteButton: {
    flex: 0.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#fee2e2',
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
  },
  saveButton: {
    flex: 0.6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});