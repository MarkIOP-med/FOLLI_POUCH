#include "config.h"

void initLeds() {
  pixels.begin();
  allLedsOff();
  Serial.println("✓ LEDs initialized");
}

void allLedsOff() {
  pixels.clear();
  pixels.show();
}

void setLed(int index, Color color) {
  if (index < 0 || index >= NUM_LEDS) return;
  pixels.setPixelColor(index, pixels.Color(color.r, color.g, color.b));
  pixels.show();
}

void updateLeds() {
  const int padLed[4] = {LED_FRONT, LED_TEMPLE, LED_EAR, LED_BACK};
  const int vibLed[4] = {LED_VIB_0, LED_VIB_1, LED_VIB_2, LED_VIB_3};

  // Line 1: PAD selection — selected PAD = GREEN, others OFF
  for (int i = 0; i < 4; i++) {
    pixels.setPixelColor(padLed[i],
      (i == selectedPad)
        ? pixels.Color(COLOR_GREEN.r, COLOR_GREEN.g, COLOR_GREEN.b)
        : pixels.Color(0, 0, 0));
  }

  // Line 3: vibration level — active level lit GREEN, others OFF
  // vibLed[0] (LED_VIB_0) always stays off — level 0 means motors off
  int activeLevel = (selectedPad >= 0) ? massageLevel[selectedPad] : 0;
  for (int i = 0; i < 4; i++) {
    bool lit = (i == activeLevel);
    pixels.setPixelColor(vibLed[i],
      lit ? pixels.Color(COLOR_GREEN.r, COLOR_GREEN.g, COLOR_GREEN.b)
          : pixels.Color(0, 0, 0));
  }

  pixels.show();
}
