#include "config.h"

// File-scope statics — accessible by resetChannelState()
static unsigned long channelTimer  = 0;
static int           channelPhase  = 0;
static bool          channelActive = false;

void resetChannelState() {
  channelActive = false;
  channelPhase  = 0;
  channelTimer  = 0;
}

void initValves() {
  for (int i = 0; i < 6; i++) {
    pinMode(valvePins[i], OUTPUT);
    digitalWrite(valvePins[i], LOW);
  }
}

void reliefStartup() {
  Serial.println("Venting system to atmosphere...");
  digitalWrite(PUMP_PIN, LOW);
  digitalWrite(RELIEF_PIN, HIGH);
  for (int i = 0; i < 4; i++) digitalWrite(valvePins[i], HIGH);
  delay(RELIEF_VENT_DURATION_MS);
  digitalWrite(RELIEF_PIN, LOW);
  for (int i = 0; i < 4; i++) digitalWrite(valvePins[i], LOW);
  delay(STARTUP_SETTLE_MS);
  Serial.println("✓ Startup vent complete.");
}

void reliefAllPads() {
  digitalWrite(PUMP_PIN, LOW);

  // Pulsed vent: burst → close → settle → measure → repeat. The pad sensors
  // CANNOT see the load's pressure while the vent path is open — the sensor
  // line empties instantly through the relief while a high-volume load (bench
  // balloons at 125 mmHg) drains slowly through its narrow tubing, so both a
  // fixed 1s vent and a naive "vent until sensors read 0" left the load
  // visibly inflated and, worse, let the next reference capture hide its real
  // pressure. Only a reading taken with the valves CLOSED, after the line
  // re-equalises with the load, can be trusted. Blocking is fine here — a full
  // vent is a terminal action — and the timeout guards a dead sensor.
  unsigned long ventStart = millis();
  while (millis() - ventStart < RELIEF_VENT_TIMEOUT_MS) {
    digitalWrite(RELIEF_PIN, HIGH);
    for (int i = 0; i < 4; i++) digitalWrite(valvePins[i], HIGH);
    delay(RELIEF_VENT_DURATION_MS);

    digitalWrite(RELIEF_PIN, LOW);
    for (int i = 0; i < 4; i++) digitalWrite(valvePins[i], LOW);
    delay(VENT_SETTLE_MS);

    readAnalogSensors();
    updateCurrentPressures();
    bool vented = actualManifoldPressure <= VENT_COMPLETE_MMHG;
    for (int i = 0; vented && i < 4; i++) {
      if (actualPressure[i] > VENT_COMPLETE_MMHG) vented = false;
    }
    if (vented) break;
  }

  for (int i = 0; i < 4; i++) currentTargetPressure[i] = 0;
  resetChannelState();
  currentState = IDLE;
  Serial.println("All PADs relieved to zero.");
}

void runStateMachine() {
  if (currentState == STOPPED) return;

  if (currentState == EMERGENCY_RELIEF) {
    reliefAllPads();
    return;
  }

  if (currentState == PRESSURIZING || currentState == MAINTENANCE) {
    updateChannels();
  }
}

void updateChannels() {

  if (!channelActive) {
    currentChannel = currentChannel % 4;

    // Skip channels where target is 0 and actual is below the actuation threshold.
    // Sensor noise at atmospheric reads 3–7 mmHg; without this they enter the relief
    // branch and open valves unnecessarily. If actual > threshold (real residual
    // pressure), the channel is not skipped and the relief path vents it normally.
    if (currentTargetPressure[currentChannel] == 0 &&
        actualPressure[currentChannel] <= PRESSURE_ACTUATION_THRESHOLD_MMHG) {
      currentChannel++;
      if (currentChannel >= 4 && currentState == PRESSURIZING) {
        currentState = MAINTENANCE;
        Serial.println("All channels at target → MAINTENANCE");
      }
      return;
    }

    channelActive = true;
    channelPhase  = 0;
    channelTimer  = millis();
    return;
  }

  if (millis() - channelTimer < CHANNEL_PHASE_TICK_MS) return;

  float error = currentTargetPressure[currentChannel] - actualPressure[currentChannel];

  // PAD is at target — close all, advance to next channel
  if (abs(error) <= PRESSURE_TOLERANCE_MMHG) {
    digitalWrite(valvePins[currentChannel], LOW);
    digitalWrite(PUMP_PIN, LOW);
    digitalWrite(RELIEF_PIN, LOW);
    currentChannel++;
    channelActive = false;
    if (currentChannel >= 4 && currentState == PRESSURIZING) {
      currentState = MAINTENANCE;
      Serial.println("All channels at target → MAINTENANCE");
    }
    return;
  }

  // ── PUMP PATH (error > 0 — PAD below target) ──────────────────────────────

  if (channelPhase == 0) {
    if (error > 0) {
      // If manifold is already above this channel's target, vent it first
      if (actualManifoldPressure > currentTargetPressure[currentChannel] + PRESSURE_TOLERANCE_MMHG) {
        digitalWrite(RELIEF_PIN, HIGH);
        channelPhase = 1;   // → pre-vent manifold
      } else {
        digitalWrite(PUMP_PIN, HIGH);
        channelPhase = 2;   // → charge manifold directly
      }
    } else {
      // Relief path — connect PAD to manifold and open relief together
      digitalWrite(valvePins[currentChannel], HIGH);
      digitalWrite(RELIEF_PIN, HIGH);
      channelPhase = 11;
    }
    channelTimer = millis();
    return;
  }

  // Phase 1 — Pre-venting manifold (RELIEF open, PAD valve closed)
  // Stay here until manifold drops to ≤ target, then start charging
  if (channelPhase == 1) {
    if (actualManifoldPressure > currentTargetPressure[currentChannel]) return;
    digitalWrite(RELIEF_PIN, LOW);
    digitalWrite(PUMP_PIN, HIGH);
    channelPhase = 2;
    channelTimer = millis();
    return;
  }

  // Phase 2 — Charging manifold (PUMP open, PAD valve closed)
  // Stay here until manifold reaches target, then equalize PAD
  if (channelPhase == 2) {
    if (actualManifoldPressure < currentTargetPressure[currentChannel] - PRESSURE_TOLERANCE_MMHG) return;
    digitalWrite(PUMP_PIN, LOW);
    digitalWrite(valvePins[currentChannel], HIGH);  // open PAD valve — equalize
    channelPhase = 3;
    channelTimer = millis();
    return;
  }

  // Phase 3 — Equalization (PAD valve open, one tick)
  // Manifold and PAD equalize at target pressure, then close valve
  if (channelPhase == 3) {
    digitalWrite(valvePins[currentChannel], LOW);
    channelPhase  = 0;
    channelActive = false;
    channelTimer  = millis();
    return;
  }

  // ── RELIEF PATH (error < 0 — PAD above target) ────────────────────────────

  // Phase 11 — Venting (PAD valve + RELIEF open). Stay here, re-checking every tick,
  // until vented to within tolerance — mirrors phase 2's "stay until condition met"
  // pattern on the charging side. Previously this pulsed for one fixed tick (~30ms)
  // and moved on regardless, which was too short to vent anything meaningful.
  if (channelPhase == 11) {
    if (actualPressure[currentChannel] > currentTargetPressure[currentChannel] + PRESSURE_TOLERANCE_MMHG) return;
    digitalWrite(PUMP_PIN, LOW);
    digitalWrite(RELIEF_PIN, LOW);
    channelPhase = 12;
    channelTimer = millis();
    return;
  }

  // Phase 12 — Close PAD valve
  if (channelPhase == 12) {
    digitalWrite(valvePins[currentChannel], LOW);
    channelPhase  = 0;
    channelActive = false;
    channelTimer  = millis();
    return;
  }
}
