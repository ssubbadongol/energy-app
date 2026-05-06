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
  /** Pre-fill all fields when editing an existing task. */
  initialTask?: Partial<Task> | null;
  /** Pre-fill the date field when adding from a calendar context. */
  initialDate?: Date;
  onSave: (values: TaskFormValues) => void | Promise<void>;
  onCancel?: () => void;
  saveLabel?: string;
  /** When true renders a Cancel + Save button row instead of a single full-width button. */
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
  // Derive initial state once from props (component is expected to be re-keyed when these change)
  const baseDate = initialTask?.dueDate
    ? new Date(initialTask.dueDate)
    : (initialDate ?? new Date());

  const [name, setName] = useState(initialTask?.name ?? '');
  const [description, setDescription] = useState(initialTask?.description ?? '');
  const [priority, setPriority] = useState<Priority>((initialTask?.priority as Priority) ?? 'medium');
  const [energy, setEnergy] = useState<EnergyLevel>((initialTask?.energy as EnergyLevel) ?? 'medium');
  const [time, setTime] = useState(initialTask?.time ?? 30);
  const [type, setType] = useState(initialTask?.type ?? '');
  const [dueDate, setDueDate] = useState<Date>(baseDate);
  const [dueTime, setDueTime] = useState<string | null>(initialTask?.dueTime ?? null);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDueTimePicker, setShowDueTimePicker] = useState(false);
  const [showEstTimePicker, setShowEstTimePicker] = useState(false);

  // Sync if initialTask identity changes without remounting (e.g. same modal, different task)
  useEffect(() => {
    setName(initialTask?.name ?? '');
    setDescription(initialTask?.description ?? '');
    setPriority((initialTask?.priority as Priority) ?? 'medium');
    setEnergy((initialTask?.energy as EnergyLevel) ?? 'medium');
    setTime(initialTask?.time ?? 30);
    setType(initialTask?.type ?? '');
    setDueDate(
      initialTask?.dueDate
        ? new Date(initialTask.dueDate)
        : (initialDate ?? new Date())
    );
    setDueTime(initialTask?.dueTime ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTask?.id]);

  const getEstTimePickerValue = () => {
    const d = new Date();
    d.setHours(Math.floor(time / 60), time % 60, 0, 0);
    return d;
  };

  const getDueTimePickerValue = () => {
    if (dueTime) {
      const [h, m] = dueTime.split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d;
    }
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return d;
  };

  const canSave = name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({ name: name.trim(), description, priority, energy, time, type, dueDate, dueTime });
  };

  return (
    <View>
      {/* Task Name */}
      <View style={styles.section}>
        <Text style={styles.label}>Task Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Write project report"
          placeholderTextColor="#b0aac8"
          value={name}
          onChangeText={setName}
        />
      </View>

      {/* Description */}
      <View style={styles.section}>
        <Text style={styles.label}>
          Description <Text style={styles.optional}>(optional)</Text>
        </Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Any extra details…"
          placeholderTextColor="#b0aac8"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Due Date */}
      <View style={styles.section}>
        <Text style={styles.label}>Due Date *</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowDatePicker(true)}
        >
          <Calendar size={20} color="#6B7280" />
          <Text style={styles.dateButtonText}>{formatDate(dueDate)}</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={dueDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, date) => {
              setShowDatePicker(Platform.OS === 'ios');
              if (date) setDueDate(date);
            }}
          />
        )}
        {Platform.OS === 'ios' && showDatePicker && (
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => setShowDatePicker(false)}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Due Time */}
      <View style={styles.section}>
        <Text style={styles.label}>
          Due Time <Text style={styles.optional}>(optional)</Text>
        </Text>
        <Text style={styles.hint}>Set a time to receive deadline reminders</Text>
        {dueTime ? (
          <View style={styles.dueTimeRow}>
            <TouchableOpacity
              style={[styles.dateButton, { flex: 1 }]}
              onPress={() => setShowDueTimePicker(true)}
            >
              <Clock size={20} color="#111827" />
              <Text style={[styles.dateButtonText, { color: '#111827', fontWeight: '600' }]}>
                {formatDueTime(dueTime)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.clearTimeButton}
              onPress={() => setDueTime(null)}
            >
              <X size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDueTimePicker(true)}
          >
            <Clock size={20} color="#6B7280" />
            <Text style={[styles.dateButtonText, { color: '#b0aac8' }]}>
              Tap to set a due time
            </Text>
          </TouchableOpacity>
        )}
        {showDueTimePicker && (
          <DateTimePicker
            value={getDueTimePickerValue()}
            mode="time"
            is24Hour={false}
            display="spinner"
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
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => setShowDueTimePicker(false)}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Priority */}
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

      {/* Energy */}
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

      {/* Estimated Time */}
      <View style={styles.section}>
        <Text style={styles.label}>Estimated Time *</Text>
        <TouchableOpacity
          style={styles.timeButton}
          onPress={() => setShowEstTimePicker(true)}
        >
          <Text style={styles.timeButtonText}>{formatTime(time)}</Text>
        </TouchableOpacity>
        {showEstTimePicker && (
          <DateTimePicker
            value={getEstTimePickerValue()}
            mode="time"
            is24Hour={true}
            display="spinner"
            onChange={(_, date) => {
              if (Platform.OS === 'android') setShowEstTimePicker(false);
              if (date) {
                const total = date.getHours() * 60 + date.getMinutes();
                setTime(total > 0 ? total : 1);
              }
            }}
            minuteInterval={5}
          />
        )}
        {Platform.OS === 'ios' && showEstTimePicker && (
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => setShowEstTimePicker(false)}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Task Type */}
      <View style={styles.section}>
        <Text style={styles.label}>
          Task Type <Text style={styles.optional}>(optional)</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Admin, Creative, Deep focus"
          placeholderTextColor="#b0aac8"
          value={type}
          onChangeText={setType}
        />
        <View style={[styles.optionRow, { marginTop: 8 }]}>
          {['Admin', 'Deep focus', 'Creative', 'Physical'].map(t => (
            <TouchableOpacity
              key={t}
              onPress={() => setType(t)}
              style={[styles.suggestionChip, type === t && styles.suggestionChipActive]}
            >
              <Text style={[styles.suggestionText, type === t && styles.suggestionTextActive]}>
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Buttons ── */}
      {showCancel ? (
        <View style={styles.buttonRow}>
          <Pressable
            style={({ pressed }) => [styles.cancelButton, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
            onPress={onCancel}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              !canSave && styles.primaryButtonDisabled,
              { transform: [{ scale: pressed && canSave ? 0.97 : 1 }] },
            ]}
            onPress={handleSave}
            disabled={!canSave}
          >
            <Text style={styles.primaryButtonText}>{saveLabel}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Pressable
            style={({ pressed }) => [
              styles.fullButton,
              !canSave && styles.fullButtonDisabled,
              { transform: [{ scale: pressed && canSave ? 0.97 : 1 }] },
            ]}
            onPress={handleSave}
            disabled={!canSave}
          >
            <Text style={styles.fullButtonText}>{saveLabel}</Text>
          </Pressable>
          <Text style={styles.requiredNote}>* Required fields</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  label: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 15,
    color: '#111827',
    marginBottom: 8,
  },
  optional: {
    fontFamily: 'Nunito-Regular',
    fontSize: 13,
    color: '#6B7280',
  },
  hint: {
    fontFamily: 'Nunito-Regular',
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
    marginTop: -4,
  },
  input: {
    fontFamily: 'Nunito-Regular',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    color: '#111827',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  dateButtonText: {
    fontFamily: 'Nunito-Regular',
    fontSize: 16,
    color: '#111827',
  },
  dueTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearTimeButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  timeButton: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  timeButtonText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 22,
    color: '#111827',
  },
  doneButton: {
    marginTop: 12,
    backgroundColor: '#0F172A',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  doneButtonText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  optionButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  optionButtonActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  optionText: {
    fontFamily: 'Nunito-Medium',
    fontSize: 14,
    color: '#6B7280',
  },
  optionTextActive: {
    fontFamily: 'Nunito-SemiBold',
    color: '#FFFFFF',
  },
  suggestionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  suggestionChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  suggestionText: {
    fontFamily: 'Nunito-Regular',
    fontSize: 13,
    color: '#6B7280',
  },
  suggestionTextActive: {
    fontFamily: 'Nunito-SemiBold',
    color: '#FFFFFF',
  },

  // Full-width single button (used in add-task screen)
  fullButton: {
    backgroundColor: '#0F172A',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  fullButtonDisabled: {
    backgroundColor: '#E5E7EB',
    shadowOpacity: 0,
    elevation: 0,
  },
  fullButtonText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 17,
    color: '#FFFFFF',
  },
  requiredNote: {
    fontFamily: 'Nunito-Regular',
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 12,
  },

  // Cancel + Save button row (used in modals)
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 15,
    color: '#374151',
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryButtonDisabled: {
    backgroundColor: '#E5E7EB',
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
  },
});
