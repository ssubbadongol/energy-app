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
import { colors, radius, shadows, typography } from '@/theme';
import { TaskForm, TaskFormValues } from './TaskForm';
import { addTask, getSharedTasks, Task, updateTask } from './taskStorage';

type EnergyLevel = 'high' | 'medium' | 'low';
type SortBy = 'date' | 'priority';

const DAY_LABELS    = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS        = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function isSameDay(a: Date, b: Date): boolean { return a.toDateString() === b.toDateString(); }

function getWeekDays(weekOffset = 0): Date[] {
  const base = new Date(); base.setHours(0,0,0,0);
  const dow = base.getDay(), toMon = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(base); monday.setDate(base.getDate() + toMon + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
}

function getMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  let startDow = firstDay.getDay(); startDow = startDow === 0 ? 6 : startDow - 1;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function weekOffsetForDate(date: Date): number {
  const base = new Date(); base.setHours(0,0,0,0);
  const baseDow = base.getDay(), baseMonday = new Date(base);
  baseMonday.setDate(base.getDate() + (baseDow === 0 ? -6 : 1 - baseDow));
  const selDow = date.getDay(), selMonday = new Date(date);
  selMonday.setDate(date.getDate() + (selDow === 0 ? -6 : 1 - selDow)); selMonday.setHours(0,0,0,0);
  return Math.round((selMonday.getTime() - baseMonday.getTime()) / (1000 * 60 * 60 * 24 * 7));
}

function formatFullDate(date: Date): string {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return `${days[date.getDay()]}, ${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;
}

function getEnergyIcon(level: EnergyLevel) {
  if (level === 'high') return Zap; if (level === 'medium') return Coffee; return Moon;
}
function getEnergyColor(level: EnergyLevel): string {
  if (level === 'high') return colors.warning; if (level === 'medium') return colors.accent; return '#38BDF8';
}

function formatDateLabel(dateString: string | undefined, today: Date): string {
  if (!dateString) return 'No date';
  const date = new Date(dateString), tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, tomorrow)) return 'Tomorrow';
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;
}

// ── Task Card ─────────────────────────────────────────────────────────────────

interface TaskCardProps { task: Task; dimmed?: boolean; today: Date; onEdit: (t: Task) => void; }

function TaskCard({ task, dimmed, today, onEdit }: TaskCardProps) {
  const borderColor = getEnergyColor(task.energy as EnergyLevel);
  const EnergyIcon  = getEnergyIcon(task.energy as EnergyLevel);
  return (
    <View style={[s.taskCard, { borderLeftColor: borderColor }, dimmed && s.taskCardDimmed]}>
      <View style={s.taskCardHeader}>
        <Text style={[s.taskName, dimmed && s.taskNameStrike]} numberOfLines={2}>{task.name}</Text>
        <TouchableOpacity onPress={() => onEdit(task)} style={s.editBtn} hitSlop={{ top:8, bottom:8, left:8, right:8 }} activeOpacity={0.6}>
          <Edit2 size={14} color={colors.textMuted} strokeWidth={1.5} />
        </TouchableOpacity>
      </View>
      <View style={s.taskMeta}>
        <View style={s.metaItem}>
          <Calendar size={12} color={colors.textMuted} strokeWidth={1.5} />
          <Text style={s.metaText}>{formatDateLabel(task.dueDate, today)}</Text>
        </View>
        <View style={s.metaItem}>
          <Clock size={12} color={colors.textMuted} strokeWidth={1.5} />
          <Text style={s.metaText}>{task.time}m</Text>
        </View>
        <View style={s.metaItem}>
          <EnergyIcon size={12} color={borderColor} strokeWidth={1.5} />
          <Text style={s.metaText}>{task.energy}</Text>
        </View>
        <View style={[s.priorityBadge, { borderColor: borderColor + '40' }]}>
          <Text style={[s.priorityText, { color: borderColor }]}>{task.priority}</Text>
        </View>
      </View>
      {task.type ? <View style={s.typeBadge}><Text style={s.typeText}>{task.type}</Text></View> : null}
    </View>
  );
}

// ── Full Calendar Modal ───────────────────────────────────────────────────────

interface FullCalendarModalProps {
  visible: boolean; selectedDate: Date; calendarMonth: { year: number; month: number };
  tasks: Task[]; today: Date;
  onMonthChange: (m: { year: number; month: number }) => void;
  onDateSelect: (d: Date) => void; onClose: () => void;
  onEditTask: (t: Task) => void; onAddTask: (d: Date) => void;
}

function FullCalendarModal({ visible, selectedDate, calendarMonth, tasks, today, onMonthChange, onDateSelect, onClose, onEditTask, onAddTask }: FullCalendarModalProps) {
  const { year, month } = calendarMonth;
  const days = getMonthGrid(year, month);
  const getTasksForDay = (day: Date) => tasks.filter(t => isSameDay(new Date(t.dueDate ?? today), day));
  const selDayTasks = getTasksForDay(selectedDate);
  const selActive = selDayTasks.filter(t => !t.completed);
  const selDone   = selDayTasks.filter(t => t.completed);
  const prevMonth = () => onMonthChange(month === 0 ? { year: year-1, month: 11 } : { year, month: month-1 });
  const nextMonth = () => onMonthChange(month === 11 ? { year: year+1, month: 0 } : { year, month: month+1 });
  const selLabel  = isSameDay(selectedDate, today) ? 'Today' : formatFullDate(selectedDate);

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={s.calContainer} edges={['top']}>
        <View style={s.calHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
            <X size={20} color={colors.textSecondary} strokeWidth={1.5} />
          </TouchableOpacity>
          <Text style={s.calHeaderTitle}>Calendar</Text>
          <TouchableOpacity onPress={() => { onDateSelect(today); onMonthChange({ year: today.getFullYear(), month: today.getMonth() }); }} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
            <Text style={s.calTodayBtn}>Today</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={s.monthNavRow}>
            <TouchableOpacity onPress={prevMonth} style={s.monthNavBtn}><ChevronLeft size={18} color={colors.textSecondary} strokeWidth={1.5} /></TouchableOpacity>
            <Text style={s.monthNavTitle}>{MONTHS[month]} {year}</Text>
            <TouchableOpacity onPress={nextMonth} style={s.monthNavBtn}><ChevronRight size={18} color={colors.textSecondary} strokeWidth={1.5} /></TouchableOpacity>
          </View>

          <View style={s.calDayHeaders}>
            {DAY_LABELS.map(l => <Text key={l} style={s.calDayHeaderText}>{l}</Text>)}
          </View>

          <View style={s.calGrid}>
            {days.map((day, idx) => {
              if (!day) return <View key={`e-${idx}`} style={s.calDayCell} />;
              const isToday    = isSameDay(day, today);
              const isSelected = isSameDay(day, selectedDate);
              const dots = Math.min(getTasksForDay(day).length, 3);
              return (
                <TouchableOpacity key={`d-${idx}`} style={[s.calDayCell, isSelected && s.calDayCellSelected, isToday && !isSelected && s.calDayCellToday]} onPress={() => onDateSelect(day)} activeOpacity={0.7}>
                  <Text style={[s.calDayText, isSelected && s.calDayTextSel, isToday && !isSelected && s.calDayTextToday]}>{day.getDate()}</Text>
                  <View style={s.calDotsRow}>
                    {Array.from({ length: dots }).map((_, di) => <View key={di} style={[s.calDot, isSelected && s.calDotSel]} />)}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={s.calTasksSection}>
            <View style={s.calTasksHeader}>
              <Text style={s.calTasksTitle}>{selLabel}</Text>
              <View style={s.calTasksActions}>
                <TouchableOpacity style={s.calAddBtn} onPress={() => onAddTask(selectedDate)} activeOpacity={0.8}>
                  <Plus size={14} color="#FFF" strokeWidth={1.5} />
                  <Text style={s.calAddBtnText}>Add</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.calDoneBtn} onPress={onClose}>
                  <Text style={s.calDoneBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>

            {selActive.length === 0 && selDone.length === 0 ? (
              <TouchableOpacity style={s.calEmptyState} onPress={() => onAddTask(selectedDate)} activeOpacity={0.7}>
                <Text style={s.calEmptyText}>No tasks this day</Text>
                <Text style={s.calEmptyHint}>Tap to add one</Text>
              </TouchableOpacity>
            ) : (
              <>
                {selActive.map(task => <TaskCard key={task.id} task={task} today={today} onEdit={onEditTask} />)}
                {selDone.length > 0 && (
                  <>
                    <Text style={s.completedHeading}>Done ({selDone.length})</Text>
                    {selDone.map(task => <TaskCard key={task.id} task={task} dimmed today={today} onEdit={onEditTask} />)}
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

export default function AllTasksScreen() {
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const [tasks,          setTasks]          = useState<Task[]>([]);
  const [sortBy,         setSortBy]         = useState<SortBy>('date');
  const [selectedDate,   setSelectedDate]   = useState<Date>(today);
  const [weekOffset,     setWeekOffset]     = useState(0);
  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [calendarMonth,  setCalendarMonth]  = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [addModalDate,   setAddModalDate]   = useState<Date>(today);
  const [addModalKey,    setAddModalKey]    = useState(0);
  const [showEditModal,  setShowEditModal]  = useState(false);
  const [editingTask,    setEditingTask]    = useState<Task | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setTasks(getSharedTasks()), 500);
    return () => clearInterval(interval);
  }, []);

  const getTasksForDay = (day: Date) => tasks.filter(t => isSameDay(new Date(t.dueDate ?? today), day));

  const openAddModal = (date?: Date) => {
    const target = date ?? selectedDate;
    setAddModalDate(new Date(target)); setAddModalKey(k => k + 1); setShowAddModal(true);
  };

  const handleSaveNew = (values: TaskFormValues) => {
    addTask({ name: values.name, description: values.description.trim() || undefined, priority: values.priority, energy: values.energy, time: values.time, type: values.type, completed: false, dueDate: values.dueDate.toISOString(), dueTime: values.dueTime ?? undefined, notificationIds: [] });
    setTasks(getSharedTasks()); setShowAddModal(false);
  };

  const openFullCalendar = () => { setCalendarMonth({ year: selectedDate.getFullYear(), month: selectedDate.getMonth() }); setShowFullCalendar(true); };
  const handleCalendarDateSelect = (date: Date) => { setSelectedDate(date); setWeekOffset(weekOffsetForDate(date)); };
  const handleCalendarAddTask    = (date: Date) => { setShowFullCalendar(false); setTimeout(() => openAddModal(date), 300); };
  const openEditModal = (task: Task) => { setEditingTask(task); setShowEditModal(true); };
  const handleSaveEdit = (values: TaskFormValues) => {
    if (!editingTask) return;
    updateTask(editingTask.id, { name: values.name, description: values.description.trim() || undefined, priority: values.priority, energy: values.energy, time: values.time, type: values.type, dueDate: values.dueDate.toISOString(), dueTime: values.dueTime ?? undefined });
    setTasks(getSharedTasks()); setShowEditModal(false); setEditingTask(null);
  };

  const dayTasks = tasks.filter(t => isSameDay(new Date(t.dueDate ?? today), selectedDate));
  const sortTasks = (list: Task[]) => {
    const sorted = [...list];
    if (sortBy === 'date') sorted.sort((a, b) => (!a.dueDate ? 1 : !b.dueDate ? -1 : new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()));
    else { const ord: Record<string,number> = { high:0, medium:1, low:2 }; sorted.sort((a,b) => ord[a.priority] - ord[b.priority]); }
    return sorted;
  };
  const activeTasks    = sortTasks(dayTasks.filter(t => !t.completed));
  const completedTasks = dayTasks.filter(t => t.completed);

  const weekStart = weekDays[0], weekEnd = weekDays[6];
  const weekLabel = weekStart.getMonth() === weekEnd.getMonth()
    ? `${MONTHS_SHORT[weekStart.getMonth()]} ${weekStart.getDate()}–${weekEnd.getDate()}`
    : `${MONTHS_SHORT[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTHS_SHORT[weekEnd.getMonth()]} ${weekEnd.getDate()}`;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View pointerEvents="none" style={s.ambientGlow} />

      <ScrollView style={s.scrollView} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>All Tasks</Text>
            <Text style={s.subtitle}>{activeTasks.length} active · {completedTasks.length} done</Text>
          </View>
          <View style={s.headerBtns}>
            <TouchableOpacity style={s.headerIconBtn} onPress={() => openAddModal()} hitSlop={{ top:8, bottom:8, left:8, right:8 }} activeOpacity={0.75}>
              <Plus size={18} color={colors.textSecondary} strokeWidth={1.5} />
            </TouchableOpacity>
            <TouchableOpacity style={s.headerIconBtn} onPress={openFullCalendar} hitSlop={{ top:8, bottom:8, left:8, right:8 }} activeOpacity={0.75}>
              <Calendar size={18} color={colors.textSecondary} strokeWidth={1.5} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Week nav */}
        <View style={s.weekNavRow}>
          <TouchableOpacity style={s.weekNavBtn} onPress={() => setWeekOffset(p => p-1)} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
            <ChevronLeft size={16} color={colors.textMuted} strokeWidth={1.5} />
          </TouchableOpacity>
          <Text style={s.weekNavLabel}>{weekLabel}</Text>
          <TouchableOpacity style={s.weekNavBtn} onPress={() => setWeekOffset(p => p+1)} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
            <ChevronRight size={16} color={colors.textMuted} strokeWidth={1.5} />
          </TouchableOpacity>
        </View>

        {/* Mini calendar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.calScroll} contentContainerStyle={s.calRow} keyboardShouldPersistTaps="handled">
          {weekDays.map((day, index) => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday    = isSameDay(day, today);
            const count = getTasksForDay(day).length;
            const dots  = Math.min(count, 3);
            return (
              <TouchableOpacity key={index} onPress={() => setSelectedDate(day)} activeOpacity={0.75}
                style={[s.dayCell, isSelected && s.dayCellSelected, isToday && !isSelected && s.dayCellToday]}
              >
                <Text style={[s.dayLabel, isSelected && s.dayTextSelected, isToday && !isSelected && s.dayTextToday]}>{DAY_LABELS[index]}</Text>
                <Text style={[s.dayNumber, isSelected && s.dayTextSelected, isToday && !isSelected && s.dayTextToday]}>{day.getDate()}</Text>
                <View style={s.dotsRow}>
                  {Array.from({ length: dots }).map((_, di) => <View key={di} style={[s.dot, isSelected && s.dotSelected]} />)}
                  {count > 3 && <Text style={[s.dotPlus, isSelected && s.dotPlusSelected]}>+</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Sort */}
        <View style={s.sortRow}>
          <Text style={s.sortLabel}>Sort</Text>
          {(['date','priority'] as SortBy[]).map(opt => (
            <TouchableOpacity key={opt} style={[s.sortBtn, sortBy === opt && s.sortBtnActive]} onPress={() => setSortBy(opt)} activeOpacity={0.8}>
              <Text style={[s.sortBtnText, sortBy === opt && s.sortBtnTextActive]}>
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Active tasks */}
        {activeTasks.map(task => <TaskCard key={task.id} task={task} today={today} onEdit={openEditModal} />)}

        {/* Completed */}
        {completedTasks.length > 0 && (
          <>
            <Text style={s.completedHeading}>Completed · {completedTasks.length}</Text>
            {completedTasks.map(task => <TaskCard key={task.id} task={task} dimmed today={today} onEdit={openEditModal} />)}
          </>
        )}

        {activeTasks.length === 0 && completedTasks.length === 0 && (
          <View style={s.emptyState}>
            <Text style={s.emptyText}>Nothing here</Text>
            <Text style={s.emptySubtext}>Tap + to add a task for this day</Text>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={() => openAddModal()} activeOpacity={0.85}>
        <Plus size={24} color="#FFFFFF" strokeWidth={1.5} />
      </TouchableOpacity>

      <FullCalendarModal
        visible={showFullCalendar} selectedDate={selectedDate} calendarMonth={calendarMonth}
        tasks={tasks} today={today} onMonthChange={setCalendarMonth}
        onDateSelect={handleCalendarDateSelect} onClose={() => setShowFullCalendar(false)}
        onEditTask={task => { setShowFullCalendar(false); setTimeout(() => openEditModal(task), 300); }}
        onAddTask={handleCalendarAddTask}
      />

      {/* Add modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>New Task</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                <X size={18} color={colors.textMuted} strokeWidth={1.5} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <TaskForm key={addModalKey} initialDate={addModalDate} onSave={handleSaveNew} onCancel={() => setShowAddModal(false)} saveLabel="Add Task" showCancel />
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit modal */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Edit Task</Text>
              <TouchableOpacity onPress={() => { setShowEditModal(false); setEditingTask(null); }} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                <X size={18} color={colors.textMuted} strokeWidth={1.5} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <TaskForm key={editingTask?.id} initialTask={editingTask} onSave={handleSaveEdit} onCancel={() => { setShowEditModal(false); setEditingTask(null); }} saveLabel="Save Changes" showCancel />
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: colors.bgBase },
  scrollView:    { flex: 1 },
  scrollContent: { padding: 20 },
  ambientGlow: {
    position: 'absolute', top: -80, alignSelf: 'center',
    width: 360, height: 360, borderRadius: 180,
    backgroundColor: colors.accentDim, opacity: 0.7,
  },

  // Header
  header:    { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingTop: 8 },
  title:     { fontFamily: typography.displayFont, fontSize: 28, color: colors.textPrimary, letterSpacing: -0.5, marginBottom: 3 },
  subtitle:  { fontFamily: typography.bodyFont, fontSize: 13, color: colors.textMuted },
  headerBtns:    { flexDirection: 'row', gap: 8 },
  headerIconBtn: {
    width: 36, height: 36, borderRadius: radius.md,
    backgroundColor: colors.bgSubtle, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },

  // Week nav
  weekNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 2 },
  weekNavBtn: {
    width: 30, height: 30, borderRadius: radius.sm,
    backgroundColor: colors.bgSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  weekNavLabel: { fontFamily: typography.uiFont, fontSize: 13, color: colors.textMuted },

  // Mini calendar
  calScroll:  { marginHorizontal: -20, marginBottom: 14 },
  calRow:     { paddingHorizontal: 16, paddingVertical: 4, gap: 6 },
  dayCell: {
    alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: radius.md, backgroundColor: colors.bgSurface,
    borderWidth: 1, borderColor: colors.borderSubtle, minWidth: 46,
  },
  dayCellSelected: { backgroundColor: colors.accent, borderColor: colors.accent, ...shadows.accent },
  dayCellToday:    { borderColor: colors.accent, borderWidth: 1 },
  dayLabel:        { fontFamily: typography.bodyFont, fontSize: 10, color: colors.textMuted, marginBottom: 2 },
  dayNumber:       { fontFamily: typography.headingFont, fontSize: 16, color: colors.textSecondary, marginBottom: 4 },
  dayTextSelected: { color: '#FFFFFF', fontFamily: typography.headingFont },
  dayTextToday:    { color: colors.accent, fontFamily: typography.headingFont },
  dotsRow:         { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 6 },
  dot:             { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.textMuted + '60' },
  dotSelected:     { backgroundColor: 'rgba(255,255,255,0.6)' },
  dotPlus:         { fontFamily: typography.bodyFont, fontSize: 8, color: colors.textMuted },
  dotPlusSelected: { color: 'rgba(255,255,255,0.6)' },

  // Sort
  sortRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sortLabel:       { fontFamily: typography.bodyFont, fontSize: 12, color: colors.textMuted },
  sortBtn:         { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.border },
  sortBtnActive:   { backgroundColor: colors.accentDim, borderColor: colors.accent },
  sortBtnText:     { fontFamily: typography.uiFont, fontSize: 12, color: colors.textMuted },
  sortBtnTextActive: { color: colors.accent },

  // Task card
  taskCard: {
    borderLeftWidth: 2, borderRadius: radius.lg, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgSurface,
  },
  taskCardDimmed:  { opacity: 0.45 },
  taskCardHeader:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  taskName:        { fontFamily: typography.uiFont, fontSize: 15, color: colors.textPrimary, flex: 1 },
  taskNameStrike:  { textDecorationLine: 'line-through', color: colors.textMuted },
  editBtn:         { padding: 2, marginTop: 1 },
  taskMeta:        { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 },
  metaItem:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:        { fontFamily: typography.bodyFont, fontSize: 12, color: colors.textMuted },
  priorityBadge:   { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm, borderWidth: 1 },
  priorityText:    { fontFamily: typography.uiFont, fontSize: 11 },
  typeBadge:       { alignSelf: 'flex-start', backgroundColor: colors.bgElevated, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderSubtle },
  typeText:        { fontFamily: typography.bodyFont, fontSize: 11, color: colors.textMuted },
  completedHeading: { fontFamily: typography.bodyFont, fontSize: 12, color: colors.textMuted, marginBottom: 10, marginTop: 6, letterSpacing: 0.3 },

  // Empty
  emptyState:   { alignItems: 'center', marginTop: 60 },
  emptyText:    { fontFamily: typography.headingFont, fontSize: 18, color: colors.textSecondary, marginBottom: 6 },
  emptySubtext: { fontFamily: typography.bodyFont, fontSize: 13, color: colors.textMuted },

  // FAB
  fab: {
    position: 'absolute', right: 20, bottom: 30,
    width: 52, height: 52, borderRadius: radius.full,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    ...shadows.accent,
  },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: 24, paddingBottom: 0, maxHeight: '94%',
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border,
  },
  modalHandle:  { width: 36, height: 4, borderRadius: radius.full, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20 },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle:   { fontFamily: typography.headingFont, fontSize: 18, color: colors.textPrimary },

  // Full Calendar Modal
  calContainer:  { flex: 1, backgroundColor: colors.bgBase },
  calHeader: {
    backgroundColor: colors.bgSurface, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  calHeaderTitle:  { fontFamily: typography.headingFont, fontSize: 16, color: colors.textPrimary },
  calTodayBtn:     { fontFamily: typography.uiFont, fontSize: 14, color: colors.accent },
  monthNavRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  monthNavBtn:     { width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.bgSurface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  monthNavTitle:   { fontFamily: typography.headingFont, fontSize: 16, color: colors.textPrimary },
  calDayHeaders:   { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 4 },
  calDayHeaderText:{ width: '14.28%', textAlign: 'center', fontFamily: typography.uiFont, fontSize: 11, color: colors.textMuted, paddingVertical: 4 },
  calGrid:         { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, marginBottom: 8 },
  calDayCell:      { width: '14.28%', aspectRatio: 0.9, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, borderRadius: radius.md },
  calDayCellSelected: { backgroundColor: colors.accent, ...shadows.accent },
  calDayCellToday:    { backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accent },
  calDayText:      { fontFamily: typography.uiFont, fontSize: 14, color: colors.textSecondary, marginBottom: 2 },
  calDayTextSel:   { color: '#FFFFFF', fontFamily: typography.headingFont },
  calDayTextToday: { color: colors.accent, fontFamily: typography.headingFont },
  calDotsRow:      { flexDirection: 'row', gap: 2, minHeight: 5 },
  calDot:          { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.textMuted + '60' },
  calDotSel:       { backgroundColor: 'rgba(255,255,255,0.6)' },
  calTasksSection: { marginTop: 8, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 },
  calTasksHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  calTasksTitle:   { fontFamily: typography.headingFont, fontSize: 16, color: colors.textPrimary, flex: 1 },
  calTasksActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  calAddBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, ...shadows.accent },
  calAddBtnText:   { fontFamily: typography.uiFont, fontSize: 13, color: '#FFFFFF' },
  calDoneBtn:      { backgroundColor: colors.bgSurface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  calDoneBtnText:  { fontFamily: typography.uiFont, fontSize: 13, color: colors.textSecondary },
  calEmptyState:   { alignItems: 'center', paddingVertical: 32, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSubtle, borderStyle: 'dashed', marginTop: 4 },
  calEmptyText:    { fontFamily: typography.uiFont, fontSize: 14, color: colors.textSecondary, marginBottom: 4 },
  calEmptyHint:    { fontFamily: typography.bodyFont, fontSize: 12, color: colors.textMuted },
});
