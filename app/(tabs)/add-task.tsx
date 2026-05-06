import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
<<<<<<< HEAD
import { TaskForm, TaskFormValues } from './TaskForm';
import { scheduleTaskNotifications } from './taskNotificationService';
import { addTask, updateTask } from './taskStorage';
=======
import { addTask, getSharedTasks } from '../taskStorage';

type EnergyLevel = 'high' | 'medium' | 'low';
type Priority = 'high' | 'medium' | 'low';
>>>>>>> 9f2b95e8490cc52c4047002c2d0fb70af828cc7c

export default function AddTaskScreen() {
  // Incrementing this key remounts TaskForm, resetting all its internal state.
  const [formKey, setFormKey] = useState(0);

<<<<<<< HEAD
  const resetForm = () => setFormKey(k => k + 1);

  const handleSave = async (values: TaskFormValues) => {
    const newTask = addTask({
      name: values.name,
      description: values.description.trim() || undefined,
      priority: values.priority,
      energy: values.energy,
      time: values.time,
      type: values.type,
=======
  const handleAddTask = async () => {
    if (!taskName.trim()) {
      Alert.alert('Error', 'Please enter a task name');
      return;
    }

    const newTask = await addTask({
      name: taskName,
      priority,
      energy,
      time: timeInMinutes,
      type: taskType,
>>>>>>> 9f2b95e8490cc52c4047002c2d0fb70af828cc7c
      completed: false,
      dueDate: values.dueDate.toISOString(),
      dueTime: values.dueTime ?? undefined,
      notificationIds: [],
    });

<<<<<<< HEAD
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
        'Task added!',
        `"${values.name}" saved.\n\nEstimated time: ${values.time} mins`,
        [
          { text: 'Add Another', onPress: resetForm },
          { text: 'Done', onPress: resetForm },
        ]
      );
    } else {
      Alert.alert('Task added!', `"${values.name}" saved.`, [
        { text: 'Add Another', onPress: resetForm },
        { text: 'Done', onPress: resetForm },
      ]);
=======
    console.log('✅ NEW TASK ADDED:', newTask);
    console.log('📅 Due date:', dueDate.toISOString());
    console.log('📊 Total tasks now:', getSharedTasks().length);

    Alert.alert('Success', `Task "${taskName}" added!\n\nTotal tasks: ${getSharedTasks().length}`, [
      { text: 'Add Another', onPress: () => {
        setTaskName('');
        setTimeInMinutes(30);
        setTaskType('');
        setDueDate(new Date());
      }},
      { text: 'Done', onPress: () => {
        setTaskName('');
        setTimeInMinutes(30);
        setTaskType('');
        setDueDate(new Date());
      }}
    ]);
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
>>>>>>> 9f2b95e8490cc52c4047002c2d0fb70af828cc7c
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerContainer}>
          <Text style={styles.title}>Add New Task</Text>
          <Text style={styles.subtitle}>Create a task with smart energy matching</Text>
        </View>

        <TaskForm key={formKey} onSave={handleSave} saveLabel="Add Task" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  headerContainer: {
    backgroundColor: '#0F172A',
    marginHorizontal: -20,
    marginTop: -20,
    padding: 24,
    paddingTop: 20,
    marginBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
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
});
