#include "config.h"
#include <NimBLEDevice.h>

// BLE GATT server. The command channel speaks the SAME text grammar as serial (see
// commandParser.ino) — no more fixed 4-byte binary opcode packets. The telemetry
// characteristic now carries text too: a light periodic "T:..." line, plus on-demand
// "R:"/"OK:"/"ERR:" responses pushed the moment a BLE-originated command is dispatched
// (see sendResponse() in commandQueue.ino). This retires the old fixed 6-byte binary
// telemetry format and the BLE_MODE_* opcode protocol from
// FOLLI_CONSOLE/FOLLI_COMSOLE_OVERVIEW.md; that doc needs updating to match once
// CONSOLE-side implementation starts (see POUCH_ESP.md).

#define SERVICE_UUID         "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHAR_COMMAND_UUID    "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define CHAR_TELEMETRY_UUID  "d68a2a54-7f15-4ba5-bc44-59368d400d3b"

static NimBLECharacteristic* telemetryChar   = nullptr;
static unsigned long         lastTelemetryMs = 0;

// This callback only ever hands the raw text to the shared parser and returns — it
// never mutates control state directly. It runs in NimBLE's own FreeRTOS task, not on
// loop()'s, so direct mutation here would race the control loop; see config.h's
// "COMMAND QUEUE" section for why.
//
// Longer commands (e.g. setuserdefaultpressure:25,120,85,130, ~38 bytes) exceed the
// default ~20-byte BLE MTU. The client must either negotiate a larger MTU (NimBLE
// supports it, typically up to ~247 bytes) or use Write-With-Response so the BLE
// stack's long-write/queued-write mechanism reassembles it — Write-Without-Response is
// capped at one ATT-MTU-sized packet. Flagging for whoever implements CONSOLE.
class CommandCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo& connInfo) override {
    std::string v = c->getValue();
    if (v.length() == 0) return;
    parseCommandString(String(v.c_str()), SRC_BLE);
  }
};

void initBLE() {
  NimBLEDevice::init("FOLLISAVE-POUCH");

  NimBLEServer*  server  = NimBLEDevice::createServer();
  NimBLEService* service = server->createService(SERVICE_UUID);

  NimBLECharacteristic* cmdChar = service->createCharacteristic(
    CHAR_COMMAND_UUID,
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
  );
  cmdChar->setCallbacks(new CommandCallbacks());

  telemetryChar = service->createCharacteristic(
    CHAR_TELEMETRY_UUID,
    NIMBLE_PROPERTY::NOTIFY
  );

  server->start();  // NimBLE-Arduino 2.x: starts the server and all its services;
                     // NimBLEService::start() is a deprecated no-op now

  NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->start();

  Serial.println("BLE GATT server started — advertising as FOLLISAVE-POUCH");
}

// Pushes one text line to the telemetry characteristic right now, outside the periodic
// timer below — used for READ responses and command acks so a BLE caller sees them.
// NOTE: like writes, notify payloads are MTU-bound — a long line (e.g. from READ ALL)
// can be silently truncated by the BLE stack if the client hasn't negotiated a larger
// MTU. There's no long-notify reassembly mechanism the way there is for long writes.
void sendBLEResponse(const String& line) {
  if (telemetryChar == nullptr) return;
  telemetryChar->setValue((uint8_t*)line.c_str(), line.length());
  telemetryChar->notify();
}

// Periodic, unprompted, deliberately light — full detail is available on demand via
// the READ commands instead of paying for it every TELEMETRY_INTERVAL_MS.
void updateBLE() {
  if (millis() - lastTelemetryMs < TELEMETRY_INTERVAL_MS) return;
  lastTelemetryMs = millis();

  String line = "T:";
  for (int i = 0; i < 4; i++) {
    line += (int)constrain((int)actualPressure[i], 0, 255);  // FRONT, TEMPLE, EAR, BACK
    line += ",";
  }
  line += "0,";  // battery SoC — not measured on this hardware yet
  line += "0";   // system error flag — no leak/over-temp detection wired up yet

  if (telemetryChar == nullptr) return;
  telemetryChar->setValue((uint8_t*)line.c_str(), line.length());
  telemetryChar->notify();
}
