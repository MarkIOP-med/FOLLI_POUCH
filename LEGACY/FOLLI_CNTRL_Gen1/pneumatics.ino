#include "config.h"

void initValveCompressorVibration() {
  for (int i = 0; i < 9; i++) {
    pinMode(valvePins[i], OUTPUT);
    digitalWrite(valvePins[i], LOW);
  }
  for (int i = 0; i < 5; i++) {
    pinMode(compressorPins[i], OUTPUT);
    digitalWrite(compressorPins[i], LOW);
  }
  for (int i = 0; i < 8; i++) {
    pinMode(vibrationPins[i], OUTPUT);
    digitalWrite(vibrationPins[i], LOW);
  }
}

void reliefAllPstart() {
  digitalWrite(RELIEF_PIN, HIGH);
  for (int i = 0; i < 4; i++) digitalWrite(valvePins[i], HIGH);
  delay(1000);
  digitalWrite(RELIEF_PIN, LOW);
  for (int i = 0; i < 4; i++) digitalWrite(valvePins[i], LOW);
  delay(150);
}