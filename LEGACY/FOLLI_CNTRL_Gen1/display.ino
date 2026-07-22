#include "config.h"

void initDisplay() {
  if (!display.begin(0x3C, true)) {     // Address 0x3C, reset=true
    Serial.println("OLED allocation failed");
    return;
  }
  
  display.display();
  delay(500);
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE);
  display.setCursor(0, 0);
  
  display.println("FOLLISAVE Gen1");
  display.println("Initializing...");
  display.println("Pressure Control");
  display.display();
  delay(1500);
  Serial.println("✓ OLED Display initialized");
}

void updateDisplay() {
  static unsigned long lastDisplayTime = 0;
  
  if (millis() - lastDisplayTime < DISPLAY_UPDATE_INTERVAL) return;
  lastDisplayTime = millis();

  display.clearDisplay();
  display.setCursor(0, 0);
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE);

  // Header
  display.print("FOLLISAVE  Ch");
  display.println(currentChannel);

  // Status line
  display.print("State: ");
  switch (currentState) {
    case IDLE:         display.println("IDLE"); break;
    case BATCH_PUMPING:display.println("BATCH"); break;
    case MAINTENANCE:  display.println("MAINT"); break;
    default:           display.println("???"); break;
  }

  // Pressures for all 4 channels
  for (int i = 0; i < 4; i++) {
    display.print("Ch"); display.print(i);
    display.print(": T"); display.print(targetPressure[i]);
    display.print(" A"); display.print(currentPressure_gage[i], 1);
    display.println();
  }

  display.print("Man: "); display.println(manifoldPressure_gage, 1);

  display.display();
}