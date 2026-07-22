int openValveTime = 5, defPressure, pumpDelayTime = 10, pumpDelayTimeHigh = 50, maxDeffPressure = 3;
void reliefAllPstart() {
  digitalWrite(valvePins[valveRelief], HIGH);  //Relief valve
  digitalWrite(valvePins[0], HIGH);
  digitalWrite(valvePins[1], HIGH);
  digitalWrite(valvePins[2], HIGH);
  digitalWrite(valvePins[3], HIGH);
  delay(1000);
  //Serial.println("\n\n stage 22  \n");
  line_to_pc();
  delay(150);
  digitalWrite(valvePins[valveRelief], LOW);
  digitalWrite(valvePins[0], LOW);
  digitalWrite(valvePins[1], LOW);
  digitalWrite(valvePins[2], LOW);
  digitalWrite(valvePins[3], LOW);
  delay(150);
}
void relief() {
  digitalWrite(valvePins[valveRelief], HIGH);  //Relief valve
  delay(2000);
  digitalWrite(valvePins[valveRelief], LOW);
  delay(150);
}
void updatePressure(int cell, int newPressure) {
  pumping = 1;
  draining=1;
  digitalWrite(valvePins[valveRelief], LOW);
  digitalWrite(valvePins[cell], LOW);
  delay(200);
  if (newPressure > cellTargetPressure[cell]) {
    PressureSensorsRead_withTemperature();
    ConvertRawToMMHgAndCelsius();
    printStatus(cell);
    delay(50);
    while (newPressure > (p[pumpSensor] - p_start[pumpSensor] + 1)) {
      checkSerial();
      if(draining==0){
       digitalWrite(valvePins[pumpPin], LOW);
       openValvesAll();delay(1000);
       closeValvesAll();
        Serial.println("\nDraining by user\n");
        return;
       }
      if (pumping == 0) {
        digitalWrite(valvePins[cell], LOW);
        digitalWrite(valvePins[pumpPin], LOW);
        delay(100);
        digitalWrite(valvePins[valveRelief], HIGH);  //Relief valve
        delay(1000);
        digitalWrite(valvePins[valveRelief], LOW);
        Serial.println("\nStop by user\n");
        return;
      }
      printStatus(cell);
      digitalWrite(valvePins[pumpPin], HIGH);
      //if ((newPressure - p[pumpSensor] - p_start[pumpSensor]) > 20)
      if (newPressure > (p[pumpSensor] - p_start[pumpSensor] + 2)) delay(pumpDelayTimeHigh);
      else delay(pumpDelayTime);
      digitalWrite(valvePins[pumpPin], LOW);
      delay(100);
      PressureSensorsRead_withTemperature();
      ConvertRawToMMHgAndCelsius();
      delay(50);
      checkSerial();
    }
    printStatus(cell);
    Serial.println("\n\n stage 1  \n");
    digitalWrite(valvePins[cell], HIGH);
    delay(100);
    while (newPressure > p[cell] - p_start[cell] + 1) {
      checkSerial();
      if(draining==0){
       digitalWrite(valvePins[pumpPin], LOW);
       openValvesAll();delay(1000);
       closeValvesAll();
        Serial.println("\nDraining by user\n");
        return;
       }
      if (pumping == 0) {
        digitalWrite(valvePins[cell], LOW);
        digitalWrite(valvePins[pumpPin], LOW);
        delay(100);
        digitalWrite(valvePins[valveRelief], HIGH);  //Relief valve
        delay(1000);
        digitalWrite(valvePins[valveRelief], LOW);
        Serial.println("\nStop by user\n");
        return;
      }
      digitalWrite(valvePins[pumpPin], HIGH);
      if (newPressure > (p[cell] - p_start[cell] + 2)) delay(pumpDelayTimeHigh);
      else delay(pumpDelayTime);
      digitalWrite(valvePins[pumpPin], LOW);
      delay(100);
      PressureSensorsRead_withTemperature();
      ConvertRawToMMHgAndCelsius();
      printStatus(cell);
      checkSerial();
    }
    delay(100);
    digitalWrite(valvePins[cell], LOW);
    digitalWrite(valvePins[pumpPin], LOW);
    cellTargetPressure[cell] = p[cell] - p_start[cell];
  } else if (newPressure < cellTargetPressure[cell]) {
    //relief();
    Serial.println("\n\n in lessss  \n");
    digitalWrite(valvePins[valveRelief], LOW);
    delay(200);
    digitalWrite(valvePins[cell], HIGH);
    delay(50);
    PressureSensorsRead_withTemperature();
    ConvertRawToMMHgAndCelsius();
    printStatus(cell);
    while (newPressure < (p[cell] - p_start[cell]) - 1) {
      checkSerial();
      if(draining==0){
       digitalWrite(valvePins[pumpPin], LOW);
       openValvesAll();
       delay(1000);
       closeValvesAll();
        Serial.println("\nDraining by user\n");
        return;
       }
      if (pumping == 0) {
        digitalWrite(valvePins[cell], LOW);
        digitalWrite(valvePins[pumpPin], LOW);
        delay(100);
        digitalWrite(valvePins[valveRelief], HIGH);  //Relief valve
        delay(1000);
        digitalWrite(valvePins[valveRelief], LOW);
        Serial.println("\nStop by user\n");
        return;
      }
      digitalWrite(valvePins[valveRelief], HIGH);
      delay(openValveTime);
      digitalWrite(valvePins[valveRelief], LOW);
      delay(50);
      PressureSensorsRead_withTemperature();
      ConvertRawToMMHgAndCelsius();
      printStatus(cell);
      checkSerial();
    }
    digitalWrite(valvePins[cell], LOW);
    digitalWrite(valvePins[valveRelief], LOW);

    cellTargetPressure[cell] = p[cell] - p_start[cell];
  }
  cellTargetPressure[cell] = p[cell] - p_start[cell];
  digitalWrite(valvePins[cell], LOW);
  Serial.println("done");
  pumping = 0;
  draining=0;
}
void openValvesAll() {
  for (int i = 0; i < 4; i++) digitalWrite(valvePins[i], HIGH);
  digitalWrite(valvePins[valveRelief], HIGH);
}
void closeValvesAll() {
  for (int i = 0; i < 4; i++) digitalWrite(valvePins[i], LOW);
  digitalWrite(valvePins[valveRelief], LOW);
}
////////////////////////////////////////////////
