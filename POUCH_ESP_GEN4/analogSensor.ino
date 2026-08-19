#include "config.h"

// Read all sensors with oversampling and store differential (gauge) pressure in p[].
// Differential = raw reading minus the reference captured at atmospheric after last relief.
void readAnalogSensors() {
  long sum[NUM_SENSORS] = {0};

  for (int j = 0; j < overSampling; j++) {
    for (int i = 0; i < NUM_SENSORS; i++) {
      sum[i] += analogRead(analogPressureSensorPins[i]);
      delayMicroseconds(sensorDelayMeasur);
    }
    delay(overSamplingDelay);
  }

  for (int i = 0; i < NUM_SENSORS; i++) {
    float raw          = sum[i] / (float)overSampling;
    float voltage      = (raw / 4095.0) * 3.3;
    float pressure_kPa = (voltage - Vmin) * (Pmax_kPa / (Vmax - Vmin));
    float mmhg         = pressure_kPa * 7.50062;
    p[i] = max(0.0f, mmhg - referencePressure[i]);
  }
}

// Capture current sensor readings as the atmospheric baseline.
// Call this immediately after a full relief (all PADs vented to atmosphere).
void captureReferencePressure() {
  long sum[NUM_SENSORS] = {0};

  for (int j = 0; j < overSampling; j++) {
    for (int i = 0; i < NUM_SENSORS; i++) {
      sum[i] += analogRead(analogPressureSensorPins[i]);
      delayMicroseconds(sensorDelayMeasur);
    }
    delay(overSamplingDelay);
  }

  for (int i = 0; i < NUM_SENSORS; i++) {
    float raw          = sum[i] / (float)overSampling;
    float voltage      = (raw / 4095.0) * 3.3;
    float pressure_kPa = (voltage - Vmin) * (Pmax_kPa / (Vmax - Vmin));
    referencePressure[i] = pressure_kPa * 7.50062;
  }

  Serial.println("✓ Pressure reference captured.");
}

void updateCurrentPressures() {
  for (int i = 0; i < 4; i++) {
    actualPressure[i] = p[i + 1];   // p[0] is MANIFOLD; PADs start at p[1]
  }
  actualManifoldPressure = p[PUMP_SENSOR];
}
