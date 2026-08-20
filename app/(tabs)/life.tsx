import { Check, Coffee as CoffeeIcon, Edit2, Heart, LucideIcon, Moon, Plus, Settings, Sun } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadows, typography } from '@/theme';
import { getLifeTasks, initializeLifeTasks, LifeTask, TimeOfDay, toggleLifeTaskCompleted, toggleLifeTaskEnabled } from '../lifeTaskStorage';
import LifeTaskModal from './LifeTaskModal';
import { pinTaskToNotification } from './notificationService';

export default function LifeTasksScreen() {
  const [tasks, setTasks] = useState<LifeTask[]>([]);
  const [showSetup, setShowSetup] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const isModalOpenRef = useRef(false);
  const [editingTask, setEditingTask] = useState<LifeTask | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  useEffect(() => {
    initializeLifeTasks().then(() => setTasks(getLifeTasks()));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isModalOpenRef.current) setTasks(getLifeTasks());
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    isModalOpenRef.current = showEditModal;
  }, [showEditModal]);

  const enabledTasks = tasks.filter(t => t.enabled);
  const hasAnyEnabled = enabledTasks.length > 0;

  const groupedTasks: Record<TimeOfDay, LifeTask[]> = {
    morning: tasks.filter(t => t.timeOfDay === 'morning'),
    midday:  tasks.filter(t => t.timeOfDay === 'midday'),
    evening: tasks.filter(t => t.timeOfDay === 'evening'),
  };

  const getTimeIcon = (timeOfDay: TimeOfDay): LucideIcon => {
    switch (timeOfDay) {
      case 'morning': return Sun;
      case 'midday':  return CoffeeIcon;
      case 'evening': return Moon;
    }
  };

  const getTimeColor = (timeOfDay: TimeOfDay) => {
    switch (timeOfDay) {
      case 'morning': return colors.warning;
      case 'midday':  return colors.accent;
      case 'evening': return '#38BDF8';
    }
  };

  const getTimeLabel = (timeOfDay: TimeOfDay) => {
    switch (timeOfDay) {
      case 'morning': return 'Morning';
      case 'midday':  return 'Midday';
      case 'evening': return 'Evening';
    }
  };

  const handleToggleTask    = async (id: string) => { await toggleLifeTaskCompleted(id); setTasks(getLifeTasks()); };
  const handleToggleEnabled = async (id: string) => { await toggleLifeTaskEnabled(id);   setTasks(getLifeTasks()); };

  const handleLongPressLifeTask = (task: LifeTask) => {
    pinTaskToNotification({
      id: task.id, name: task.name, type: 'life',
      emoji: task.emoji, timeWindow: task.timeWindow,
      repeats: task.repeats, completedCount: task.completedCount,
    });
    Alert.alert('Pinned', `"${task.name}" is now in your notification tray`);
  };

  const openEditModal   = (task: LifeTask)  => { setEditingTask(task); setIsCreatingNew(false); setShowEditModal(true); };
  const openCreateModal = (tod: TimeOfDay)  => { setEditingTask({ timeOfDay: tod } as LifeTask); setIsCreatingNew(true); setShowEditModal(true); };

  const getCompletedCount = (tod: TimeOfDay) => {
    const day   = enabledTasks.filter(t => t.timeOfDay === tod);
    const done  = day.filter(t => t.completed).length;
    return { completed: done, total: day.length };
  };

  // ── Setup screen ─────────────────────────────────────────────────────────────
  if (showSetup) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View pointerEvents="none" style={s.ambientGlow} />
        <ScrollView style={s.scrollView} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={s.setupHeader}>
            <Text style={s.title}>Reminders</Text>
            <Text style={s.subtitle}>Toggle, edit, or create daily habits</Text>
          </View>

          {(['morning', 'midday', 'evening'] as TimeOfDay[]).map(tod => {
            const Icon  = getTimeIcon(tod);
            const color = getTimeColor(tod);
            return (
              <View key={tod} style={s.setupSection}>
                <View style={[s.setupSectionHeader, { borderColor: color + '40' }]}>
                  <View style={s.setupSectionLeft}>
                    <Icon size={16} color={color} strokeWidth={1.5} />
                    <Text style={[s.setupSectionTitle, { color }]}>{getTimeLabel(tod)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => openCreateModal(tod)} style={s.addBtn}>
                    <Plus size={16} color={color} strokeWidth={1.5} />
                  </TouchableOpacity>
                </View>

                {groupedTasks[tod].map(task => (
                  <View key={task.id} style={s.setupItem}>
                    <View style={s.setupItemLeft}>
                      <Text style={s.setupItemEmoji}>{task.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.setupItemName}>{task.name}</Text>
                        <Text style={s.setupItemTime}>{task.timeWindow}</Text>
                      </View>
                    </View>
                    <View style={s.setupItemRight}>
                      <TouchableOpacity onPress={() => openEditModal(task)} style={s.editIconBtn}>
                        <Edit2 size={14} color={colors.textMuted} strokeWidth={1.5} />
                      </TouchableOpacity>
                      <Switch
                        value={task.enabled}
                        onValueChange={() => handleToggleEnabled(task.id)}
                        trackColor={{ false: colors.bgElevated, true: colors.accent + '60' }}
                        thumbColor={task.enabled ? colors.accent : colors.textMuted}
                      />
                    </View>
                  </View>
                ))}
              </View>
            );
          })}

          <TouchableOpacity style={s.doneButton} onPress={() => setShowSetup(false)} activeOpacity={0.8}>
            <Text style={s.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>

        <LifeTaskModal
          visible={showEditModal} task={editingTask} isCreatingNew={isCreatingNew}
          onClose={() => setShowEditModal(false)} onSave={() => setTasks(getLifeTasks())}
        />
      </SafeAreaView>
    );
  }

  // ── Empty screen ─────────────────────────────────────────────────────────────
  if (!hasAnyEnabled) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View pointerEvents="none" style={s.ambientGlow} />
        <ScrollView style={s.scrollView} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={s.emptyState}>
            <View style={s.emptyIconWrap}>
              <Heart size={28} color={colors.accent} strokeWidth={1.5} />
            </View>
            <Text style={s.emptyTitle}>Life Tasks</Text>
            <Text style={s.emptyBody}>
              Gentle nudges for self-care — meals, hydration, rest. No pressure, just support.
            </Text>
            <TouchableOpacity style={s.setupButton} onPress={() => setShowSetup(true)} activeOpacity={0.8}>
              <Text style={s.setupButtonText}>Choose Your Reminders</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Main screen ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View pointerEvents="none" style={s.ambientGlow} />
      <ScrollView style={s.scrollView} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">

        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Life Tasks</Text>
            <Text style={s.subtitle}>Taking care of yourself 💙</Text>
          </View>
          <TouchableOpacity onPress={() => setShowSetup(true)} style={s.settingsBtn} activeOpacity={0.7}>
            <Settings size={18} color={colors.textMuted} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>

        {(['morning', 'midday', 'evening'] as TimeOfDay[]).map(tod => {
          const Icon  = getTimeIcon(tod);
          const color = getTimeColor(tod);
          const { completed, total } = getCompletedCount(tod);
          const todTasks = enabledTasks.filter(t => t.timeOfDay === tod);
          if (total === 0) return null;

          return (
            <View key={tod} style={s.section}>
              <View style={s.sectionHeader}>
                <Icon size={16} color={color} strokeWidth={1.5} />
                <Text style={[s.sectionTitle, { color }]}>{getTimeLabel(tod)}</Text>
                <View style={s.progressPill}>
                  <Text style={s.progressText}>{completed}/{total}</Text>
                </View>
              </View>

              {todTasks.map(task => (
                <TouchableOpacity
                  key={task.id}
                  onPress={() => handleToggleTask(task.id)}
                  onLongPress={() => handleLongPressLifeTask(task)}
                  delayLongPress={500}
                  activeOpacity={0.8}
                  style={[s.taskCard, task.completed && s.taskCardDone]}
                >
                  <View style={[s.checkbox, task.completed && s.checkboxDone]}>
                    {task.completed && <Check size={14} color="#fff" strokeWidth={2} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.taskNameRow}>
                      <Text style={s.taskEmoji}>{task.emoji}</Text>
                      <Text style={[s.taskName, task.completed && s.taskNameDone]}>
                        {task.name}
                      </Text>
                    </View>
                    <Text style={s.taskTime}>{task.timeWindow}</Text>
                    {task.repeats && task.repeats > 1 && (
                      <View style={s.dotsRow}>
                        {Array.from({ length: task.repeats }).map((_, i) => (
                          <View key={i} style={[s.dot, i < task.completedCount && s.dotFilled]} />
                        ))}
                        <Text style={s.dotLabel}>
                          {task.completed ? 'All done 🎉' : task.completedCount > 0 ? `${task.completedCount}/${task.repeats}` : `${task.repeats}×`}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}

        <View style={s.encouragement}>
          <Text style={s.encouragementText}>
            {enabledTasks.filter(t => t.completed).length === enabledTasks.length
              ? "You've taken care of yourself today ✦"
              : "These are gentle reminders, not obligations 💙"}
          </Text>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: colors.bgBase },
  scrollView:  { flex: 1 },
  scrollContent: { padding: 20 },
  ambientGlow: {
    position: 'absolute', top: -80, alignSelf: 'center',
    width: 360, height: 360, borderRadius: 180,
    backgroundColor: colors.accentDim, opacity: 0.7,
  },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, paddingTop: 8 },
  title:  { fontFamily: typography.displayFont, fontSize: 28, color: colors.textPrimary, letterSpacing: -0.5, marginBottom: 3 },
  subtitle: { fontFamily: typography.bodyFont, fontSize: 13, color: colors.textMuted },
  settingsBtn: {
    width: 36, height: 36, borderRadius: radius.md,
    backgroundColor: colors.bgSubtle, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },

  // Setup
  setupHeader: { marginBottom: 28, paddingTop: 8 },
  setupSection: { marginBottom: 20 },
  setupSectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md,
    borderWidth: 1, backgroundColor: colors.bgSurface, marginBottom: 8,
  },
  setupSectionLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  setupSectionTitle: { fontFamily: typography.uiFont, fontSize: 13, letterSpacing: 0.3 },
  addBtn: {
    width: 28, height: 28, borderRadius: radius.sm,
    backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center',
  },
  setupItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: colors.bgSurface, borderRadius: radius.md,
    marginBottom: 6, borderWidth: 1, borderColor: colors.borderSubtle,
  },
  setupItemLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  setupItemRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editIconBtn:    { padding: 4 },
  setupItemEmoji: { fontSize: 22 },
  setupItemName:  { fontFamily: typography.uiFont,  fontSize: 14, color: colors.textPrimary },
  setupItemTime:  { fontFamily: typography.bodyFont, fontSize: 12, color: colors.textMuted, marginTop: 1 },
  doneButton: {
    backgroundColor: colors.accent, paddingVertical: 15, borderRadius: radius.md,
    alignItems: 'center', marginTop: 16, ...shadows.accent,
  },
  doneButtonText: { fontFamily: typography.uiFont, fontSize: 16, color: '#FFFFFF' },

  // Empty
  emptyState:    { alignItems: 'center', paddingTop: 80, paddingHorizontal: 24 },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: radius.full,
    backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontFamily: typography.headingFont, fontSize: 22, color: colors.textPrimary, marginBottom: 10 },
  emptyBody:  { fontFamily: typography.bodyFont,   fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  setupButton: {
    backgroundColor: colors.accent, paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: radius.md, ...shadows.accent,
  },
  setupButtonText: { fontFamily: typography.uiFont, fontSize: 15, color: '#FFFFFF' },

  // Section
  section:       { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle:  { fontFamily: typography.uiFont, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase', flex: 1 },
  progressPill:  { backgroundColor: colors.bgElevated, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  progressText:  { fontFamily: typography.uiFont, fontSize: 11, color: colors.textMuted },

  // Task card
  taskCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: colors.bgSurface, borderRadius: radius.lg,
    padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  taskCardDone: { borderColor: colors.success + '30', backgroundColor: colors.successDim },
  checkbox: {
    width: 22, height: 22, borderRadius: radius.full,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkboxDone: { backgroundColor: colors.success, borderColor: colors.success },
  taskNameRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  taskEmoji:    { fontSize: 18 },
  taskName:     { fontFamily: typography.uiFont, fontSize: 15, color: colors.textPrimary, flex: 1 },
  taskNameDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  taskTime:     { fontFamily: typography.bodyFont, fontSize: 12, color: colors.textMuted, marginBottom: 6 },
  dotsRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot:          { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotFilled:    { backgroundColor: colors.success },
  dotLabel:     { fontFamily: typography.bodyFont, fontSize: 11, color: colors.textMuted, marginLeft: 2 },

  // Encouragement
  encouragement: {
    backgroundColor: colors.bgSurface, padding: 16, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.borderSubtle, marginTop: 8,
  },
  encouragementText: { fontFamily: typography.bodyFont, fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
