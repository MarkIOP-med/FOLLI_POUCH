#include "config.h"

// ==================== MS5806 SENSOR FUNCTIONS ====================

void init_sensors() {
  pinMode(sen0, OUTPUT);
  pinMode(sen1, OUTPUT);
  pinMode(sen2, OUTPUT);
  pinMode(sen3, OUTPUT);
  pinMode(sen4, OUTPUT);
  digitalWrite(sen0, LOW);
  digitalWrite(sen1, LOW);
  digitalWrite(sen2, LOW);
  digitalWrite(sen3, LOW);
  digitalWrite(sen4, LOW);
}

void PressureSensorResetAll() {
  for (int i = 0; i < num_of_sensors; i++)
    PressureSensorReset(i);
}

void PressureSensorReset(int ddd) {
  select_sensor(ddd);
  Wire.beginTransmission(Device_Address);
  Wire.write(byte(0x1E));
  Wire.endTransmission();
  delay(10);
}

void GetMS5806CoeffsAll() {
  for (int i = 0; i < num_of_sensors; i++)
    GetMS5806Coeffs(i);
}

void GetMS5806Coeffs(int ddd) {
  select_sensor(ddd);
  for (int i = 0; i < 6; i++)
    cof_arr[ddd][i] = getCOEF(Device_Address, cof_control[i]);
}

void ConvertRawToMMHgAndCelsius() {
  for (int i = 0; i < num_of_sensors; i++) {
    tt[i] = TempRawConvertToCelsius(i);
    p[i] = PressureRawConvertToMMHg(i);
  }
}

void PressureSensorsRead_withTemperature() {
  for (int i = 0; i < num_of_sensors; i++) {
    PressureSensorReset(i);
    delay(20);
    Temp_raw[i] = temp_ms5806(i);
    Press_raw[i] = pressure_ms5806(i);
  }
}

long pressure_ms5806(int ddd) {
  long pres = 0;
  select_sensor(ddd);
  Wire.beginTransmission(Device_Address);
  Wire.write(byte(0x40));
  Wire.endTransmission();
  delayMicroseconds(400);
  ReadADC(ddd);
  while (Wire.available()) {
    pres = pres * 256 + Wire.read();
  }
  return pres;
}

long temp_ms5806(int ddd) {
  long temp = 0;
  select_sensor(ddd);
  Wire.beginTransmission(Device_Address);
  Wire.write(byte(0x50));
  Wire.endTransmission();
  delayMicroseconds(400);
  ReadADC(ddd);
  while (Wire.available()) {
    temp = temp * 256 + Wire.read();
  }
  return temp;
}

void ReadADC(int ddd) {
  select_sensor(ddd);
  Wire.beginTransmission(Device_Address);
  Wire.write(byte(0x00));
  Wire.endTransmission();
  Wire.requestFrom(Device_Address, 3);
}

unsigned int getCOEF(byte devAddr, byte coefAddr) {
  byte MSB, LSB;
  Wire.beginTransmission(devAddr);
  Wire.write(byte(coefAddr));
  Wire.endTransmission();
  Wire.requestFrom(devAddr, 2);
  MSB = Wire.read();
  LSB = Wire.read();
  return (MSB << 8) | LSB;
}

float TempRawConvertToCelsius(int ddd) {
  unsigned long raw = Temp_raw[ddd];
  double ttt, temp;
  temp = cof_arr[ddd][4] * 256;
  dT[ddd] = raw - temp;
  ttt = dT[ddd] * cof_arr[ddd][5] / 8388608.0 + 2000;
  return ttt / 100.0;
}

float PressureRawConvertToMMHg(int ddd) {
  long raw = Press_raw[ddd];
  double off, sens, ttt;
  off = cof_arr[ddd][3] * dT[ddd] / 64.0 + cof_arr[ddd][1] * 65536.0 * 2;
  sens = cof_arr[ddd][0] * 65536.0 + cof_arr[ddd][2] * dT[ddd] / 128.0;
  ttt = (raw * sens / 2097152.0) - off;
  ttt = ttt / 32768.0;
  return (ttt / 100.0) * 0.75;
}

void select_sensor(int ddd) {
  digitalWrite(sen0, ddd == 0);
  digitalWrite(sen1, ddd == 1);
  digitalWrite(sen2, ddd == 2);
  digitalWrite(sen3, ddd == 3);
  digitalWrite(sen4, ddd == 4);
}

void readAllSensors() {
  PressureSensorsRead_withTemperature();
  ConvertRawToMMHgAndCelsius();
}

void updateCurrentPressures() {
  for (int i = 0; i < 4; i++) {
    currentPressure_gage[i] = p[i] - p_start[i];
  }
  manifoldPressure_gage = p[PUMP_SENSOR] - p_start[PUMP_SENSOR];
}