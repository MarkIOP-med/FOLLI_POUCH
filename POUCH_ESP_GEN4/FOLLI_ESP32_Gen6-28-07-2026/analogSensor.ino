void readAnalogSensors()
{
  long sum[num_of_sensors] = {0};

  // Oversampling cycles
  for (int j = 0; j < overSampling; j++)
  {
    for (int i = 0; i < num_of_sensors; i++)
    {
      sum[i] += analogRead(analogPressureSensorPins[i]);
      delayMicroseconds(sensorDelayMeasur);
    }

    delay(overSamplingDelay);
  }

  // Process and store results
  for (int i = 0; i < num_of_sensors; i++)
  {
    float raw = sum[i] / (float)overSampling;
    float voltage = (raw / 4095.0) * 3.3;
    float pressure_kPa = (voltage - Vmin) * (Pmax_kPa / (Vmax - Vmin));
    if (pressure_kPa < 0) pressure_kPa = 0;
    float pressure_mmHg = pressure_kPa * 7.50062;
    // Round to nearest integer (no decimals)
    p[i] = round(pressure_mmHg);
  }
}
void updateCurrentPressures() {
  for (int i = 0; i < 4; i++) {
    currentPressure_gage[i] = p[i];
  }
  manifoldPressure_gage = p[PUMP_SENSOR];
}
void printAnalogSensors(){
  for (int i = 0; i < num_of_sensors; i++){
    Serial.print(p[i]);  Serial.print("  ,  ");
  }
  Serial.println("");
}
