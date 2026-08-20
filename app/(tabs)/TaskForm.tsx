import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar, Clock, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, radius, shadows, typography } from '@/theme';
import { Task } from './taskStorage';

type EnergyLevel = 'high' | 'medium' | 'low';
type Priority = 'high' | 'medium' | 'low';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export interface TaskFormValues {
  name: string;
  description: string;
  priority: Priority;
  energy: EnergyLevel;
  time: number;
  type: string;
  dueDate: Date;
  dueTime: string | null;
}

interface TaskFormProps {
  initialTask?: Partial<Task> | null;
  initialDate?: Date;
  onSave: (values: TaskFormValues) => void | Promise<void>;
  onCancel?: () => void;
  saveLabel?: string;
  showCancel?: boolean;
}

function formatDate(date: Date): string {
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDueTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function TaskForm({
  initialTask,
  initialDate,
  onSave,
  onCancel,
  saveLabel = 'Save',
  showCancel = false,
}: TaskFormProps) {
  const baseDate = initialTask?.dueDate
    ? new Date(initialTask.dueDate)
    : (initialDate ?? new Date());

  const [name,        setName]        = useState(initialTask?.name ?? '');
  const [description, setDescription] = useState(initialTask?.description ?? '');
  const [priority,    setPriority]    = useState<Priority>((initialTask?.priority as Priority) ?? 'medium');
  const [energy,      setEnergy]      = useState<EnergyLevel>((initialTask?.energy as EnergyLevel) ?? 'medium');
  const [time,        setTime]        = useState(initialTask?.time ?? 30);
  const [type,        setType]        = useState(initialTask?.type ?? '');
  const [dueDate,     setDueDate]     = useState<Date>(baseDate);
  const [dueTime,     setDueTime]     = useState<string | null>(initialTask?.dueTime ?? null);

  const [showDatePicker,    setShowDatePicker]    = useState(false);
  const [showDueTimePicker, setShowDueTimePicker] = useState(false);
  const [showEstTimePicker, setShowEstTimePicker] = useState(false);

  useEffect(() => {
    setName(initialTask?.name ?? '');
    setDescription(initialTask?.description ?? '');
    setPriority((initialTask?.priority as Priority) ?? 'medium');
    setEnergy((initialTask?.energy as EnergyLevel) ?? 'medium');
    setTime(initialTask?.time ?? 30);
    setType(initialTask?.type ?? '');
    setDueDate(initialTask?.dueDate ? new Date(initialTask.dueDate) : (initialDate ?? new Date()));
    setDueTime(initialTask?.dueTime ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTask?.id]);

  const getEstTimePickerValue = () => {
    const d = new Date(); d.setHours(Math.floor(time / 60), time % 60, 0, 0); return d;
  };
  const getDueTimePickerValue = () => {
    if (dueTime) { const [h, m] = dueTime.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d; }
    const d = new Date(); d.setMinutes(0, 0, 0); return d;
  };

  const canSave = name.trim().length > 0;
  const handleSave = () => { if (!canSave) return; onSave({ name: name.trim(), description, priority, energy, time, type, dueDate, dueTime }); };

  const PRIORITY_COLORS: Record<Priority, string> = {
    high:   colors.error,
    medium: colors.warning,
    low:    colors.success,
  };
  const ENERGY_COLORS: Record<EnergyLevel, string> = {
    high:   colors.warning,
    medium: colors.accent,
    low:    '#38BDF8',
  };

  return (
    <View>
      {/* Task Name */}
      <View style={s.section}>
        <Text style={s.label}>Task Name</Text>
        <TextInput
          style={s.input}
          placeholder="e.g., Write project report"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
        />
      </View>

      {/* Description */}
      <View style={s.section}>
        <Text style={s.label}>Description <Text style={s.optional}>optional</Text></Text>
        <TextInput
          style={[s.input, s.textArea]}
          placeholder="Any extra details…"
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Due Date */}
      <View style={s.section}>
        <Text style={s.label}>Due Date</Text>
        <TouchableOpacity style={s.fieldButton} onPress={() => setShowDatePicker(true)} activeOpacity={0.8}>
          <Calendar size={16} color={colors.textMuted} strokeWidth={1.5} />
          <Text style={s.fieldButtonText}>{formatDate(dueDate)}</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={dueDate} mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, date) => { setShowDatePicker(Platform.OS === 'ios'); if (date) setDueDate(date); }}
          />
        )}
        {Platform.OS === 'ios' && showDatePicker && (
          <TouchableOpacity style={s.doneBtn} onPress={() => setShowDatePicker(false)}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Due Time */}
      <View style={s.section}>
        <Text style={s.label}>Due Time <Text style={s.optional}>optional</Text></Text>
        <Text style={s.hint}>Set a time to get a deadline reminder</Text>
        {dueTime ? (
          <View style={s.dueTimeRow}>
            <TouchableOpacity style={[s.fieldButton, { flex: 1 }]} onPress={() => setShowDueTimePicker(true)} activeOpacity={0.8}>
              <Clock size={16} color={colors.accent} strokeWidth={1.5} />
              <Text style={[s.fieldButtonText, { color: colors.accent }]}>{formatDueTime(dueTime)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.clearBtn} onPress={() => setDueTime(null)}>
              <X size={16} color={colors.textMuted} strokeWidth={1.5} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={s.fieldButton} onPress={() => setShowDueTimePicker(true)} activeOpacity={0.8}>
            <Clock size={16} color={colors.textMuted} strokeWidth={1.5} />
            <Text style={[s.fieldButtonText, { color: colors.textMuted }]}>Tap to set a time</Text>
          </TouchableOpacity>
        )}
        {showDueTimePicker && (
          <DateTimePicker
            value={getDueTimePickerValue()} mode="time" is24Hour={false} display="spinner"
            onChange={(_, date) => {
              if (Platform.OS === 'android') setShowDueTimePicker(false);
              if (date) {
                const h = String(date.getHours()).padStart(2, '0');
                const m = String(date.getMinutes()).padStart(2, '0');
                setDueTime(`${h}:${m}`);
              }
            }}
            minuteInterval={5}
          />
        )}
        {Platform.OS === 'ios' && showDueTimePicker && (
          <TouchableOpacity style={s.doneBtn} onPress={() => setShowDueTimePicker(false)}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Priority */}
      <View style={s.section}>
        <Text style={s.label}>Priority</Text>
        <View style={s.chipRow}>
          {(['high', 'medium', 'low'] as Priority[]).map(p => {
            const active = priority === p;
            const color  = PRIORITY_COLORS[p];
            return (
              <TouchableOpacity
                key={p} onPress={() => setPriority(p)} activeOpacity={0.8}
                style={[s.chip, active && { backgroundColor: color + '20', borderColor: color }]}
              >
                <Text style={[s.chipText, active && { color }]}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Energy */}
      <View style={s.section}>
        <Text style={s.label}>Energy Required</Text>
        <View style={s.chipRow}>
          {(['high', 'medium', 'low'] as EnergyLevel[]).map(e => {
            const active = energy === e;
            const color  = ENERGY_COLORS[e];
            return (
              <TouchableOpacity
                key={e} onPress={() => setEnergy(e)} activeOpacity={0.8}
                style={[s.chip, active && { backgroundColor: color + '20', borderColor: color }]}
              >
                <Text style={[s.chipText, active && { color }]}>
                  {e.charAt(0).toUpperCase() + e.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Estimated Time */}
      <View style={s.section}>
        <Text style={s.label}>Estimated Time</Text>
        <TouchableOpacity style={s.timeButton} onPress={() => setShowEstTimePicker(true)} activeOpacity={0.8}>
          <Text style={s.timeButtonText}>{formatTime(time)}</Text>
        </TouchableOpacity>
        {showEstTimePicker && (
          <DateTimePicker
            value={getEstTimePickerValue()} mode="time" is24Hour={true} display="spinner"
            onChange={(_, date) => {
              if (Platform.OS === 'android') setShowEstTimePicker(false);
              if (date) { const total = date.getHours() * 60 + date.getMinutes(); setTime(total > 0 ? total : 1); }
            }}
            minuteInterval={5}
          />
        )}
        {Platform.OS === 'ios' && showEstTimePicker && (
          <TouchableOpacity style={s.doneBtn} onPress={() => setShowEstTimePicker(false)}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Task Type */}
      <View style={s.section}>
        <Text style={s.label}>Task Type <Text style={s.optional}>optional</Text></Text>
        <TextInput
          style={s.input}
          placeholder="e.g., Admin, Creative, Deep focus"
          placeholderTextColor={colors.textMuted}
          value={type}
          onChangeText={setType}
        />
        <View style={[s.chipRow, { marginTop: 10 }]}>
          {['Admin', 'Deep focus', 'Creative', 'Physical'].map(t => (
            <TouchableOpacity
              key={t} onPress={() => setType(t)} activeOpacity={0.8}
              style={[s.chip, type === t && { backgroundColor: colors.accentDim, borderColor: colors.accent }]}
            >
              <Text style={[s.chipText, type === t && { color: colors.accent }]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Buttons */}
      {showCancel ? (
        <View style={s.buttonRow}>
          <Pressable
            style={({ pressed }) => [s.cancelButton, { opacity: pressed ? 0.7 : 1 }]}
            onPress={onCancel}
          >
            <Text style={s.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.primaryButton, !canSave && s.primaryButtonDisabled, { opacity: pressed && canSave ? 0.85 : 1 }]}
            onPress={handleSave}
            disabled={!canSave}
          >
            <Text style={s.primaryButtonText}>{saveLabel}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Pressable
            style={({ pressed }) => [s.fullButton, !canSave && s.fullButtonDisabled, { opacity: pressed && canSave ? 0.85 : 1 }]}
            onPress={handleSave}
            disabled={!canSave}
          >
            <Text style={s.fullButtonText}>{saveLabel}</Text>
          </Pressable>
          <Text style={s.requiredNote}>Name is required</Text>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  section:  { marginBottom: 22 },
  label:    { fontFamily: typography.uiFont, fontSize: 13, color: colors.textSecondary, marginBottom: 8, letterSpacing: 0.3 },
  optional: { fontFamily: typography.bodyFont, fontSize: 12, color: colors.textMuted },
  hint:     { fontFamily: typography.bodyFont, fontSize: 12, color: colors.textMuted, marginBottom: 8, marginTop: -4 },

  input: {
    fontFamily: typography.bodyFont,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 14,
    fontSize: 15, backgroundColor: colors.bgSurface, color: colors.textPrimary,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },

  fieldButton: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 14,
    backgroundColor: colors.bgSurface,
  },
  fieldButtonText: { fontFamily: typography.bodyFont, fontSize: 15, color: colors.textPrimary },

  dueTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clearBtn: {
    width: 46, height: 46, borderRadius: radius.md,
    backgroundColor: colors.bgSurface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },

  timeButton: {
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: 20,
    backgroundColor: colors.bgSurface, alignItems: 'center',
  },
  timeButtonText: { fontFamily: typography.headingFont, fontSize: 24, color: colors.accent },

  doneBtn: {
    marginTop: 10, backgroundColor: colors.bgElevated,
    paddingVertical: 12, borderRadius: radius.md, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  doneBtnText: { fontFamily: typography.uiFont, fontSize: 15, color: colors.textPrimary },

  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: radius.md, backgroundColor: colors.bgSurface,
    borderWidth: 1, borderColor: colors.border,
  },
  chipText: { fontFamily: typography.uiFont, fontSize: 13, color: colors.textMuted },

  // Full-width button
  fullButton: {
    backgroundColor: colors.accent, paddingVertical: 16,
    borderRadius: radius.md, alignItems: 'center', marginTop: 8,
    ...shadows.accent,
  },
  fullButtonDisabled: { backgroundColor: colors.bgElevated, shadowOpacity: 0, elevation: 0 },
  fullButtonText: { fontFamily: typography.uiFont, fontSize: 16, color: '#FFFFFF' },
  requiredNote: { fontFamily: typography.bodyFont, fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 10 },

  // Cancel + Save row
  buttonRow:   { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelButton: {
    flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center',
    backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border,
  },
  cancelText: { fontFamily: typography.uiFont, fontSize: 15, color: colors.textSecondary },
  primaryButton: {
    flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center',
    backgroundColor: colors.accent, ...shadows.accent,
  },
  primaryButtonDisabled: { backgroundColor: colors.bgElevated, shadowOpacity: 0, elevation: 0 },
  primaryButtonText: { fontFamily: typography.uiFont, fontSize: 15, color: '#FFFFFF' },
});
