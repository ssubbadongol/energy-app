import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '@/theme';
import { TaskForm, TaskFormValues } from './TaskForm';
import { scheduleTaskNotifications } from './taskNotificationService';
import { addTask, updateTask } from './taskStorage';

export default function AddTaskScreen() {
  const [formKey, setFormKey] = useState(0);

  const resetForm = () => setFormKey(k => k + 1);

  const handleSave = async (values: TaskFormValues) => {
    const newTask = addTask({
      name: values.name,
      description: values.description.trim() || undefined,
      priority: values.priority,
      energy: values.energy,
      time: values.time,
      type: values.type,
      completed: false,
      dueDate: values.dueDate.toISOString(),
      dueTime: values.dueTime ?? undefined,
      notificationIds: [],
    });

    if (values.dueTime) {
      const ids = await scheduleTaskNotifications({
        id: newTask.id,
        name: newTask.name,
        description: newTask.description,
        dueDate: newTask.dueDate,
        dueTime: newTask.dueTime,
        time: newTask.time,
      });
      if (ids.length > 0) {
        updateTask(newTask.id, { notificationIds: ids });
      }
      Alert.alert(
        'Task added',
        `"${values.name}" saved · ${values.time} mins`,
        [
          { text: 'Add Another', onPress: resetForm },
          { text: 'Done', onPress: resetForm },
        ]
      );
    } else {
      Alert.alert('Task added', `"${values.name}" saved.`, [
        { text: 'Add Another', onPress: resetForm },
        { text: 'Done', onPress: resetForm },
      ]);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Ambient glow */}
      <View pointerEvents="none" style={s.ambientGlow} />

      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <Text style={s.title}>New Task</Text>
          <Text style={s.subtitle}>Plan it once, do it right</Text>
        </View>

        <TaskForm key={formKey} onSave={handleSave} saveLabel="Add Task" />
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
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  header: {
    marginBottom: 28,
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
});
