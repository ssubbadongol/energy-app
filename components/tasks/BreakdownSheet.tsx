/**
 * Ask before breaking a task down.
 *
 * The first version of this went straight to the model with nothing but the
 * task title, and the steps it produced were plausible and wrong — four words
 * is not enough to know what "finish the project" involves, so it invented
 * something generic. That is worse than no help: a list of steps that are not
 * yours is another thing to read and dismiss.
 *
 * So this sheet does three things before any model is involved:
 *
 *   1. Offers starter steps for common task shapes, tapped straight in. Free,
 *      instant, and usually better than the model, because a person who has
 *      written an essay before recognises the right list on sight.
 *   2. Asks what the task actually involves, in one small box.
 *   3. Passes that through, so the model is completing a sentence rather than
 *      guessing at one.
 *
 * Everything is optional. Break it down with an empty box and you get the old
 * behaviour, which is the right floor rather than the right default.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Plus, Sparkles } from 'lucide-react-native';
import { haptic } from '@/components/primitives/usePressScale';
import { curve, font, gutter, radius, sage, text } from '@/theme/sage';
import { suggestSteps } from '@/app/taskSuggestions';
import { MAX_SUBTASKS } from '@/app/taskStorage';

interface Props {
  visible: boolean;
  /** The task title as currently typed. Drives the suggestions. */
  taskName: string;
  /** How many steps already exist, so the caps stay honest. */
  existingCount: number;
  busy: boolean;
  onClose: () => void;
  /** Add these step names directly. No model call. */
  onAddSteps: (names: string[]) => void;
  /** Ask the model, with whatever context was typed. */
  onGenerate: (context: string) => void;
}

export function BreakdownSheet({
  visible,
  taskName,
  existingCount,
  busy,
  onClose,
  onAddSteps,
  onGenerate,
}: Props) {
  const [context, setContext] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const suggestion = useMemo(() => suggestSteps(taskName), [taskName]);
  const room = Math.max(0, MAX_SUBTASKS - existingCount);

  useEffect(() => {
    if (visible) {
      setContext('');
      setPicked([]);
    }
  }, [visible]);

  const toggle = (step: string) => {
    haptic('light');
    setPicked((prev) =>
      prev.includes(step)
        ? prev.filter((s) => s !== step)
        : prev.length >= room
          ? prev
          : [...prev, step],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[text.title, { fontSize: 19 }]}>Break it into steps</Text>
            <Text style={[text.body, { marginTop: 4 }]} numberOfLines={2}>
              {taskName.trim() || 'This task'}
            </Text>

            {suggestion && room > 0 ? (
              <View style={{ marginTop: 18 }}>
                <Text style={styles.sectionLabel}>{suggestion.label.toUpperCase()} — TAP TO ADD</Text>
                <View style={styles.chips}>
                  {suggestion.steps.map((step) => {
                    const on = picked.includes(step);
                    return (
                      <Pressable
                        key={step}
                        onPress={() => toggle(step)}
                        style={[styles.chip, on && styles.chipOn]}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                      >
                        <Text style={[styles.chipText, on && { color: sage.onPrimary }]}>{step}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={{ marginTop: 18 }}>
              <Text style={styles.sectionLabel}>WHAT DOES IT ACTUALLY INVOLVE?</Text>
              <TextInput
                value={context}
                onChangeText={setContext}
                placeholder="Optional. Anything I'd have no way of knowing — what's already done, what's in the way, what finished looks like."
                placeholderTextColor={sage.fgFaint}
                style={styles.contextInput}
                multiline
                maxLength={300}
                editable={!busy}
              />
            </View>

            {picked.length > 0 ? (
              <Pressable
                onPress={() => {
                  onAddSteps(picked);
                  onClose();
                }}
                style={styles.addBtn}
                accessibilityRole="button"
              >
                <Plus size={15} color={sage.primaryInk} strokeWidth={2.2} />
                <Text style={styles.addBtnText}>
                  Add {picked.length} step{picked.length === 1 ? '' : 's'}
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => onGenerate(context.trim())}
              disabled={busy}
              style={[styles.cta, busy && { opacity: 0.6 }]}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color={sage.onPrimary} />
              ) : (
                <>
                  <Sparkles size={15} color={sage.onPrimary} strokeWidth={2.2} />
                  <Text style={text.button}>
                    {context.trim() ? 'Break it down with this' : 'Break it down for me'}
                  </Text>
                </>
              )}
            </Pressable>

            <Text style={styles.footnote}>
              Generated steps replace any you already have. Tapped suggestions are added to them.
            </Text>

            <Pressable onPress={onClose} style={{ paddingVertical: 12 }} accessibilityRole="button">
              <Text style={[text.meta, { textAlign: 'center' }]}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(55,81,74,0.28)' },
  sheet: {
    backgroundColor: sage.bg,
    borderTopLeftRadius: radius.cardLg,
    borderTopRightRadius: radius.cardLg,
    paddingHorizontal: gutter,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '86%',
    ...curve,
  },
  grab: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: sage.ruleStrong,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sectionLabel: {
    fontFamily: font.ui,
    fontSize: 10.5,
    letterSpacing: 1.3,
    color: sage.fgMuted,
    marginBottom: 10,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: sage.surface,
    borderWidth: 1,
    borderColor: sage.ruleStrong,
    ...curve,
  },
  chipOn: { backgroundColor: sage.primary, borderColor: sage.primary },
  chipText: { fontFamily: font.body, fontSize: 13, color: sage.fgBody },
  contextInput: {
    minHeight: 84,
    borderRadius: radius.md,
    backgroundColor: sage.surface,
    borderWidth: 1,
    borderColor: sage.ruleStrong,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: font.body,
    fontSize: 14,
    lineHeight: 20,
    color: sage.fgBody,
    textAlignVertical: 'top',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: sage.fillGreen,
    marginTop: 16,
    ...curve,
  },
  addBtnText: { fontFamily: font.ui, fontSize: 14, color: sage.primaryInk },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: sage.primary,
    marginTop: 10,
    ...curve,
  },
  footnote: {
    fontFamily: font.body,
    fontSize: 11.5,
    lineHeight: 17,
    color: sage.fgMuted,
    textAlign: 'center',
    marginTop: 10,
  },
});
