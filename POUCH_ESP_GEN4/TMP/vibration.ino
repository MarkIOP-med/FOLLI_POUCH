#include "config.h"

void initVibration() {
  for (int i = 0; i < 6; i++) {
    pinMode(vibrationPins[i], OUTPUT);
    analogWrite(vibrationPins[i], 0);
  }
}

void updateVibration() {
  for (int i = 0; i < 4; i++) {
    if (massageLevel[i] > 0 &&
        millis() - vibStartTime[i] >= (unsigned long)VIBRATION_DURATION_MS) {
      massageLevel[i] = 0;  // auto-off after duration
    }
    analogWrite(vibrationPins[i], vibPWM[massageLevel[i]]);
  }
}

void stopAllVibration() {
  for (int i = 0; i < 6; i++) analogWrite(vibrationPins[i], 0);
  for (int i = 0; i < 4; i++) massageLevel[i] = 0;
}
