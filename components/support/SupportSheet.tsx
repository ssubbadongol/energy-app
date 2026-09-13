/**
 * The "would you like support resources?" sheet.
 *
 * Shown to the person who wrote a message the safety classifier scored as
 * dangerous or self-harm — and to nobody else. Their message stays in the pod
 * exactly as they wrote it; this sits alongside it.
 *
 * Deliberate choices here: the offer is a question, not a warning. There is no
 * mention of moderation, rules, or anything having been flagged, because the
 * user did nothing wrong. "Not right now" is a full, unpenalised answer, and
 * it is the same visual weight as the other button.
 */
import React, { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { curve, font, radius, sage, shadow, text } from '@/theme/sage';
import { CRISIS_RESOURCES, acknowledgeSupportPrompt, type SupportPrompt } from '@/app/supportService';

export function SupportSheet({ prompt, onClose }: { prompt: SupportPrompt | null; onClose: () => void }) {
  const [expanded, setExpanded] = useState(false);

  if (!prompt) return null;

  const dismiss = async (wantedResources: boolean) => {
    await acknowledgeSupportPrompt(prompt.id, !wantedResources);
    setExpanded(false);
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => dismiss(false)}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          {!expanded ? (
            <>
              <Text style={[text.h2, { marginTop: 6 }]}>That sounded like a heavy moment.</Text>
              <Text style={[text.body, { marginTop: 10 }]}>
                Your message is still in the pod — nothing was removed. We just wanted to ask, quietly:
                would it help to have a few places you could talk to someone?
              </Text>

              <Pressable style={styles.primary} onPress={() => setExpanded(true)}>
                <Text style={text.button}>Show me</Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={() => dismiss(false)}>
                <Text style={styles.secondaryText}>Not right now</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[text.h2, { marginTop: 6 }]}>People who pick up</Text>
              <Text style={[text.body, { marginTop: 8, marginBottom: 4 }]}>
                Free, confidential, and used to exactly this.
              </Text>

              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {CRISIS_RESOURCES.map((r) => (
                  <Pressable key={r.name} style={styles.resource} onPress={() => Linking.openURL(r.url)}>
                    <View style={styles.resourceHead}>
                      <Text style={text.cardTitle}>{r.name}</Text>
                      <Text style={styles.region}>{r.region}</Text>
                    </View>
                    <Text style={[text.body, { marginTop: 3 }]}>{r.detail}</Text>
                    {r.phone ? <Text style={styles.phone}>{r.phone}</Text> : null}
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable style={styles.secondary} onPress={() => dismiss(true)}>
                <Text style={styles.secondaryText}>Close</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(55, 81, 74, 0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: sage.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 28,
    ...shadow.lifted,
    ...curve,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: sage.ruleStrong,
    marginBottom: 8,
  },

  resource: {
    backgroundColor: sage.fillGreenAlt,
    borderRadius: radius.md,
    padding: 14,
    marginTop: 10,
    ...curve,
  },
  resourceHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  region: {
    fontFamily: font.bodySemi,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: sage.primaryInk,
  },
  phone: { fontFamily: font.headingBold, fontSize: 15, color: sage.primaryDeep, marginTop: 7 },

  primary: {
    backgroundColor: sage.primary,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
    ...curve,
  },
  secondary: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  secondaryText: { fontFamily: font.ui, fontSize: 14, color: sage.fgSecondary },
});
