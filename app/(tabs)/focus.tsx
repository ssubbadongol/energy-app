import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line, Path } from 'react-native-svg';
import { SageBackground } from '@/components/sage/Background';
import { curve, font, gutter, radius, sage, shadow, text } from '@/theme/sage';

/* ------------------------------------------------------------------ *
 * Focus — real front camera preview, simulated attention telemetry.
 *
 * The camera feed is live (expo-camera). The focus % is a placeholder
 * signal until an on-device attention model is wired in; the video never
 * leaves the phone.
 * ------------------------------------------------------------------ */

const SEED_HIST = [62, 68, 74, 71, 66, 70, 77, 81, 84, 80, 75, 72, 78, 83, 86, 84, 79, 74, 70, 73, 77, 80, 82, 78, 75, 79, 83, 85, 81, 78];
const W = 320;
const H = 110;

export default function FocusScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [running, setRunning] = useState(true);
  const [hist, setHist] = useState<number[]>(SEED_HIST);
  const [focusPct, setFocusPct] = useState(78);
  const [elapsed, setElapsed] = useState(0);
  const [drift, setDrift] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => {
      setHist((h) => {
        const last = h[h.length - 1];
        const next = Math.max(28, Math.min(97, Math.round(last + (Math.random() * 22 - 11))));
        setFocusPct(next);
        setDrift((d) => (next < 45 && last >= 45 ? d + 1 : d));
        return [...h.slice(1), next];
      });
      setElapsed((e) => e + 2);
    }, 1400);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [running]);

  const pts = hist.map((v, i) => [i * (W / (hist.length - 1)), H - 8 - (v / 100) * (H - 20)]);
  const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = `${path} L${W},${H} L0,${H} Z`;
  const avg = Math.round(hist.reduce((a, b) => a + b, 0) / hist.length);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const deepMin = Math.max(0, Math.round((elapsed / 60) * 0.72));

  const granted = permission?.granted;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <SageBackground scrollY={scrollY} />
      <Animated.ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        <View style={styles.header}>
          <Text style={text.title}>Focus</Text>
          <Text style={text.body}>{mm}:{ss} this session</Text>
        </View>

        {/* camera feed */}
        <View style={styles.feed}>
          {granted && running ? (
            <CameraView style={StyleSheet.absoluteFill} facing="front" />
          ) : (
            <View style={styles.feedCenter}>
              <Camera size={30} color={sage.leafSoft} strokeWidth={1.5} />
              {granted ? (
                <Text style={styles.feedLabel}>paused</Text>
              ) : (
                <>
                  <Text style={styles.feedLabel}>{permission ? 'camera access needed' : 'checking camera…'}</Text>
                  {permission && !permission.granted && (
                    <Pressable onPress={requestPermission} style={styles.permBtn}>
                      <Text style={styles.permBtnText}>Enable camera</Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          )}

          <View style={styles.livePill}>
            <View style={[styles.liveDot, { backgroundColor: granted && running ? sage.leaf : sage.fgFaint }]} />
            <Text style={styles.liveLabel}>{granted && running ? 'Tracking' : 'Paused'}</Text>
          </View>
          <View style={styles.focusBadge}>
            <Text style={styles.focusBadgeNum}>{focusPct}</Text>
            <Text style={styles.focusBadgePct}>% focus</Text>
          </View>
        </View>

        {/* chart */}
        <View style={[styles.card, { marginTop: 14 }]}>
          <View style={styles.chartHead}>
            <Text style={text.cardTitle}>Last 3 minutes</Text>
            <Text style={text.meta}>avg {avg}%</Text>
          </View>
          <Svg width="100%" height={110} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <Line x1="0" y1="22" x2={W} y2="22" stroke={sage.rule} strokeWidth="1" />
            <Line x1="0" y1="55" x2={W} y2="55" stroke={sage.rule} strokeWidth="1" />
            <Line x1="0" y1="88" x2={W} y2="88" stroke={sage.rule} strokeWidth="1" />
            <Path d={area} fill={sage.fillGreen} />
            <Path d={path} fill="none" stroke={sage.primary} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
          <View style={styles.chartAxis}>
            <Text style={styles.axisLabel}>-3m</Text><Text style={styles.axisLabel}>-2m</Text><Text style={styles.axisLabel}>-1m</Text><Text style={styles.axisLabel}>now</Text>
          </View>
        </View>

        {/* stats */}
        <View style={styles.statsRow}>
          <View style={[styles.card, styles.statCard]}>
            <Text style={styles.statNum}>{drift}</Text>
            <Text style={styles.statLabel}>gentle nudges</Text>
          </View>
          <View style={[styles.card, styles.statCard]}>
            <Text style={styles.statNum}>{deepMin}</Text>
            <Text style={styles.statLabel}>minutes settled</Text>
          </View>
        </View>

        <Pressable onPress={() => setRunning((r) => !r)} style={[styles.toggle, running ? { backgroundColor: sage.fillGreenAlt } : { backgroundColor: sage.primary }]}>
          <Text style={[text.button, { color: running ? sage.primaryInk : sage.onPrimary }]}>{running ? 'Pause tracking' : 'Resume tracking'}</Text>
        </Pressable>
        <Text style={styles.note}>Video never leaves your phone. Looking away is data, not failure.</Text>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: sage.bg },
  scroll: { paddingHorizontal: gutter, paddingTop: 4, paddingBottom: 32 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 8, paddingBottom: 16 },

  feed: { borderRadius: radius.cardLg, overflow: 'hidden', height: 210, backgroundColor: '#e0ebe4', ...shadow.card, ...curve },
  feedCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 8 },
  feedLabel: { fontFamily: font.body, fontSize: 11, color: sage.fgSecondary, letterSpacing: 0.4 },
  permBtn: { marginTop: 6, backgroundColor: sage.primary, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 18, ...curve },
  permBtnText: { fontFamily: font.heading, fontSize: 13, color: sage.onPrimary },
  livePill: { position: 'absolute', left: 14, top: 14, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,.86)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5 },
  liveLabel: { fontFamily: font.heading, fontSize: 11, color: sage.primaryDeep },
  focusBadge: { position: 'absolute', right: 14, bottom: 14, flexDirection: 'row', alignItems: 'baseline', gap: 3, backgroundColor: 'rgba(255,255,255,.9)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  focusBadgeNum: { fontFamily: font.headingBold, fontSize: 22, color: sage.primaryDeep },
  focusBadgePct: { fontFamily: font.heading, fontSize: 12, color: sage.fgMuted },

  card: { backgroundColor: sage.surface, borderRadius: radius.cardLg, padding: 18, ...shadow.card, ...curve },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  chartAxis: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 2 },
  axisLabel: { fontFamily: font.body, fontSize: 11, color: sage.fgFaint },

  statsRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  statCard: { flex: 1, padding: 16 },
  statNum: { fontFamily: font.headingBold, fontSize: 22, color: sage.primaryDeep },
  statLabel: { fontFamily: font.body, fontSize: 12, color: sage.fgMuted, marginTop: 2 },

  toggle: { marginTop: 14, borderRadius: 22, paddingVertical: 17, alignItems: 'center', ...shadow.card, ...curve },
  note: { fontFamily: font.body, fontSize: 12, lineHeight: 18, color: sage.primaryInk, textAlign: 'center', marginTop: 12, marginHorizontal: 4 },
});
