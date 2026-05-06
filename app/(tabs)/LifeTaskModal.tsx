import { Trash2, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LifeTask, TimeOfDay, addLifeTask, deleteLifeTask, updateLifeTask } from './lifeTaskStorage';

interface LifeTaskModalProps {
  visible: boolean;
  task: LifeTask | null;
  isCreatingNew: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function LifeTaskModal({ visible, task, isCreatingNew, onClose, onSave }: LifeTaskModalProps) {
  const [formEmoji, setFormEmoji] = useState('');
  const [formName, setFormName] = useState('');
  const [formTimeWindow, setFormTimeWindow] = useState('');
  const [formTimeOfDay, setFormTimeOfDay] = useState<TimeOfDay>('morning');
  const [formRepeats, setFormRepeats] = useState<number>(1);

  useEffect(() => {
    if (visible && task && !isCreatingNew) {
      setFormEmoji(task.emoji);
      setFormName(task.name);
      setFormTimeWindow(task.timeWindow);
      setFormTimeOfDay(task.timeOfDay);
      setFormRepeats(task.repeats || 1);
    } else if (visible && isCreatingNew) {
      setFormEmoji('✨');
      setFormName('');
      setFormTimeWindow('');
      setFormTimeOfDay(task?.timeOfDay || 'morning');
      setFormRepeats(1);
    }
  }, [visible, task, isCreatingNew]);

  const getTimeColor = (timeOfDay: TimeOfDay) => {
    switch(timeOfDay) {
      case 'morning': return '#F59E0B';
      case 'midday': return '#8b5cf6';
      case 'evening': return '#38BDF8';
    }
  };

  const handleSave = () => {
    if (!formName.trim() || !formTimeWindow.trim()) {
      Alert.alert('Error', 'Please fill in task name and time window');
      return;
    }

    if (isCreatingNew) {
      addLifeTask({
        emoji: formEmoji || '✨',
        name: formName,
        timeWindow: formTimeWindow,
        timeOfDay: formTimeOfDay,
        enabled: true,
        isDefault: false,
        repeats: formRepeats,
      });
    } else if (task) {
      updateLifeTask(task.id, {
        emoji: formEmoji,
        name: formName,
        timeWindow: formTimeWindow,
        timeOfDay: formTimeOfDay,
        repeats: formRepeats,
      });
    }

    onSave();
    onClose();
  };

  const handleDelete = () => {
    if (!task) return;
    
    Alert.alert(
      'Delete Task',
      `Remove "${formName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteLifeTask(task.id);
            onSave();
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      {visible && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isCreatingNew ? 'Add Life Task' : 'Edit Task'}
              </Text>
              <TouchableOpacity onPress={onClose}>
                <X size={24} color="#9090b0" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Emoji</Text>
                <TextInput
                  style={styles.emojiInput}
                  value={formEmoji}
                  onChangeText={setFormEmoji}
                  placeholder="✨"
                  placeholderTextColor="#b0aac8"
                  maxLength={2}
                />
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Task Name *</Text>
                <TextInput
                  style={styles.input}
                  value={formName}
                  onChangeText={setFormName}
                  placeholder="e.g., Meditate"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Time Window *</Text>
                <TextInput
                  style={styles.input}
                  value={formTimeWindow}
                  onChangeText={setFormTimeWindow}
                  placeholder="e.g., 7–9 AM"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />
                <Text style={styles.formHint}>Use format: &quot;7–9 AM&quot; or &quot;12–2 PM&quot;</Text>
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Time of Day *</Text>
                <View style={styles.timeOfDayButtons}>
                  {(['morning', 'midday', 'evening'] as TimeOfDay[]).map(tod => (
                    <TouchableOpacity
                      key={tod}
                      onPress={() => setFormTimeOfDay(tod)}
                      style={[
                        styles.timeOfDayButton,
                        formTimeOfDay === tod && { backgroundColor: getTimeColor(tod) }
                      ]}
                    >
                      <Text style={[
                        styles.timeOfDayButtonText,
                        formTimeOfDay === tod && styles.timeOfDayButtonTextActive
                      ]}>
                        {tod.charAt(0).toUpperCase() + tod.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Repeat (optional)</Text>
                <Text style={styles.formHint}>How many times per day?</Text>
                <View style={styles.repeatButtons}>
                  {[1, 2, 3, 4, 5].map(count => (
                    <TouchableOpacity
                      key={count}
                      onPress={() => setFormRepeats(count)}
                      style={[
                        styles.repeatButton,
                        formRepeats === count && styles.repeatButtonActive
                      ]}
                    >
                      <Text style={[
                        styles.repeatButtonText,
                        formRepeats === count && styles.repeatButtonTextActive
                      ]}>
                        {count === 1 ? 'Once' : `${count}x`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {formRepeats > 1 && (
                  <Text style={styles.repeatHint}>
                    💡 Perfect for hydration, meds, or frequent check-ins
                  </Text>
                )}
              </View>

              <View style={styles.modalButtons}>
                {!isCreatingNew && task && (
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={handleDelete}
                  >
                    <Trash2 size={18} color="#ef4444" />
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.saveButton, { flex: isCreatingNew ? 1 : 0.6 }]}
                  onPress={handleSave}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26, 10, 62, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#f5f3ff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.18)',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontFamily: 'Nunito-Bold',
    fontSize: 22,
    color: '#1a0a3e',
  },
  formSection: {
    marginBottom: 20,
  },
  formLabel: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 14,
    color: '#3b2070',
    marginBottom: 8,
  },
  emojiInput: {
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
    borderTopColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 12,
    fontSize: 32,
    textAlign: 'center',
    width: 80,
    backgroundColor: '#fff',
    color: '#1a0a3e',
  },
  input: {
    fontFamily: 'Nunito-Regular',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
    borderTopColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#1a0a3e',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  formHint: {
    fontFamily: 'Nunito-Regular',
    fontSize: 12,
    color: '#9090b0',
    marginTop: 4,
  },
  timeOfDayButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  timeOfDayButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
  },
  timeOfDayButtonText: {
    fontFamily: 'Nunito-Medium',
    fontSize: 14,
    color: '#5a5075',
  },
  timeOfDayButtonTextActive: {
    fontFamily: 'Nunito-SemiBold',
    color: '#fff',
  },
  repeatButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  repeatButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
  },
  repeatButtonActive: {
    backgroundColor: '#ede9fe',
    borderColor: '#8b5cf6',
  },
  repeatButtonText: {
    fontFamily: 'Nunito-Medium',
    fontSize: 14,
    color: '#5a5075',
  },
  repeatButtonTextActive: {
    fontFamily: 'Nunito-SemiBold',
    color: '#7c3aed',
  },
  repeatHint: {
    fontFamily: 'Nunito-Regular',
    fontSize: 12,
    color: '#7c3aed',
    marginTop: 8,
    fontStyle: 'italic',
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
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  deleteButtonText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 16,
    color: '#dc2626',
  },
  saveButton: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.5)',
    borderTopColor: 'rgba(196, 181, 253, 0.4)',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  saveButtonText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 16,
    color: '#fff',
  },
});