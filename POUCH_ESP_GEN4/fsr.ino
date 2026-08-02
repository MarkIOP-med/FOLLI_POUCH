#include "config.h"

void initFSR() {
  pinMode(MCP3008_CS, OUTPUT);
  digitalWrite(MCP3008_CS, HIGH);
  SPI.begin();
}

void readFSR() {
  for (uint8_t ch = 0; ch < NUM_FSR; ch++) {
    digitalWrite(MCP3008_CS, LOW);
    SPI.transfer(0x01);
    uint8_t highByte = SPI.transfer(0x80 | (ch << 4));
    uint8_t lowByte  = SPI.transfer(0x00);
    digitalWrite(MCP3008_CS, HIGH);
    fsrData[ch] = ((highByte & 0x03) << 8) | lowByte;
  }
}
