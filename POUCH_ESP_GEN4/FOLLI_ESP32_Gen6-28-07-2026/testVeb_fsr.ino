#include "config.h"
void initFSR() {
  pinMode(MCP3008_CS, OUTPUT);
  digitalWrite(MCP3008_CS, HIGH);
  SPI.begin();
}
void readFSR()
{
    for (uint8_t ch = 0; ch < 8; ch++)
    {
        digitalWrite(MCP3008_CS, LOW);
        SPI.transfer(0x01);
        uint8_t highByte = SPI.transfer(0x80 | (ch << 4));
        uint8_t lowByte  = SPI.transfer(0x00);
        digitalWrite(MCP3008_CS, HIGH);
        fsrData[ch] = ((highByte & 0x03) << 8) | lowByte;
    }
}
void printFSRdata()
{
    for (uint8_t i = 0; i < 8; i++)
    {
        Serial.print(fsrData[i]);
        Serial.print(i < 7 ? ", " : "\n");
    }
}
void testVeb() {
  for (int k = 0; k < 4; k++) {
    analogWrite(vibrationPins[k], 200);
    delay(3000);
    analogWrite(vibrationPins[k], 0);
  }
}
