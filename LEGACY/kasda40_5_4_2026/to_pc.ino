
void clearSerialPort0() {
    while (Serial.available() > 0) {
        Serial.read();
    }
}

void printStatus(int cell) {
  Serial.print(p[cell]);
  Serial.print(" , ");
  Serial.print(cellTargetPressure[cell]);
  Serial.print(" , ");
  Serial.print(p[cell] - p_start[cell]);
  Serial.print(" , ");
  Serial.print(p[pumpSensor] - p_start[pumpSensor]);
  Serial.print(" , ");
  Serial.println(analogRead(fsrPins[cell]));
  Serial.println("-----");
}

void pStart(int cell) {
  digitalWrite(valvePins[pumpPin], LOW);
  delay(200);
  digitalWrite(valvePins[cell], HIGH);
  digitalWrite(valvePins[valveRelief], HIGH);  //Relief valve

  delay(3000);
  digitalWrite(valvePins[valveRelief], LOW);
  digitalWrite(valvePins[cell], LOW);
  delay(500);
  PressureSensorsRead_withTemperature();
  ConvertRawToMMHgAndCelsius();
  p_start[cell] = p[cell];
  //delay(500);
  
}

void line_to_pc_Pstart() {
  int i;
  Serial.println("");
  Serial.println("");
  PressureSensorsRead_withTemperature();
  ConvertRawToMMHgAndCelsius();

  for (i = 0; i < num_of_sensors; i++) {
    Serial.print((p[i]-p_start[i]), 1);
    Serial.print("  ,  ");
  }
  for (i = 0; i < num_of_sensors; i++) {

    Serial.print(tt[i], 1);
    Serial.print("  ,  ");
  }
  //for (i = 0; i < num_of_sensors; i++) p_start[i] = p[i];
  Serial.println("");
}


void line_to_pc() {
  int i;
  Serial.println("");
  Serial.println("");
  PressureSensorsRead_withTemperature();
  ConvertRawToMMHgAndCelsius();

  for (i = 0; i < num_of_sensors; i++) {
    Serial.print(p[i], 1);
    Serial.print("  ,  ");
  }
  for (i = 0; i < num_of_sensors; i++) {

    Serial.print(tt[i], 1);
    Serial.print("  ,  ");
  }
  for (i = 0; i < num_of_sensors; i++) p_start[i] = p[i];
  Serial.println("");
}
void write_coef() {  /// not if ms5849
  int i, j;
  unsigned char s;
  String StrToSerial;
  Serial.println(label_coef);
  for (i = 0; i < num_of_sensors; i++) {
    for (j = 0; j < 6; j++) {

      Serial.print(cof_arr[i][j]);
      Serial.print(",");
    }

    Serial.println("");
    delay(1000);
  }
}
void checkSerial(){
 String incoming; 

  if (Serial.available() > 0) {

    // Read the entire line until newline
    incoming = Serial.readStringUntil('\n');
    

    if (incoming.equalsIgnoreCase("r")) {
      reliefAllPstart();
      return;  // No need to continue parsing
    }

    incoming.trim(); // Clean whitespace and line endings

    // Find the comma location
    int commaIndex = incoming.indexOf(',');

    // If a comma exists, split into two values
    if (commaIndex > 0) {
      String firstNum  = incoming.substring(0, commaIndex);
      String secondNum = incoming.substring(commaIndex + 1);

      cellToChangeFromSerial = firstNum.toInt();
     newPressureFromSerial  = secondNum.toInt();

      // Print for debugging
      Serial.print("cellToChange = ");
      Serial.println(cellToChangeFromSerial);
      Serial.print("newPressure = ");
      Serial.println(newPressureFromSerial);
      updatePressure(cellToChangeFromSerial,newPressureFromSerial);
      //fillOneCellPressureIn(cellToChangeFromSerial,newPressureFromSerial);
    }
  }

}
