import { Check, Pin, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { toggleLifeTaskCompleted } from '../lifeTaskStorage';
import { clearPinnedTask, getPinnedTask, PinnedTask } from '../pinnedTaskStorage';
import { getSharedTasks, updateSharedTasks } from '../taskStorage';

interface PinnedTaskBannerProps {
  onUpdate?: () => void;
}

export default function PinnedTaskBanner({ onUpdate }: PinnedTaskBannerProps) {
  const [pinnedTask, setPinnedTaskState] = useState<PinnedTask | null>(null);

  useEffect(() => {
    // Check for pinned task every 500ms
    const interval = setInterval(() => {
      const task = getPinnedTask();
      setPinnedTaskState(task);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleDone = () => {
    if (!pinnedTask) return;

    if (pinnedTask.type === 'task') {
      // Mark regular task as complete
      const tasks = getSharedTasks();
      const updatedTasks = tasks.map(t => 
        t.id === pinnedTask.id ? { ...t, completed: true } : t
      );
      updateSharedTasks(updatedTasks);
      
      Alert.alert('Great job! 🎉', `"${pinnedTask.name}" completed!`);
    } else if (pinnedTask.type === 'life') {
      // Mark life task as complete
      toggleLifeTaskCompleted(pinnedTask.id as string);
      Alert.alert('Nice! 💙', `"${pinnedTask.name}" done!`);
    }

    clearPinnedTask();
    setPinnedTaskState(null);
    onUpdate?.();
  };

  const handleUnpin = () => {
    Alert.alert(
      'Unpin task?',
      `Remove "${pinnedTask?.name}" from focus?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpin',
          onPress: () => {
            clearPinnedTask();
            setPinnedTaskState(null);
            onUpdate?.();
          },
        },
      ]
    );
  };

  if (!pinnedTask) return null;

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <View style={styles.header}>
          <Pin size={14} color="#8b5cf6" />
          <Text style={styles.headerText}>Energy – Focus mode</Text>
        </View>
        
        <View style={styles.content}>
          {pinnedTask.emoji && (
            <Text style={styles.emoji}>{pinnedTask.emoji}</Text>
          )}
          <View style={styles.textContainer}>
            <Text style={styles.taskName} numberOfLines={1}>
              {pinnedTask.name}
            </Text>
            {pinnedTask.time && (
              <Text style={styles.taskMeta}>{pinnedTask.time}m task</Text>
            )}
            {pinnedTask.timeWindow && (
              <Text style={styles.taskMeta}>{pinnedTask.timeWindow}</Text>
            )}
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity 
            style={[styles.actionButton, styles.doneButton]}
            onPress={handleDone}
          >
            <Check size={16} color="#fff" />
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionButton, styles.unpinButton]}
            onPress={handleUnpin}
          >
            <X size={16} color="#9090b0" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#ede9f8',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 92, 246, 0.1)',
  },
  banner: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    borderTopColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  headerText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 11,
    color: '#8b5cf6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  emoji: {
    fontSize: 24,
  },
  textContainer: {
    flex: 1,
  },
  taskName: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 15,
    color: '#1a0a3e',
    marginBottom: 2,
  },
  taskMeta: {
    fontFamily: 'Nunito-Regular',
    fontSize: 12,
    color: '#6b6b8a',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 4,
  },
  doneButton: {
    flex: 1,
    backgroundColor: '#7c3aed',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  doneButtonText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 14,
    color: '#fff',
  },
  unpinButton: {
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
  },
});