#include "config.h"

void initDisplay() {
  if (!display.begin(0x3C, true)) {
    Serial.println("OLED init failed");
    return;
  }
  display.display();
  delay(500);
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE);
  display.setCursor(0, 0);
  display.println("FOLLISAVE Gen3");
  display.println("Initializing...");
  display.display();
  delay(1500);
  Serial.println("✓ OLED initialized");
}

void updateDisplay() {
  static unsigned long lastDisplayTime = 0;
  if (millis() - lastDisplayTime < (unsigned long)DISPLAY_UPDATE_INTERVAL) return;
  lastDisplayTime = millis();

  display.clearDisplay();
  display.setCursor(0, 0);
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE);

  // Row 1: state
  display.print("State: ");
  switch (currentState) {
    case IDLE:             display.println("IDLE");    break;
    case PRESSURIZING:     display.println("PRESS");   break;
    case MAINTENANCE:      display.println("MAINT");   break;
    case EMERGENCY_RELIEF: display.println("EMERG");   break;
    case STOPPED:          display.println("STOP");    break;
  }

  // Row 2: selected PAD
  display.print("PAD: ");
  const char* padNames[4] = {"FRONT", "TEMPLE", "EAR", "BACK"};
  if (selectedPad >= 0) display.println(padNames[selectedPad]);
  else                  display.println("--");

  // Rows 3–6: each PAD target vs actual
  const char* shortNames[4] = {"FRN", "TMP", "EAR", "BCK"};
  for (int i = 0; i < 4; i++) {
    display.print(shortNames[i]);
    display.print(" T:"); display.print(targetPressure[i]);
    display.print(" A:"); display.println((int)currentPressure_gage[i]);
  }

  // Row 7: manifold
  display.print("Man: "); display.println((int)manifoldPressure_gage);

  // Row 8: vibration levels per PAD
  display.print("Vib: ");
  for (int i = 0; i < 4; i++) {
    display.print(massageLevel[i]);
    if (i < 3) display.print(" ");
  }
  display.println();

  display.display();
}
