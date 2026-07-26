import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Image,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useConsole, SessionState } from '../viewmodels/useConsole';
import { VNode, MassageLevel, ZONE_LABELS } from '../models/telemetry';
import { PRESSURE_UI_MAX } from '../config';
import PressureSlider from '../components/PressureSlider';

// Official button artwork (assets/buttons). Tiles carry their own label text
// and selected (_on = light) / unselected (_off = dark) backgrounds; the hero
// head illustrations highlight the selected zone's node.
const HERO_IMG: Record<VNode, ReturnType<typeof require>> = {
  0x01: require('../../assets/buttons/head_zones_front.png'),
  0x02: require('../../assets/buttons/head_zones_temples.png'),
  0x03: require('../../assets/buttons/head_zones_ears.png'),
  0x04: require('../../assets/buttons/head_zones_back.png'),
};

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

// How long STOP must be held before the emergency stop fires.
const STOP_HOLD_MS = 1500;

// START/STOP artwork is 614x199; SET is 369x200. Rendered sizes keep those
// aspect ratios so the capsule ends stay perfectly round.
const MASTER_BTN_W = 260;
const MASTER_BTN_H = 84;
const SET_BTN_W = 84;
const SET_BTN_H = 46;

const HEADER_LABEL: Record<SessionState, string> = {
  pending: 'PENDING',
  active: 'ACTIVE',
  stopped: 'STOPPED',
};

const DOT_COLOR: Record<SessionState, string> = {
  pending: '#f0b429', // amber — waiting for START
  active: '#82c22c', // green — session running
  stopped: '#d8433a', // red — emergency stopped
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

// Renders BOTH artwork states stacked and toggles opacity. Swapping an Image
// `source` forces Android to re-decode the file, which makes the button flash
// for a frame — stacking keeps every state pre-decoded so switches are
// perfectly instant.
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
    isConnected,
    sendCommandToPouch,
    handleEmergencyStop,
    startSession,
  } = useConsole();

  const locked = !isSessionActive;

  // STOP hold-to-confirm: while the button is held, a light fill sweeps across
  // it over STOP_HOLD_MS; releasing early cancels. Interval-driven (not
  // Animated) so the behavior is fully deterministic under test fake-timers.
  const [holdProgress, setHoldProgress] = useState(0);
  // After the hold completes, the finger is still on the screen where the
  // START button appears — swallow that release so lifting the finger can't
  // instantly restart the session.
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

  // Safety net: even if the root never sees the touch end (edge swipes etc.),
  // re-enable START shortly after a stop.
  useEffect(() => {
    if (!awaitingStopRelease) return;
    const t = setTimeout(() => setAwaitingStopRelease(false), 1000);
    return () => clearTimeout(t);
  }, [awaitingStopRelease]);

  // SET flicker: while the selected zone has changes the pouch hasn't received,
  // the SET button pulses to prompt the patient to apply them.
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
    <LinearGradient colors={['#010813', '#050e1d']} style={styles.pageGradient}>
      <SafeAreaView
        style={styles.rootContainer}
        onTouchEnd={() => {
          if (awaitingStopRelease) setAwaitingStopRelease(false);
        }}
      >
        <StatusBar barStyle="light-content" backgroundColor="#010813" hidden />

        {/* HEADER: state + colored dot, session timer below, admin gear top-right */}
        <View style={styles.headerRow}>
          <Text style={styles.statusText}>{HEADER_LABEL[sessionState]}</Text>
          <View
            style={[
              styles.statusIndicator,
              { backgroundColor: DOT_COLOR[sessionState], shadowColor: DOT_COLOR[sessionState] },
            ]}
          />
          <TouchableOpacity
            testID="settings-gear"
            style={styles.settingsButton}
            activeOpacity={0.7}
            onPress={onOpenSettings}
            accessibilityLabel="Open admin control panel"
          >
            <Text style={styles.settingsIconText}>⚙</Text>
          </TouchableOpacity>
        </View>
        <Text testID="session-timer" style={styles.timerText}>
          Session Time:{formatElapsed(elapsedSeconds)} min
        </Text>
        <Text
          testID="ble-status"
          style={[styles.bleStatusText, isConnected && styles.bleStatusConnected]}
        >
          {isConnected ? '● Pouch connected' : '○ Searching for pouch…'}
        </Text>

        {/* TREATMENT AREA CARD */}
        <View style={styles.consoleCard}>
          <View style={styles.treatmentSplitRow}>
            <View style={styles.treatmentLeftCol}>
              <Text style={styles.cardHeader}>Treatment Area</Text>
              <Text style={styles.cardMainTitle}>{ZONE_LABELS[activeZone] || 'Unknown'}</Text>
              <Text style={styles.cardSubStatus}>Session Status: {SUB_STATUS[sessionState]}</Text>
            </View>
            {/* Hero head illustration — the artwork highlights the active zone.
                All four stay mounted; only opacity flips (no decode flicker). */}
            <View style={styles.headFrame}>
              {ZONES.map((zone) => (
                <Image
                  key={zone}
                  source={HERO_IMG[zone]}
                  style={[styles.heroHead, { opacity: activeZone === zone ? 1 : 0 }]}
                  resizeMode="contain"
                />
              ))}
            </View>
          </View>

          {/* Node selector: official tile artwork spread symmetrically edge to
              edge, each with a tiny per-zone readout (massage + mmHg) below. */}
          <View style={styles.zoneButtonGrid}>
            {ZONES.map((zone) => {
              const isSelected = activeZone === zone;
              const settings = zoneSettings[zone];
              return (
                <View key={zone} style={styles.zoneCell}>
                  <TouchableOpacity
                    testID={`zone-${zone}`}
                    activeOpacity={0.7}
                    onPress={() => setActiveZone(zone)}
                  >
                    <DualImage
                      on={ZONE_TILE[zone].on}
                      off={ZONE_TILE[zone].off}
                      showOn={isSelected}
                      width={64}
                      height={64}
                    />
                  </TouchableOpacity>
                  <Text style={styles.zoneCellLevel}>Lv {settings.massage}</Text>
                  <Text style={styles.zoneCellPressure}>{settings.pressure} mmHg</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* PRESSURE CONTROL CARD */}
        <View style={styles.consoleCard}>
          <Text style={styles.cardHeader}>Pressure Control</Text>

          <View style={styles.pressureReadoutContainer}>
            <Text testID="pressure-readout" style={styles.pressureMainDigits}>
              {targetPressure}
            </Text>
            <Text style={styles.pressureUnit}>mmHg</Text>
          </View>

          <View style={styles.sliderWrapperRow}>
            <TouchableOpacity
              testID="pressure-minus"
              style={styles.sliderStepButton}
              activeOpacity={0.6}
              onPress={() => updateTargetPressure(Math.max(0, targetPressure - 1))}
            >
              <Image source={BTN.minus} style={styles.stepImg} />
            </TouchableOpacity>
            <PressureSlider
              testID="pressure-slider"
              value={targetPressure}
              maximumValue={PRESSURE_UI_MAX}
              onValueChange={updateTargetPressure}
            />
            <TouchableOpacity
              testID="pressure-plus"
              style={styles.sliderStepButton}
              activeOpacity={0.6}
              onPress={() => updateTargetPressure(Math.min(PRESSURE_UI_MAX, targetPressure + 1))}
            >
              <Image source={BTN.plus} style={styles.stepImg} />
            </TouchableOpacity>
          </View>

          <Animated.View style={[styles.setButtonWrap, { opacity: setPulse }]}>
            <TouchableOpacity
              testID="set-button"
              disabled={locked}
              activeOpacity={0.7}
              onPress={sendCommandToPouch}
            >
              <DualImage
                on={BTN.setOn}
                off={BTN.setOff}
                showOn={!locked}
                width={SET_BTN_W}
                height={SET_BTN_H}
              />
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* MASSAGE LEVELS CARD — numbers live inside a capsule track */}
        <View style={styles.consoleCard}>
          <Text style={styles.cardHeader}>Massage Levels</Text>
          <View style={styles.segmentedControlTrack}>
            {SPEEDS.map((level) => {
              const isSelected = massageLevel === level;
              return (
                <TouchableOpacity
                  key={level}
                  testID={`massage-${level}`}
                  style={styles.segmentItem}
                  activeOpacity={0.7}
                  onPress={() => setMassageLevel(level)}
                >
                  <View style={[styles.segmentCircle, isSelected && styles.segmentCircleActive]}>
                    <Text style={styles.segmentItemText}>{level}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* START / STOP + footer strip. BOTH buttons stay mounted in the same
            fixed-size slot — the inactive one is fully transparent and inert.
            This kills the remount flash on state flips, and because they are
            separate elements, a finger still held on STOP after the hold
            completes can never fire the (freshly revealed) START button. */}
        <View style={styles.emergencyContainer}>
          <View style={styles.masterArea}>
            <TouchableOpacity
              testID="stop-button"
              style={[styles.masterBtnAbs, !isSessionActive && styles.masterBtnHidden]}
              disabled={!isSessionActive}
              activeOpacity={1}
              onPressIn={beginStopHold}
              onPressOut={cancelStopHold}
            >
              <View style={styles.masterBtnClip}>
                <DualImage
                  on={BTN.stopOn}
                  off={BTN.stopOff}
                  showOn={holdProgress === 0}
                  width={MASTER_BTN_W}
                  height={MASTER_BTN_H}
                />
                <View
                  testID="stop-hold-fill"
                  style={[styles.stopHoldFill, { width: `${holdProgress * 100}%` }]}
                />
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              testID="start-button"
              style={[styles.masterBtnAbs, isSessionActive && styles.masterBtnHidden]}
              disabled={isSessionActive || awaitingStopRelease}
              activeOpacity={0.85}
              onPress={startSession}
            >
              <DualImage
                on={BTN.startOn}
                off={BTN.startOff}
                showOn={!awaitingStopRelease}
                width={MASTER_BTN_W}
                height={MASTER_BTN_H}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.safetyFooterStrip}>
            <Svg width={13} height={15} viewBox="0 0 20 23" style={styles.shieldIcon}>
              <Path
                d="M10 1 L18 4.5 V11 C18 16.5 14.6 20.4 10 22 C5.4 20.4 2 16.5 2 11 V4.5 Z"
                fill="none"
                stroke="#8b95a5"
                strokeWidth={1.8}
              />
              <Path
                d="M6.5 11.5 L9 14 L13.8 8.5"
                fill="none"
                stroke="#8b95a5"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
            <Text style={styles.safetyInstructionFooter}>{FOOTER_HINT[sessionState]}</Text>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  pageGradient: {
    flex: 1,
  },
  rootContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  statusText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 26,
    letterSpacing: 0.5,
  },
  statusIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginLeft: 12,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 7,
    elevation: 5,
  },
  settingsButton: {
    position: 'absolute',
    right: 0,
    top: 1,
    padding: 6,
    opacity: 0.5,
  },
  settingsIconText: {
    fontSize: 16,
    color: '#8fa0b5',
  },
  timerText: {
    color: '#c9d4e2',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 3,
  },
  bleStatusText: {
    color: '#8fa0b5',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 10,
  },
  bleStatusConnected: {
    color: '#7fc95c',
  },
  consoleCard: {
    backgroundColor: '#081120',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#263343',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  treatmentSplitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  treatmentLeftCol: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 2,
    paddingRight: 10,
  },
  cardHeader: {
    color: '#f0f4f9',
    fontSize: 15,
    fontWeight: '500',
  },
  cardMainTitle: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: 'bold',
  },
  cardSubStatus: {
    color: '#c3cfdd',
    fontSize: 13,
  },
  headFrame: {
    width: 100,
    height: 128,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3b586f',
    backgroundColor: '#020a14',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroHead: {
    position: 'absolute',
    left: 1,
    top: 1,
    width: 96,
    height: 124,
  },
  stackedImg: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
  },
  zoneButtonGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  zoneCell: {
    alignItems: 'center',
  },
  zoneTileImg: {
    width: 64,
    height: 64,
  },
  zoneCellLevel: {
    color: '#8fa0b5',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  zoneCellPressure: {
    color: '#6c7d92',
    fontSize: 9,
    marginTop: 1,
  },
  pressureReadoutContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginTop: 2,
  },
  pressureMainDigits: {
    color: '#ffffff',
    fontSize: 48,
    fontWeight: 'bold',
  },
  pressureUnit: {
    color: '#e8eef5',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 6,
  },
  sliderWrapperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  sliderStepButton: {
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  stepImg: {
    width: 32,
    height: 32,
  },
  setButtonWrap: {
    alignSelf: 'center',
    marginTop: 6,
    marginBottom: 2,
  },
  setImg: {
    width: SET_BTN_W,
    height: SET_BTN_H,
  },
  segmentedControlTrack: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#152334',
    borderWidth: 1,
    borderColor: '#2a384a',
    borderRadius: 27,
    paddingVertical: 2,
    paddingHorizontal: 10,
    marginTop: 10,
  },
  segmentItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentCircleActive: {
    borderColor: '#0a8ce0',
    backgroundColor: 'rgba(20,80,150,0.30)',
  },
  segmentItemText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '600',
  },
  emergencyContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  masterArea: {
    alignSelf: 'center',
    width: MASTER_BTN_W,
    height: MASTER_BTN_H,
    marginBottom: 9,
  },
  masterBtnAbs: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  masterBtnHidden: {
    opacity: 0,
    pointerEvents: 'none',
  },
  masterBtnClip: {
    borderRadius: MASTER_BTN_H / 2,
    overflow: 'hidden',
  },
  stopHoldFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    // Light sweep over the capsule artwork — same tone, one shade brighter.
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  safetyFooterStrip: {
    flexDirection: 'row',
    backgroundColor: '#081424',
    borderWidth: 1,
    borderColor: '#1b2b42',
    borderRadius: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldIcon: {
    marginRight: 6,
  },
  safetyInstructionFooter: {
    color: '#95a1b2',
    fontSize: 12,
  },
});
