<<<<<<< HEAD
import {
  Calendar, ChevronLeft, ChevronRight, Clock, Coffee,
  Edit2, Moon, Plus, X, Zap,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TaskForm, TaskFormValues } from './TaskForm';
import { addTask, getSharedTasks, Task, updateTask } from './taskStorage';
=======
import { Calendar, Clock, Coffee, Edit2, Moon, Zap } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSharedTasks, initializeTasks, Task } from '../taskStorage';
import TaskEditModal from './TaskEditModal';
>>>>>>> 9f2b95e8490cc52c4047002c2d0fb70af828cc7c

type EnergyLevel = 'high' | 'medium' | 'low';
type SortBy = 'date' | 'priority';

<<<<<<< HEAD
// ── Constants ────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Date helpers ─────────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function getWeekDays(weekOffset: number = 0): Date[] {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const dow = base.getDay();
  const toMon = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(base);
  monday.setDate(base.getDate() + toMon + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function getMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startDow = firstDay.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function weekOffsetForDate(date: Date): number {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const baseDow = base.getDay();
  const baseMonday = new Date(base);
  baseMonday.setDate(base.getDate() + (baseDow === 0 ? -6 : 1 - baseDow));
  const selDow = date.getDay();
  const selMonday = new Date(date);
  selMonday.setDate(date.getDate() + (selDow === 0 ? -6 : 1 - selDow));
  selMonday.setHours(0, 0, 0, 0);
  return Math.round((selMonday.getTime() - baseMonday.getTime()) / (1000 * 60 * 60 * 24 * 7));
}

function formatFullDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[date.getDay()]}, ${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;
}

// ── Energy helpers ───────────────────────────────────────────────────────────

function getEnergyIcon(level: EnergyLevel) {
  if (level === 'high') return Zap;
  if (level === 'medium') return Coffee;
  return Moon;
}

function getEnergyColor(level: EnergyLevel): string {
  if (level === 'high') return '#F59E0B';
  if (level === 'medium') return '#8b5cf6';
  return '#38BDF8';
}

function getEnergyCardColor(level: EnergyLevel): { border: string; bg: string } {
  if (level === 'high') return { border: '#F59E0B', bg: '#fffaf0' };
  if (level === 'medium') return { border: '#8b5cf6', bg: '#f7f3ff' };
  return { border: '#38BDF8', bg: '#f0f8ff' };
}

function formatDateLabel(dateString: string | undefined, today: Date): string {
  if (!dateString) return 'No date';
  const date = new Date(dateString);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, tomorrow)) return 'Tomorrow';
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;
}

// ── Standalone TaskCard ───────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  dimmed?: boolean;
  today: Date;
  onEdit: (task: Task) => void;
}

function TaskCard({ task, dimmed, today, onEdit }: TaskCardProps) {
  const colors = getEnergyCardColor(task.energy as EnergyLevel);
  const EnergyIcon = getEnergyIcon(task.energy as EnergyLevel);
  return (
    <View
      style={[
        styles.taskCard,
        { borderLeftColor: colors.border, backgroundColor: '#FFFFFF' },
        dimmed && styles.taskCardCompleted,
      ]}
    >
      <View style={styles.taskCardHeader}>
        <Text style={[styles.taskName, dimmed && styles.taskNameStrike]} numberOfLines={2}>
          {task.name}
        </Text>
        <TouchableOpacity
          onPress={() => onEdit(task)}
          style={styles.editButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.6}
        >
          <Edit2 size={15} color="#9090b0" />
        </TouchableOpacity>
      </View>
      <View style={styles.taskMeta}>
        <View style={styles.metaItem}>
          <Calendar size={16} color="#9090b0" />
          <Text style={styles.metaText}>{formatDateLabel(task.dueDate, today)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Clock size={16} color="#9090b0" />
          <Text style={styles.metaText}>{task.time}m</Text>
        </View>
        <View style={styles.metaItem}>
          <EnergyIcon size={16} color={getEnergyColor(task.energy as EnergyLevel)} />
          <Text style={styles.metaText}>{task.energy}</Text>
        </View>
        <View style={styles.priorityBadge}>
          <Text style={[styles.priorityText, { color: colors.border }]}>
            {task.priority} priority
          </Text>
        </View>
      </View>
      {task.type ? (
        <View style={styles.typeBadge}>
          <Text style={styles.typeText}>{task.type}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Full Calendar Modal ───────────────────────────────────────────────────────

interface FullCalendarModalProps {
  visible: boolean;
  selectedDate: Date;
  calendarMonth: { year: number; month: number };
  tasks: Task[];
  today: Date;
  onMonthChange: (m: { year: number; month: number }) => void;
  onDateSelect: (date: Date) => void;
  onClose: () => void;
  onEditTask: (task: Task) => void;
  onAddTask: (date: Date) => void;
}

function FullCalendarModal({
  visible,
  selectedDate,
  calendarMonth,
  tasks,
  today,
  onMonthChange,
  onDateSelect,
  onClose,
  onEditTask,
  onAddTask,
}: FullCalendarModalProps) {
  const { year, month } = calendarMonth;
  const days = getMonthGrid(year, month);

  const getTasksForDay = (day: Date) =>
    tasks.filter(t => isSameDay(new Date(t.dueDate ?? today), day));

  const selDayTasks = getTasksForDay(selectedDate);
  const selActive = selDayTasks.filter(t => !t.completed);
  const selDone = selDayTasks.filter(t => t.completed);

  const prevMonth = () =>
    onMonthChange(month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });

  const nextMonth = () =>
    onMonthChange(month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });

  const selLabel = isSameDay(selectedDate, today) ? 'Today' : formatFullDate(selectedDate);

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.calContainer} edges={['top']}>
        {/* Header bar */}
        <View style={styles.calHeader}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.calHeaderTitle}>Calendar</Text>
          <TouchableOpacity
            onPress={() => {
              onDateSelect(today);
              onMonthChange({ year: today.getFullYear(), month: today.getMonth() });
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.calTodayBtn}>Today</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          {/* Month navigation */}
          <View style={styles.monthNavRow}>
            <TouchableOpacity onPress={prevMonth} style={styles.monthNavBtn}>
              <ChevronLeft size={20} color="#6B7280" />
            </TouchableOpacity>
            <Text style={styles.monthNavTitle}>{MONTHS[month]} {year}</Text>
            <TouchableOpacity onPress={nextMonth} style={styles.monthNavBtn}>
              <ChevronRight size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Day of week headers */}
          <View style={styles.calDayHeaders}>
            {DAY_LABELS.map(l => (
              <Text key={l} style={styles.calDayHeaderText}>{l}</Text>
            ))}
          </View>

          {/* Month grid */}
          <View style={styles.calGrid}>
            {days.map((day, idx) => {
              if (!day) return <View key={`e-${idx}`} style={styles.calDayCell} />;
              const isToday = isSameDay(day, today);
              const isSelected = isSameDay(day, selectedDate);
              const count = getTasksForDay(day).length;
              const dots = Math.min(count, 3);
              return (
                <TouchableOpacity
                  key={`d-${idx}`}
                  style={[
                    styles.calDayCell,
                    isSelected && styles.calDayCellSelected,
                    isToday && !isSelected && styles.calDayCellToday,
                  ]}
                  onPress={() => onDateSelect(day)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.calDayText,
                      isSelected && styles.calDayTextSelected,
                      isToday && !isSelected && styles.calDayTextToday,
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                  <View style={styles.calDotsRow}>
                    {Array.from({ length: dots }).map((_, di) => (
                      <View
                        key={di}
                        style={[styles.calDot, isSelected && styles.calDotSelected]}
                      />
                    ))}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Tasks for selected day */}
          <View style={styles.calTasksSection}>
            <View style={styles.calTasksHeader}>
              <Text style={styles.calTasksTitle}>{selLabel}</Text>
              <View style={styles.calTasksActions}>
                <TouchableOpacity
                  style={styles.calAddBtn}
                  onPress={() => onAddTask(selectedDate)}
                  activeOpacity={0.8}
                >
                  <Plus size={16} color="#FFFFFF" />
                  <Text style={styles.calAddBtnText}>Add Task</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.calDoneBtn} onPress={onClose}>
                  <Text style={styles.calDoneBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>

            {selActive.length === 0 && selDone.length === 0 ? (
              <TouchableOpacity
                style={styles.calEmptyState}
                onPress={() => onAddTask(selectedDate)}
                activeOpacity={0.7}
              >
                <Text style={styles.calEmptyText}>No tasks for this day</Text>
                <Text style={styles.calEmptyHint}>Tap to add one</Text>
              </TouchableOpacity>
            ) : (
              <>
                {selActive.map(task => (
                  <TaskCard key={task.id} task={task} today={today} onEdit={onEditTask} />
                ))}
                {selDone.length > 0 && (
                  <>
                    <Text style={styles.completedHeading}>
                      Completed ({selDone.length})
                    </Text>
                    {selDone.map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        dimmed
                        today={today}
                        onEdit={onEditTask}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

=======
>>>>>>> 9f2b95e8490cc52c4047002c2d0fb70af828cc7c
export default function AllTasksScreen() {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>('date');
<<<<<<< HEAD
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [weekOffset, setWeekOffset] = useState(0);

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);

  // Full calendar
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalDate, setAddModalDate] = useState<Date>(today);
  const [addModalKey, setAddModalKey] = useState(0);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setTasks(getSharedTasks());
=======
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    // Initialize tasks on first load
    initializeTasks().then(() => {
      setTasks(getSharedTasks());
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const latestTasks = getSharedTasks();
      setTasks(latestTasks);
>>>>>>> 9f2b95e8490cc52c4047002c2d0fb70af828cc7c
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const getTasksForDay = (day: Date): Task[] =>
    tasks.filter(t => isSameDay(new Date(t.dueDate ?? today), day));

  // ── Add task ─────────────────────────────────────────────────────────────────

  const openAddModal = (date?: Date) => {
    const target = date ?? selectedDate;
    setAddModalDate(new Date(target));
    setAddModalKey(k => k + 1);
    setShowAddModal(true);
  };

  const handleSaveNew = (values: TaskFormValues) => {
    addTask({
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
    setTasks(getSharedTasks());
    setShowAddModal(false);
  };

  // ── Full calendar ─────────────────────────────────────────────────────────────

  const openFullCalendar = () => {
    setCalendarMonth({
      year: selectedDate.getFullYear(),
      month: selectedDate.getMonth(),
    });
    setShowFullCalendar(true);
  };

  const handleCalendarDateSelect = (date: Date) => {
    setSelectedDate(date);
    setWeekOffset(weekOffsetForDate(date));
  };

  const handleCalendarAddTask = (date: Date) => {
    setShowFullCalendar(false);
    setTimeout(() => openAddModal(date), 300);
  };

  // ── Edit task ────────────────────────────────────────────────────────────────

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setShowEditModal(true);
  };

  const handleSaveEdit = (values: TaskFormValues) => {
    if (!editingTask) return;
    updateTask(editingTask.id, {
      name: values.name,
      description: values.description.trim() || undefined,
      priority: values.priority,
      energy: values.energy,
      time: values.time,
      type: values.type,
      dueDate: values.dueDate.toISOString(),
      dueTime: values.dueTime ?? undefined,
    });
    setTasks(getSharedTasks());
    setShowEditModal(false);
    setEditingTask(null);
  };

  // ── Filtering & sorting ───────────────────────────────────────────────────────

  const dayTasks = tasks.filter(t =>
    isSameDay(new Date(t.dueDate ?? today), selectedDate)
  );

  const sortTasks = (list: Task[]) => {
    const sorted = [...list];
    if (sortBy === 'date') {
      sorted.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
    } else {
      const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
      sorted.sort((a, b) => order[a.priority] - order[b.priority]);
    }
    return sorted;
  };

  const activeTasks = sortTasks(dayTasks.filter(t => !t.completed));
  const completedTasks = dayTasks.filter(t => t.completed);

<<<<<<< HEAD
  // Week range label
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];
  const weekLabel =
    weekStart.getMonth() === weekEnd.getMonth()
      ? `${MONTHS_SHORT[weekStart.getMonth()]} ${weekStart.getDate()}–${weekEnd.getDate()}`
      : `${MONTHS_SHORT[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTHS_SHORT[weekEnd.getMonth()]} ${weekEnd.getDate()}`;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
=======
  const getEnergyColor = (level: EnergyLevel) => {
    switch(level) {
      case 'high': return '#F59E0B';
      case 'medium': return '#8b5cf6';
      case 'low': return '#38BDF8';
    }
  };

  const getEnergyCardColor = (level: EnergyLevel) => {
    switch(level) {
      case 'high': return { border: '#F59E0B', bg: '#FEF3C7' };
      case 'medium': return { border: '#8b5cf6', bg: '#F3E8FF' };
      case 'low': return { border: '#38BDF8', bg: '#E0F2FE' };
    }
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setShowEditModal(true);
  };

  const handleCloseModal = () => {
    setShowEditModal(false);
    setEditingTask(null);
  };

  const handleSaveTask = () => {
    setTasks(getSharedTasks());
  };

  const sortedTasks = sortTasks(tasks.filter(t => !t.completed));
  const completedTasks = tasks.filter(t => t.completed);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
>>>>>>> 9f2b95e8490cc52c4047002c2d0fb70af828cc7c
        <View style={styles.headerContainer}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>All Tasks</Text>
              <Text style={styles.subtitle}>
                {activeTasks.length} active • {completedTasks.length} completed
              </Text>
            </View>
            <View style={styles.headerButtons}>
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={() => openAddModal()}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.75}
              >
                <Plus size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={openFullCalendar}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.75}
              >
                <Calendar size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Week Navigation ── */}
        <View style={styles.weekNavRow}>
          <TouchableOpacity
            style={styles.weekNavBtn}
            onPress={() => setWeekOffset(prev => prev - 1)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ChevronLeft size={18} color="#6B7280" />
          </TouchableOpacity>
          <Text style={styles.weekNavLabel}>{weekLabel}</Text>
          <TouchableOpacity
            style={styles.weekNavBtn}
            onPress={() => setWeekOffset(prev => prev + 1)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ChevronRight size={18} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* ── Mini Week Calendar ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.calendarScroll}
          contentContainerStyle={styles.calendarRow}
          keyboardShouldPersistTaps="handled"
        >
          {weekDays.map((day, index) => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, today);
            const count = getTasksForDay(day).length;
            const dots = Math.min(count, 3);
            const hasMore = count > 3;

            return (
              <TouchableOpacity
                key={index}
                onPress={() => setSelectedDate(day)}
                activeOpacity={0.75}
                style={[
                  styles.dayCell,
                  isSelected && styles.dayCellSelected,
                  isToday && !isSelected && styles.dayCellToday,
                ]}
              >
                <Text
                  style={[
                    styles.dayLabel,
                    isSelected && styles.dayTextSelected,
                    isToday && !isSelected && styles.dayTextToday,
                  ]}
                >
                  {DAY_LABELS[index]}
                </Text>
                <Text
                  style={[
                    styles.dayNumber,
                    isSelected && styles.dayTextSelected,
                    isToday && !isSelected && styles.dayTextToday,
                  ]}
                >
                  {day.getDate()}
                </Text>
                <View style={styles.dotsRow}>
                  {Array.from({ length: dots }).map((_, di) => (
                    <View
                      key={di}
                      style={[styles.dot, isSelected && styles.dotSelected]}
                    />
                  ))}
                  {hasMore && (
                    <Text style={[styles.dotPlus, isSelected && styles.dotPlusSelected]}>
                      +
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Sort Controls ── */}
        <View style={styles.sortContainer}>
          <Text style={styles.sortLabel}>Sort by:</Text>
          <TouchableOpacity
            style={[styles.sortButton, sortBy === 'date' && styles.sortButtonActive]}
            onPress={() => setSortBy('date')}
          >
            <Text style={[styles.sortButtonText, sortBy === 'date' && styles.sortButtonTextActive]}>
              Date
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortButton, sortBy === 'priority' && styles.sortButtonActive]}
            onPress={() => setSortBy('priority')}
          >
            <Text style={[styles.sortButtonText, sortBy === 'priority' && styles.sortButtonTextActive]}>
              Priority
            </Text>
          </TouchableOpacity>
        </View>

<<<<<<< HEAD
        {/* ── Active Tasks ── */}
        {activeTasks.map(task => (
          <TaskCard key={task.id} task={task} today={today} onEdit={openEditModal} />
        ))}
=======
        {sortedTasks.map(task => {
          const colors = getEnergyCardColor(task.energy);
          const EnergyIcon = getEnergyIcon(task.energy);
          
          return (
            <TouchableOpacity
              key={task.id}
              onPress={() => handleEditTask(task)}
              style={[styles.taskCard, { borderLeftColor: colors.border, backgroundColor: colors.bg }]}
            >
              <View style={styles.taskCardContent}>
                <View style={styles.taskInfo}>
                  <Text style={styles.taskName}>{task.name}</Text>
                  <View style={styles.taskMeta}>
                    <View style={styles.metaItem}>
                      <Calendar size={16} color="#666" />
                      <Text style={styles.metaText}>{formatDate(task.dueDate)}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Clock size={16} color="#666" />
                      <Text style={styles.metaText}>{task.time}m</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <EnergyIcon size={16} color={getEnergyColor(task.energy)} />
                      <Text style={styles.metaText}>{task.energy}</Text>
                    </View>
                    <View style={styles.priorityBadge}>
                      <Text style={[styles.priorityText, { color: colors.border }]}>{task.priority} priority</Text>
                    </View>
                  </View>
                  {task.type && (
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeText}>{task.type}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => handleEditTask(task)}
                  style={styles.editButton}
                >
                  <Edit2 size={20} color="#8b5cf6" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
>>>>>>> 9f2b95e8490cc52c4047002c2d0fb70af828cc7c

        {/* ── Completed Tasks ── */}
        {completedTasks.length > 0 && (
          <>
            <Text style={styles.completedHeading}>
              Completed ({completedTasks.length})
            </Text>
            {completedTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                dimmed
                today={today}
                onEdit={openEditModal}
              />
            ))}
          </>
        )}

        {activeTasks.length === 0 && completedTasks.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No tasks for this day</Text>
            <Text style={styles.emptySubtext}>
              Tap a different date or add a new task
            </Text>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

<<<<<<< HEAD
      {/* ── FAB ── */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => openAddModal()}
        activeOpacity={0.85}
      >
        <Plus size={26} color="#FFFFFF" />
      </TouchableOpacity>

      {/* ── Full Calendar Modal ── */}
      <FullCalendarModal
        visible={showFullCalendar}
        selectedDate={selectedDate}
        calendarMonth={calendarMonth}
        tasks={tasks}
        today={today}
        onMonthChange={setCalendarMonth}
        onDateSelect={handleCalendarDateSelect}
        onClose={() => setShowFullCalendar(false)}
        onEditTask={task => {
          setShowFullCalendar(false);
          setTimeout(() => openEditModal(task), 300);
        }}
        onAddTask={handleCalendarAddTask}
      />

      {/* ── Add Task Modal ── */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Task</Text>
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#9090b0" />
              </TouchableOpacity>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <TaskForm
                key={addModalKey}
                initialDate={addModalDate}
                onSave={handleSaveNew}
                onCancel={() => setShowAddModal(false)}
                saveLabel="Add Task"
                showCancel
              />
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Edit Task Modal ── */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Task</Text>
              <TouchableOpacity
                onPress={() => { setShowEditModal(false); setEditingTask(null); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#9090b0" />
              </TouchableOpacity>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <TaskForm
                key={editingTask?.id}
                initialTask={editingTask}
                onSave={handleSaveEdit}
                onCancel={() => { setShowEditModal(false); setEditingTask(null); }}
                saveLabel="Save Changes"
                showCancel
              />
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
=======
      <TaskEditModal
        visible={showEditModal}
        task={editingTask}
        onClose={handleCloseModal}
        onSave={handleSaveTask}
      />
>>>>>>> 9f2b95e8490cc52c4047002c2d0fb70af828cc7c
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  headerContainer: {
    backgroundColor: '#0F172A',
    marginHorizontal: -20,
    marginTop: -20,
    padding: 24,
    paddingTop: 20,
    marginBottom: 12,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },

  // ── FAB ─────────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },

  // ── Week Navigation ──────────────────────────────────────────────────────────
  weekNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  weekNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  weekNavLabel: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 14,
    color: '#6B7280',
  },

  // ── Mini Week Calendar ───────────────────────────────────────────────────────
  calendarScroll: {
    marginHorizontal: -20,
    marginBottom: 16,
  },
  calendarRow: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 8,
  },
  dayCell: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minWidth: 50,
  },
  dayCellSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  dayCellToday: {
    borderColor: '#0F172A',
    borderWidth: 1.5,
  },
  dayLabel: {
    fontFamily: 'Nunito-Regular',
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 3,
  },
  dayNumber: {
    fontFamily: 'Nunito-Bold',
    fontSize: 17,
    color: '#111827',
    marginBottom: 5,
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontFamily: 'Nunito-Bold',
  },
  dayTextToday: {
    color: '#111827',
    fontFamily: 'Nunito-Bold',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minHeight: 7,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(107,114,128,0.4)',
  },
  dotSelected: {
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  dotPlus: {
    fontFamily: 'Nunito-Bold',
    fontSize: 8,
    color: '#6B7280',
    lineHeight: 10,
  },
  dotPlusSelected: {
    color: 'rgba(255,255,255,0.6)',
  },

  // ── Sort Controls ────────────────────────────────────────────────────────────
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sortLabel: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 14,
    color: '#6B7280',
  },
  sortButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sortButtonActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  sortButtonText: {
    fontFamily: 'Nunito-Medium',
    fontSize: 14,
    color: '#6B7280',
  },
  sortButtonTextActive: {
    fontFamily: 'Nunito-SemiBold',
    color: '#FFFFFF',
  },

  // ── Task Card ────────────────────────────────────────────────────────────────
  taskCard: {
    borderLeftWidth: 4,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  taskCardCompleted: {
    opacity: 0.55,
  },
  taskCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  taskCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  taskInfo: {
    flex: 1,
  },
  taskName: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 16,
    color: '#111827',
    flex: 1,
  },
  taskNameStrike: {
    textDecorationLine: 'line-through',
    color: '#6B7280',
  },
  editButton: {
    padding: 2,
    marginTop: 1,
  },
  taskMeta: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontFamily: 'Nunito-Regular',
    fontSize: 13,
    color: '#6B7280',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  priorityText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 12,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  typeText: {
    fontFamily: 'Nunito-Regular',
    fontSize: 11,
    color: '#6B7280',
  },
<<<<<<< HEAD
  completedHeading: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 10,
    marginTop: 4,
  },

  // ── Empty State ──────────────────────────────────────────────────────────────
=======
  editButton: {
    padding: 8,
    marginLeft: 8,
  },
>>>>>>> 9f2b95e8490cc52c4047002c2d0fb70af828cc7c
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 20,
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtext: {
    fontFamily: 'Nunito-Regular',
    fontSize: 14,
    color: '#6B7280',
  },

  // ── Shared Modal Container ────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 0,
    maxHeight: '94%',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: 'Nunito-Bold',
    fontSize: 20,
    color: '#111827',
  },

  // ── Full Calendar Modal ──────────────────────────────────────────────────────
  calContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  calHeader: {
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  calHeaderTitle: {
    fontFamily: 'Nunito-Bold',
    fontSize: 18,
    color: '#FFFFFF',
  },
  calTodayBtn: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  monthNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  monthNavTitle: {
    fontFamily: 'Nunito-Bold',
    fontSize: 18,
    color: '#111827',
  },
  calDayHeaders: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  calDayHeaderText: {
    width: '14.28%',
    textAlign: 'center',
    fontFamily: 'Nunito-SemiBold',
    fontSize: 12,
    color: '#6B7280',
    paddingVertical: 4,
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  calDayCell: {
    width: '14.28%',
    aspectRatio: 0.9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    borderRadius: 10,
  },
  calDayCellSelected: {
    backgroundColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  calDayCellToday: {
    backgroundColor: 'rgba(15,23,42,0.06)',
    borderWidth: 1.5,
    borderColor: '#0F172A',
  },
  calDayText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 15,
    color: '#111827',
    marginBottom: 2,
  },
  calDayTextSelected: {
    color: '#FFFFFF',
    fontFamily: 'Nunito-Bold',
  },
  calDayTextToday: {
    color: '#111827',
    fontFamily: 'Nunito-Bold',
  },
  calDotsRow: {
    flexDirection: 'row',
    gap: 2,
    minHeight: 5,
  },
  calDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(107,114,128,0.4)',
  },
  calDotSelected: {
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  calTasksSection: {
    marginTop: 8,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
  },
  calTasksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  calTasksTitle: {
    fontFamily: 'Nunito-Bold',
    fontSize: 18,
    color: '#111827',
    flex: 1,
  },
  calTasksActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  calAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  calAddBtnText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
  },
  calDoneBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  calDoneBtnText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 13,
    color: '#111827',
  },
  calEmptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    marginTop: 4,
  },
  calEmptyText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 4,
  },
  calEmptyHint: {
    fontFamily: 'Nunito-Regular',
    fontSize: 13,
    color: '#6B7280',
  },
});
