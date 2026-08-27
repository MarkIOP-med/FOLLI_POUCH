#include "config.h"

void clearSerialBuffer() {
  while (Serial.available() > 0) Serial.read();
}

void printSerialLog() {
  // Throttled: a full CSV line at 9600 baud takes ~130ms to ship, and printing it every
  // loop was capping the whole control loop at ~7Hz — the pump then overshot the
  // manifold badly between pressure checks (seen spiking to ~400 mmHg against a 125
  // target on the bench). 200ms keeps the dashboard fed while letting loop() run fast.
  static unsigned long lastLogMs = 0;
  if (millis() - lastLogMs < SERIAL_LOG_INTERVAL_MS) return;
  lastLogMs = millis();

  static bool headerPrinted = false;
  if (!headerPrinted) {
    Serial.println("T:time,FRN_T,FRN_A,TMP_T,TMP_A,EAR_T,EAR_A,BCK_T,BCK_A,MAN,"
                   "FSR0,FSR1,FSR2,FSR3,FSR4,FSR5,FSR6,FSR7,STATE,ELAPSED,VIB_REMAIN");
    headerPrinted = true;
  }

  Serial.print("T:");
  Serial.print(millis());                        Serial.print(',');
  for (int i = 0; i < 4; i++) {
    Serial.print(currentTargetPressure[i]);      Serial.print(',');
    Serial.print((int)actualPressure[i]);        Serial.print(',');
  }
  Serial.print((int)actualManifoldPressure);      Serial.print(',');
  for (int i = 0; i < NUM_FSR; i++) {
    Serial.print(fsrData[i]);                    Serial.print(',');
  }
  // Appended (not inserted) so old parsers fail loudly on field count rather
  // than silently misreading shifted columns.
  Serial.print(stateChar());                     Serial.print(',');
  Serial.print((unsigned long)sessionElapsedS()); Serial.print(',');
  Serial.println(vibrationRemainingS());
}

void handleSerialCommands() {
  if (!Serial.available()) return;

  String incoming = Serial.readStringUntil('\n');
  parseCommandString(incoming, SRC_SERIAL);
}
