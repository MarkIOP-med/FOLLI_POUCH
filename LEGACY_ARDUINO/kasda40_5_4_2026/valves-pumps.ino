
void initValveCompressorVibration() {
  for (int i = 0; i < 9; i++) {
    pinMode(valvePins[i], OUTPUT);
    digitalWrite(valvePins[i], LOW);
  }
  for (int i = 0; i < 5; i++) {
    pinMode(compressorPins[i], OUTPUT);
    digitalWrite(compressorPins[i], LOW);
  }
  for (int i = 0; i < 8; i++) {
    pinMode(vibrationPins[i], OUTPUT);
    digitalWrite(vibrationPins[i], LOW);
  }
}
void readFsr() {
  Serial.println("");
  for (int i = 0; i < 8; i++) {
    fsrData[i] = analogRead(fsrPins[i]);
    Serial.print(fsrData[i]);
    Serial.print(" , ");
  }
  Serial.println("");
}
void vibration() {
  for (int i = 0; i < 8; i++) {
    analogWrite(vibrationPins[i], vibrationData[i]);
  }
}
