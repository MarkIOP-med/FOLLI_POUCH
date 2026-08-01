import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { MassageLevel, VNode, ZONE_LABELS, PRESSURE_MAX } from '../models/telemetry';
import { useConsole, SessionState } from '../viewmodels/useConsole';
import PressureSlider from '../components/PressureSlider';
import { ScreenFrame } from '../components/ScreenFrame';
import { colors, font, layout } from '../theme';

// Per-zone hero artwork: the same head with a different zone highlighted.
//
// Both genders are wired up, but nothing tells the console which to draw — no
// patient record reaches it — so it draws the female set the comps use. The
// male set is here rather than in a later commit because the moment a patient
// record does arrive, this becomes a one-line lookup instead of a new asset
// hunt.
const HERO_IMG: Record<'female' | 'male', Record<VNode, ReturnType<typeof require>>> = {
  female: {
    0x01: require('../../assets/buttons/Female_Profile_FRONT_01.png'),
    0x02: require('../../assets/buttons/Female_Profile_TEMPLE_01.png'),
    0x03: require('../../assets/buttons/Female_Profile_EAR_01.png'),
    0x04: require('../../assets/buttons/Female_Profile_BACK_01.png'),
  },
  male: {
    0x01: require('../../assets/buttons/Male_Profile_FRONT_01.png'),
    0x02: require('../../assets/buttons/Male_Profile_TEMPLE_01.png'),
    0x03: require('../../assets/buttons/Male_Profile_EAR_01.png'),
    0x04: require('../../assets/buttons/Male_Profile_BACK_01.png'),
  },
};

/** No patient record reaches the console, so there is no gender to read. */
const HERO_GENDER: 'female' | 'male' = 'female';

// Zone selector tiles. The labels are baked into the artwork.
const ZONE_TILE: Record<VNode, { on: ReturnType<typeof require>; off: ReturnType<typeof require> }> = {
  0x01: {
    on: require('../../assets/buttons/front_on.png'),
    off: require('../../assets/buttons/front_off.png'),
  },
  0x02: {
    on: require('../../assets/buttons/temples_on.png'),
    off: require('../../assets/buttons/temples_off.png'),
  },
  0x03: {
    on: require('../../assets/buttons/ears_on.png'),
    off: require('../../assets/buttons/ears_off.png'),
  },
  0x04: {
    on: require('../../assets/buttons/back_on.png'),
    off: require('../../assets/buttons/back_off.png'),
  },
};

const BTN = {
  startOn: require('../../assets/buttons/start_on.png'),
  startOff: require('../../assets/buttons/start_off.png'),
  stopOn: require('../../assets/buttons/stop_on.png'),
  stopOff: require('../../assets/buttons/stop_off.png'),
  setOn: require('../../assets/buttons/set_on.png'),
  setOff: require('../../assets/buttons/set_off.png'),
  plus: require('../../assets/buttons/plus.png'),
  minus: require('../../assets/buttons/minus.png'),
};

type Props = {
  onOpenSettings: () => void;
};

const ZONES: VNode[] = [0x01, 0x02, 0x03, 0x04];
const SPEEDS: MassageLevel[] = [0, 1, 2, 3];

/** How long STOP must be held before the emergency stop fires. */
const STOP_HOLD_MS = 1500;

const HEADER_LABEL: Record<SessionState, string> = {
  pending: 'PENDING',
  active: 'ACTIVE',
  stopped: 'STOPPED',
};

// Session state, not link state. The comps pair ACTIVE with Connected and
// PENDING with Disconnected, but the two are independent — a real device
// reaches connected+pending every time it boots next to a powered pouch.
const DOT_COLOR: Record<SessionState, string> = {
  pending: colors.pending,
  active: colors.active,
  stopped: colors.stopped,
};

const SUB_STATUS: Record<SessionState, string> = {
  pending: 'Standby',
  active: 'Active',
  stopped: 'Terminated',
};

const FOOTER_HINT: Record<SessionState, string> = {
  pending: 'Press START to begin session',
  active: 'Long press STOP to end session',
  stopped: 'Press START to begin a new session',
};

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Renders both artwork states stacked and toggles opacity.
 *
 * Swapping an Image `source` makes Android re-decode the file, which flashes the
 * button for a frame. Keeping every state mounted and pre-decoded makes the
 * switch instant.
 */
function DualImage({
  on,
  off,
  showOn,
  width,
  height,
}: {
  on: ReturnType<typeof require>;
  off: ReturnType<typeof require>;
  showOn: boolean;
  width: number;
  height: number;
}) {
  return (
    <View style={{ width, height }}>
      <Image source={off} style={[styles.stackedImg, { opacity: showOn ? 0 : 1 }]} />
      <Image source={on} style={[styles.stackedImg, { opacity: showOn ? 1 : 0 }]} />
    </View>
  );
}

/**
 * console_ui_05 PAGE_01 and PAGE_02 — the patient-facing console.
 *
 * One screen, two session states: PAGE_01 is ACTIVE, PAGE_02 is PENDING. The
 * third state, STOPPED, has no comp and reuses the pending treatment with its
 * own red dot and label.
 */
export default function ConsoleScreen({ onOpenSettings }: Props) {
  const {
    sessionState,
    isSessionActive,
    elapsedSeconds,
    activeZone,
    setActiveZone,
    zoneSettings,
    targetPressure,
    updateTargetPressure,
    massageLevel,
    setMassageLevel,
    hasUnappliedChanges,
    liveTelemetry,
    isConnected,
    sendCommandToPouch,
    handleEmergencyStop,
    startSession,
  } = useConsole();

  const locked = !isSessionActive;

  // STOP hold-to-confirm: a light fill sweeps across the button over
  // STOP_HOLD_MS; releasing early cancels. Interval-driven rather than Animated
  // so the behaviour stays deterministic under the tests' fake timers.
  const [holdProgress, setHoldProgress] = useState(0);
  // After the hold completes the finger is still down where START appears —
  // swallow that release so lifting off cannot instantly restart the session.
  const [awaitingStopRelease, setAwaitingStopRelease] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearHoldTimer = () => {
    if (holdTimer.current) {
      clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const beginStopHold = useCallback(() => {
    clearHoldTimer();
    const startedAt = Date.now();
    holdTimer.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - startedAt) / STOP_HOLD_MS);
      setHoldProgress(p);
      if (p >= 1) {
        clearHoldTimer();
        setHoldProgress(0);
        setAwaitingStopRelease(true);
        handleEmergencyStop();
      }
    }, 50);
  }, [handleEmergencyStop]);

  const cancelStopHold = useCallback(() => {
    clearHoldTimer();
    setHoldProgress(0);
  }, []);

  useEffect(() => clearHoldTimer, []);

  // Safety net: even if the root never sees the touch end (edge swipes and the
  // like), re-enable START shortly after a stop.
  useEffect(() => {
    if (!awaitingStopRelease) return;
    const t = setTimeout(() => setAwaitingStopRelease(false), 1000);
    return () => clearTimeout(t);
  }, [awaitingStopRelease]);

  // SET pulses while the selected zone holds changes the pouch has not received.
  const setPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!hasUnappliedChanges) {
      setPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(setPulse, { toValue: 0.25, duration: 420, useNativeDriver: true }),
        Animated.timing(setPulse, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      setPulse.setValue(1);
    };
  }, [hasUnappliedChanges, setPulse]);

  return (
    <ScreenFrame isConnected={isConnected} onOpenSettings={onOpenSettings}>
      <View
        style={styles.body}
        onTouchEnd={() => {
          if (awaitingStopRelease) setAwaitingStopRelease(false);
        }}
      >
        {/* ── session state, patient, pouch ─────────────────────────────── */}
        <View style={styles.stateRow}>
          <Text style={styles.stateWord}>{HEADER_LABEL[sessionState]}</Text>
          <View style={[styles.stateDot, { backgroundColor: DOT_COLOR[sessionState] }]} />
        </View>

        <View style={styles.identityRow}>
          <View>
            {/* The comp prints a patient name here. Nothing carries one: the BLE
                protocol is 4-byte commands and 6-byte telemetry, and the
                POUCH_APP link that would ship patient data does not exist yet. */}
            <Text style={styles.identityLine}>
              <Text style={styles.identityLabel}>Name: </Text>
              {'—'}
            </Text>
            {/* Labelled Session Time, not the comp's "Remaining Time". Only
                elapsed is known — no planned duration reaches the console — and
                printing elapsed under a "remaining" label would be a lie on a
                medical device. */}
            <Text testID="session-timer" style={styles.identityLine}>
              <Text style={styles.identityLabel}>Session Time: </Text>
              {formatElapsed(elapsedSeconds)} min
            </Text>
          </View>

          <View style={styles.pouchBlock}>
            <View style={styles.pouchBatteryRow}>
              <View style={styles.pouchBatteryBody}>
                {/* Red only when the charge is genuinely low. The comp shows a
                    red bar because it is drawing 28%, not because the pouch
                    battery is always red. */}
                <View
                  style={[
                    styles.pouchBatteryFill,
                    {
                      width: `${Math.max(0, Math.min(100, liveTelemetry.batteryPercentage))}%`,
                      backgroundColor:
                        liveTelemetry.batteryPercentage <= 30
                          ? colors.disconnected
                          : colors.white,
                    },
                  ]}
                />
              </View>
              <View style={styles.pouchBatteryCap} />
              <Text style={styles.pouchBatteryText}>{liveTelemetry.batteryPercentage}%</Text>
            </View>
            <View style={styles.pouchIdRow}>
              <View
                style={[
                  styles.pouchDot,
                  { backgroundColor: isConnected ? colors.active : colors.stopped },
                ]}
              />
              {/* The pouch's identifier is not in the telemetry frame either. */}
              <Text style={styles.pouchIdText}>Pouch: {'—'}</Text>
            </View>
          </View>
        </View>

        {/* ── treatment area ────────────────────────────────────────────── */}
        <View style={[styles.panel, styles.treatmentPanel]}>
          <Text style={styles.panelTitle}>Treatment Area</Text>
          {/* Uppercased in style, not in the string: the tests assert the zone
              name and ZONE_LABELS is the protocol's own label table. */}
          <Text style={styles.zoneName}>{ZONE_LABELS[activeZone] || 'Unknown'}</Text>
          <Text style={styles.sessionStatus}>Session Status: {SUB_STATUS[sessionState]}</Text>

          <View style={styles.heroFrame}>
            {ZONES.map((zone) => (
              <Image
                key={zone}
                source={HERO_IMG[HERO_GENDER][zone]}
                style={[styles.hero, { opacity: activeZone === zone ? 1 : 0 }]}
                resizeMode="contain"
              />
            ))}
          </View>

          <View style={styles.zoneRow}>
            {ZONES.map((zone) => (
              <TouchableOpacity
                key={zone}
                testID={`zone-${zone}`}
                activeOpacity={0.7}
                onPress={() => setActiveZone(zone)}
              >
                <DualImage
                  on={ZONE_TILE[zone].on}
                  off={ZONE_TILE[zone].off}
                  showOn={activeZone === zone}
                  width={137}
                  height={137}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── pressure adjustment ───────────────────────────────────────── */}
        <View style={[styles.panel, styles.pressurePanel]}>
          <Text style={styles.panelTitle}>Pressure Adjustment</Text>

          <View style={styles.sliderRow}>
            <TouchableOpacity
              testID="pressure-minus"
              activeOpacity={0.6}
              onPress={() => updateTargetPressure(Math.max(0, targetPressure - 1))}
            >
              <Image source={BTN.minus} style={styles.stepImg} />
            </TouchableOpacity>
            <PressureSlider
              testID="pressure-slider"
              value={targetPressure}
              maximumValue={PRESSURE_MAX}
              onValueChange={updateTargetPressure}
            />
            <TouchableOpacity
              testID="pressure-plus"
              activeOpacity={0.6}
              onPress={() => updateTargetPressure(Math.min(PRESSURE_MAX, targetPressure + 1))}
            >
              <Image source={BTN.plus} style={styles.stepImg} />
            </TouchableOpacity>
          </View>

          <View style={styles.readoutBlock}>
            <Text testID="pressure-readout" style={styles.readoutDigits}>
              {targetPressure}
            </Text>
            <Text style={styles.readoutUnit}>mmHg</Text>
            <Animated.View style={{ opacity: setPulse }}>
              <TouchableOpacity
                testID="set-button"
                disabled={locked}
                activeOpacity={0.7}
                onPress={sendCommandToPouch}
              >
                <DualImage on={BTN.setOn} off={BTN.setOff} showOn={!locked} width={150} height={81} />
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>

        {/* ── massage levels ────────────────────────────────────────────── */}
        <View style={[styles.panel, styles.massagePanel]}>
          <View style={styles.massageHeaderRow}>
            <Text style={styles.panelTitle}>Massage Levels</Text>
            {/* The comp shows a per-massage countdown. No duration is sent to
                the console, so there is nothing to count down from. */}
            <Text style={styles.massageRemaining}>Time remain: {'—'}</Text>
          </View>

          <View style={styles.massageRow}>
            <View style={styles.massagePill}>
              {SPEEDS.map((level) => (
                <TouchableOpacity
                  key={level}
                  testID={`massage-${level}`}
                  style={styles.massageCell}
                  activeOpacity={0.7}
                  onPress={() => setMassageLevel(level)}
                >
                  <View
                    style={[
                      styles.massageRing,
                      massageLevel === level && styles.massageRingActive,
                    ]}
                  >
                    <Text style={styles.massageDigit}>{level}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <Animated.View style={{ opacity: setPulse }}>
              <TouchableOpacity
                testID="massage-set-button"
                disabled={locked}
                activeOpacity={0.7}
                onPress={sendCommandToPouch}
              >
                <DualImage on={BTN.setOn} off={BTN.setOff} showOn={!locked} width={150} height={81} />
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>

        {/* ── start / stop ──────────────────────────────────────────────── */}
        {/* Both buttons stay mounted in the same slot; the inactive one is
            transparent and inert. That kills the remount flash on state flips,
            and because they are separate elements a finger still held on STOP
            can never fire the freshly revealed START. */}
        <View style={styles.masterSlot}>
          <TouchableOpacity
            testID="stop-button"
            style={[styles.masterBtn, !isSessionActive && styles.masterHidden]}
            disabled={!isSessionActive}
            activeOpacity={1}
            onPressIn={beginStopHold}
            onPressOut={cancelStopHold}
          >
            <View style={styles.masterClip}>
              {/* The comps draw both master buttons in the `off` artwork
                  (#737373 body, matching the comp's #80878d); `on` is the lit
                  #c2c2c2 state. So STOP rests dark and lights up as it is
                  held, rather than starting lit and dimming. */}
              <DualImage
                on={BTN.stopOn}
                off={BTN.stopOff}
                showOn={holdProgress > 0}
                width={layout.primaryButton.w}
                height={layout.primaryButton.h}
              />
              <View
                testID="stop-hold-fill"
                style={[styles.stopHoldFill, { width: `${holdProgress * 100}%` }]}
              />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            testID="start-button"
            style={[styles.masterBtn, isSessionActive && styles.masterHidden]}
            disabled={isSessionActive || awaitingStopRelease}
            activeOpacity={0.85}
            onPress={startSession}
          >
            {/* Rests in the `off` artwork to match the comp, and lights up only
                while the finger left over from a STOP hold is still down —
                which is also the window where the press is deliberately
                ignored, so the change is visible rather than silent. */}
            <DualImage
              on={BTN.startOn}
              off={BTN.startOff}
              showOn={awaitingStopRelease}
              width={layout.primaryButton.w}
              height={layout.primaryButton.h}
            />
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>{FOOTER_HINT[sessionState]}</Text>
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  stackedImg: { position: 'absolute', width: '100%', height: '100%', resizeMode: 'contain' },

  // ── state + identity ──────────────────────────────────────────────────
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 60,
    marginTop: 6,
    marginLeft: 46,
  },
  stateWord: { color: colors.white, fontSize: font.sessionWord, letterSpacing: 2 },
  stateDot: { width: 115, height: 115, borderRadius: 58 },

  identityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 44,
    marginHorizontal: 46,
  },
  identityLine: { color: colors.white, fontSize: font.patientLine, lineHeight: 58 },
  identityLabel: { color: colors.text },

  pouchBlock: { alignItems: 'flex-end', gap: 8 },
  pouchBatteryRow: { flexDirection: 'row', alignItems: 'center' },
  pouchBatteryBody: {
    width: 74,
    height: 38,
    borderWidth: 4,
    borderColor: colors.white,
    borderRadius: 6,
    padding: 4,
    justifyContent: 'center',
  },
  pouchBatteryFill: { height: '100%', borderRadius: 2 },
  pouchBatteryCap: {
    width: 6,
    height: 16,
    backgroundColor: colors.white,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    marginRight: 60,
  },
  pouchBatteryText: { color: colors.white, fontSize: font.battery },
  pouchIdRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pouchDot: { width: 26, height: 26, borderRadius: 13 },
  pouchIdText: { color: colors.white, fontSize: font.pouchLine },

  // ── panels ────────────────────────────────────────────────────────────
  panel: {
    position: 'absolute',
    left: layout.gutter,
    width: layout.panelW,
    borderWidth: 3,
    borderColor: colors.panelBorder,
    borderRadius: layout.panelRadius,
    backgroundColor: colors.panel,
  },
  // Positioned to the comps' own coordinates, minus the 105 status bar and 100
  // header the frame already draws above this view.
  treatmentPanel: { top: layout.treatment.y - 205, height: layout.treatment.h },
  pressurePanel: { top: layout.pressure.y - 205, height: layout.pressure.h },
  massagePanel: { top: layout.massage.y - 205, height: layout.massage.h },

  panelTitle: { color: colors.text, fontSize: font.panelTitle, marginTop: 26, marginLeft: 21 },
  zoneName: {
    color: colors.white,
    fontSize: font.zoneName,
    marginLeft: 21,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  sessionStatus: { color: colors.text, fontSize: font.bodyLine, marginLeft: 21, marginTop: 12 },

  // Measured off the comp: the head sits x 595..825, y 525..795 on the canvas,
  // against a panel whose box starts at x 41, y 483.
  heroFrame: { position: 'absolute', right: 20, top: 42, width: 230, height: 270 },
  hero: { position: 'absolute', width: '100%', height: '100%' },

  // Tile centres in the comp are 183 / 355 / 530 / 703, i.e. 75 in from the
  // panel edge with even gaps — not edge-to-edge, which is what a plain
  // space-between over the full width would give.
  zoneRow: {
    position: 'absolute',
    left: 72,
    right: 72,
    top: 358,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  // ── pressure ──────────────────────────────────────────────────────────
  // Comp: the row runs x 67..606, y 1158..1235 on the canvas; the panel box
  // starts at x 41, y 1027.
  sliderRow: {
    position: 'absolute',
    left: 26,
    top: 131,
    width: 540,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepImg: { width: 78, height: 78, resizeMode: 'contain' },

  readoutBlock: { position: 'absolute', right: 30, top: 24, alignItems: 'center' },
  readoutDigits: { color: colors.white, fontSize: 118, lineHeight: 122 },
  readoutUnit: { color: colors.white, fontSize: font.unit, marginTop: -6 },

  // ── massage ───────────────────────────────────────────────────────────
  massageHeaderRow: { flexDirection: 'row', alignItems: 'baseline', gap: 30 },
  massageRemaining: { color: colors.white, fontSize: font.bodyLine, marginTop: 26 },

  massageRow: {
    position: 'absolute',
    left: 21,
    right: 24,
    top: 126,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  massagePill: {
    width: layout.massagePill.w,
    height: layout.massagePill.h,
    borderRadius: layout.massagePill.h / 2,
    backgroundColor: colors.controlTrack,
    borderWidth: 3,
    borderColor: colors.controlOn,
    flexDirection: 'row',
    alignItems: 'center',
  },
  massageCell: { flex: 1, alignItems: 'center' },
  massageRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  massageRingActive: { borderColor: colors.accent },
  massageDigit: { color: colors.white, fontSize: font.massageDigit, lineHeight: 80 },

  // ── start / stop ──────────────────────────────────────────────────────
  masterSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: layout.primaryButton.y - 205,
    height: layout.primaryButton.h,
    alignItems: 'center',
  },
  masterBtn: { position: 'absolute' },
  masterHidden: { opacity: 0 },
  masterClip: {
    width: layout.primaryButton.w,
    height: layout.primaryButton.h,
    borderRadius: layout.primaryButton.h / 2,
    overflow: 'hidden',
  },
  stopHoldFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },

  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: layout.hintY - 205,
    textAlign: 'center',
    color: colors.text,
    fontSize: font.hint,
  },
});
