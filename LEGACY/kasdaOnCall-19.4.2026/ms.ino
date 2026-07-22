/*******************************************************************/

void init_sensors() {
  pinMode(sen0, OUTPUT);
  pinMode(sen1, OUTPUT);
  pinMode(sen2, OUTPUT);
  pinMode(sen3, OUTPUT);
  pinMode(sen4, OUTPUT);  //pinMode(sen5, OUTPUT); pinMode(sen6, OUTPUT); pinMode(sen7, OUTPUT);
  digitalWrite(sen0, LOW);
  digitalWrite(sen1, LOW);
  digitalWrite(sen2, LOW);
  digitalWrite(sen3, LOW);
  digitalWrite(sen4, LOW);  //digitalWrite(sen5, LOW); digitalWrite(sen6, LOW); digitalWrite(sen7, LOW);
}
/*******************************************************************/
// In order to reset MS5806 pressure sensor,byte(0x1E) should be send to it
void PressureSensorResetAll() {
  int i;
  for (i = 0; i < num_of_sensors; i++)
    PressureSensorReset(i);
}

void PressureSensorReset(int ddd) {
  select_sensor(ddd);
  //Reset I2C device
  Wire.beginTransmission(Device_Address);  // transmit to device #0x77, 0x76
  // device address is specified in datasheet
  Wire.write(byte(0x1E));  // Reset
  Wire.endTransmission();  // stop transmitting
  delay(10);               //In mSec
}
void GetMS5806CoeffsAll() {
  int i;
  for (i = 0; i < num_of_sensors; i++)
    GetMS5806Coeffs(i);
}
void GetMS5806Coeffs(int ddd) {
  int i;
  select_sensor(ddd);
  for (i = 0; i < 6; i++)
    cof_arr[ddd][i] = getCOEF(Device_Address, cof_control[i]);
}
/*******************************************************************/
/*******************************************************************/
void ConvertRawToMMHgAndCelsius() {
  int i;
  for (i = 0; i < num_of_sensors; i++) {

    tt[i] = TempRawConvertToCelsius(i);
    p[i] = PressureRawConvertToMMHg(i);
  }
}
/*******************************************************************/
void PressureSensorsRead() {
  int i;
  //t = millis();
  for (i = 0; i < num_of_sensors; i++) {

    Press_raw[i] = pressure_ms5806(i);
  }
}
/*******************************************************************/
void PressureSensorsRead_withTemperature() {
  int i;
  delay(20);
  //t = millis();
  for (i = 0; i < num_of_sensors; i++) {
PressureSensorReset(i);
delay(20);
    Temp_raw[i] = temp_ms5806(i);
    Press_raw[i] = pressure_ms5806(i);
  }
}
/*******************************************************************/
long pressure_ms5806(int ddd) {
  long pres = 0;
  select_sensor(ddd);
  //D1 - Pressure
  Wire.beginTransmission(Device_Address);  // transmit to device #0x77
  Wire.write(byte(0x40));                  // Pressure conversion, OSR=256
  Wire.endTransmission();                  // stop transmitting
  //delay(2); //In mSec
  delayMicroseconds(400);
  ReadADC(ddd);
  while (Wire.available())  // Slave may send less than requested
  {
    pres = pres * 256 + Wire.read();  // Receive and calculate the pressure raw data
  }
  //  if (pres == 0) led("sen", "RED");
  return pres;
}
/*******************************************************************/
long temp_ms5806(int ddd) {
  long temp = 0;
  select_sensor(ddd);
  //D2 - Temp
  Wire.beginTransmission(Device_Address);  // transmit to device #0x77
  Wire.write(byte(0x50));                  // Temp conversion, OSR=256
  Wire.endTransmission();                  // stop transmitting
  //delay(2); //In mSec
  delayMicroseconds(400);
  ReadADC(ddd);
  while (Wire.available())  // slave may send less than requested
  {
    temp = temp * 256 + Wire.read();  // Receive and calculate the temperature raw data
  }
  // if (temp == 0) led("sen", "RED");
  return temp;
}
/*******************************************************************/
void ReadADC(int ddd) {
  select_sensor(ddd);

  Wire.beginTransmission(Device_Address);  // transmit to device #0x77
  Wire.write(byte(0x00));                  // Read ADC
  Wire.endTransmission();                  // stop transmitting
  Wire.requestFrom(Device_Address, 3);     // Request for ADC 3 bytes
}
/*******************************************************************/
unsigned int getCOEF(byte devAddr, byte coefAddr) {
  byte getI2CByte_MSB;
  byte getI2CByte_LSB;
  unsigned int returnValue;
  Wire.beginTransmission(devAddr);  // transmit to device #0x77
  // device address is specified in datasheet
  Wire.write(byte(coefAddr));  //GET COEF 01
  Wire.endTransmission();      // stop transmitting
  Wire.requestFrom(devAddr, 2);
  getI2CByte_MSB = Wire.read();
  getI2CByte_LSB = Wire.read();
  returnValue = getI2CByte_MSB * 256 + getI2CByte_LSB;
  return returnValue;
  // if (returnValue == 0)led("sen", "RED");
}
/*******************************************************************/
float TempRawConvertToCelsius(int ddd) {
  unsigned long raw = Temp_raw[ddd];
  double ttt, temp;
  float real_ttt;
  // calc dT=D2-Tref=D2-C5*2^8
  temp = cof_arr[ddd][4];  //Tref1;
  temp = temp * 256;
  dT[ddd] = raw;
  dT[ddd] = dT[ddd] - temp;
  // calc TEMP=2000+dT*C6/2^23
  ttt = dT[ddd] * cof_arr[ddd][5];
  ttt = ttt / 8388608;
  ttt = ttt + 2000;
  real_ttt = ttt;
  real_ttt = real_ttt / 100;
  //Serial.print("temp= "); Serial.println(real_ttt);
  return real_ttt;
}

/*******************************************************************/
float PressureRawConvertToMMHg(int ddd) {
  long raw = Press_raw[ddd];
  double ttt, off, sens;
  float real_ttt;
  // calc OFF=Offt1+TCO*dT=C2*2^17+(C4*dT)/2^6
  off = cof_arr[ddd][3] * dT[ddd];  //TCO * dT;
  off = off / 64;
  ttt = cof_arr[ddd][1];  //OFF;
  ttt = ttt * 65536;
  ttt = ttt * 2;
  off = off + ttt;
  //calc SENS=SENSt1+TCS*dT=C1*2^16+(C3*dT)/2^7
  sens = cof_arr[ddd][0] * 65536;   //SENS * 65536;
  ttt = cof_arr[ddd][2] * dT[ddd];  ///TCS1 * dT1;
  ttt = ttt / 128;
  sens = sens + ttt;
  //calc P=D1*SENS-OFF=(D1*SENS/2^21-OFF)/2^15
  ttt = raw;
  ttt = ttt * sens;
  ttt = ttt / 2097152;
  ttt = ttt - off;
  ttt = ttt / 32768;
  real_ttt = ttt;
  real_ttt = real_ttt / 100;
  real_ttt = real_ttt * 0.75;
  //Serial.print("P= "); Serial.println(real_ttt);
  return real_ttt;
}
/*******************************************************************/

void select_sensor(int ddd) {
  switch (ddd) {
    case 0:
      digitalWrite(sen0, HIGH);
      digitalWrite(sen1, LOW);
      digitalWrite(sen2, LOW);
      digitalWrite(sen3, LOW);
      digitalWrite(sen4, LOW);  //digitalWrite(sen5, LOW); digitalWrite(sen6, LOW); digitalWrite(sen7, LOW);
      break;
    case 1:
      digitalWrite(sen0, LOW);
      digitalWrite(sen1, HIGH);
      digitalWrite(sen2, LOW);
      digitalWrite(sen3, LOW);
      digitalWrite(sen4, LOW);  // digitalWrite(sen5, LOW); digitalWrite(sen6, LOW); digitalWrite(sen7, LOW);
      break;
    case 2:
      digitalWrite(sen0, LOW);
      digitalWrite(sen1, LOW);
      digitalWrite(sen2, HIGH);
      digitalWrite(sen3, LOW);
      digitalWrite(sen4, LOW);  // digitalWrite(sen5, LOW); digitalWrite(sen6, LOW); digitalWrite(sen7, LOW);
      break;
    case 3:
      digitalWrite(sen0, LOW);
      digitalWrite(sen1, LOW);
      digitalWrite(sen2, LOW);
      digitalWrite(sen3, HIGH);
      digitalWrite(sen4, LOW);  // digitalWrite(sen5, LOW); digitalWrite(sen6, LOW); digitalWrite(sen7, LOW);
      break;
    case 4:
      digitalWrite(sen0, LOW);
      digitalWrite(sen1, LOW);
      digitalWrite(sen2, LOW);
      digitalWrite(sen3, LOW);
      digitalWrite(sen4, HIGH);  // digitalWrite(sen5, LOW); digitalWrite(sen6, LOW); digitalWrite(sen7, LOW);
      break;
  }
}
