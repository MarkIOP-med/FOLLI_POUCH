#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>

#define DISPLAY_RESET   34
#define NUM_SENSORS     6
#define AVG_SAMPLES     32
#define LOOP_DELAY      150       // ~6-7 updates/sec
#define VERSION         1.00

// mmHg conversion (your exact formula)
#define MMHG(raw)       ((raw) * 0.1636f - 10.031f)

// Simple thresholds - only real problems trigger ERR
#define RAW_MIN         5
#define RAW_MAX         1015
#define MMHG_LOW        30.0f
#define MMHG_HIGH       200.0f

Adafruit_SH1106G display(128, 64, &Wire, DISPLAY_RESET);

float sensorRaw[NUM_SENSORS]  = {0};
float sensorMMHG[NUM_SENSORS] = {0};
char buffer[300];
byte displayCounter = 0;
const byte DISPLAY_UPDATE_EVERY = 4;

unsigned long startMillis = 0;

void setup() {
  Serial.begin(9600);           // ← 9600 baud as requested
  startMillis = millis();

  display.begin(0x3C, true);
  display.display();
  delay(500);

  // Simple splash
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE);
  display.setCursor(0,0);
  display.println(F("Follisave"));
  display.println(F("Pressure Monitor"));
  display.println(F("Ready"));
  display.print(F("V")); display.println(VERSION, 2);
  display.display();
  delay(1500);
}

void loop() {
  readSensorsAverage();
  convertToMMHG();

  if (++displayCounter >= DISPLAY_UPDATE_EVERY) {
    updateDisplayFull();
    displayCounter = 0;
  }

  printSerial();
  delay(LOOP_DELAY);
}

// ================================================
void readSensorsAverage() {
  uint32_t sums[NUM_SENSORS] = {0};
  for (uint8_t s = 0; s < AVG_SAMPLES; s++) {
    for (uint8_t i = 0; i < NUM_SENSORS; i++) {
      sums[i] += analogRead(i);
    }
  }
  for (uint8_t i = 0; i < NUM_SENSORS; i++) {
    sensorRaw[i] = sums[i] / (float)AVG_SAMPLES;
  }
}

void convertToMMHG() {
  for (uint8_t i = 0; i < NUM_SENSORS; i++) {
    sensorMMHG[i] = MMHG(sensorRaw[i]);
    if (sensorMMHG[i] < 0) sensorMMHG[i] = 0;
  }
}

void printSerial() {
  for (uint8_t i = 0; i < NUM_SENSORS; i++) {
    Serial.print("S"); Serial.print(i);
    Serial.print(": "); Serial.print(sensorRaw[i], 1);
    Serial.print(" -> "); Serial.print(sensorMMHG[i], 1);
    Serial.print(" mmHg");
    if (i < 5) Serial.print(" | ");
  }
  Serial.print("  ["); Serial.print(getSystemStatus()); Serial.println("]");
}

void updateDisplayFull() {
  unsigned long secs = (millis() - startMillis) / 1000;
  int h = (secs / 3600) % 24;
  int m = (secs / 60) % 60;
  int s = secs % 60;

  memset(buffer, 0, sizeof(buffer));
  sprintf(buffer, "%02d:%02d:%02d  V%.2f\n", h, m, s, VERSION);

  for (uint8_t i = 0; i < NUM_SENSORS; i++) {
    sprintf(buffer + strlen(buffer), "S%d: %3.0f  %5.1f [mmHg]\n",
            i, sensorRaw[i], sensorMMHG[i]);
  }

  sprintf(buffer + strlen(buffer), "Follisave  %s", getSystemStatus().c_str());

  display.clearDisplay();
  display.setCursor(0, 0);
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE);
  display.print(buffer);
  display.display();
}

String getSystemStatus() {
  // Only real errors trigger ERR
  for (uint8_t i = 0; i < NUM_SENSORS; i++) {
    if (sensorRaw[i] < RAW_MIN || sensorRaw[i] > RAW_MAX) return "ERR";
  }
  bool low = false, high = false;
  for (uint8_t i = 0; i < NUM_SENSORS; i++) {
    if (sensorMMHG[i] < MMHG_LOW)  low  = true;
    if (sensorMMHG[i] > MMHG_HIGH) high = true;
  }
  if (high) return "HIGH";
  if (low)  return "LOW";
  return "OK";
}