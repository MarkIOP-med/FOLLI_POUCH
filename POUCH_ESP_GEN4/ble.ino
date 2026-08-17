#include "config.h"
#include <NimBLEDevice.h>

// BLE GATT server implementing FOLLI_CONSOLE/FOLLI_COMSOLE_OVERVIEW.md.
// V-Node byte is mapped positionally onto our 4 real V_NODEs (FRONT, TEMPLE,
// EAR, BACK) — the doc's "Left Temple/Right Temple" labels predate the EAR
// pad and are stale text, not a different hardware layout.

#define SERVICE_UUID         "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHAR_COMMAND_UUID    "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define CHAR_TELEMETRY_UUID  "d68a2a54-7f15-4ba5-bc44-59368d400d3b"

// TELEMETRY_INTERVAL_MS now lives in config.h alongside the other tuning constants.

// Byte 3 (Operation Mode Trigger). 0x00-0x02 are from FOLLI_COMSOLE_OVERVIEW.md.
// 0x03+ are firmware extensions replacing the old physical-keyboard system
// commands (RESTORE / RESET / device ON-OFF) that the documented protocol
// has no opcode for — see that doc's Section 3 for the mirrored list.
#define BLE_MODE_EMERGENCY    0x00   // vent all PADs + stop all vibration
#define BLE_MODE_STATIC_HOLD  0x01   // apply Byte1 (pressure) + Byte2 (vibration) to Byte0's V-Node
#define BLE_MODE_DYNAMIC      0x02   // burst/pulse mode — not implemented, no pulse control loop exists yet
#define BLE_MODE_RESTORE      0x03   // recall last-set (saved) pressures, all V_NODEs
#define BLE_MODE_RESET        0x04   // recall factory-default pressures, all V_NODEs
#define BLE_MODE_DEVICE_OFF   0x05   // vent + stop vibration + STOPPED (no further action until DEVICE_ON)
#define BLE_MODE_DEVICE_ON    0x06   // resume from DEVICE_OFF

static NimBLECharacteristic* telemetryChar   = nullptr;
static unsigned long         lastTelemetryMs = 0;

class CommandCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c) override {
    std::string v = c->getValue();
    if (v.length() < 4) return;

    uint8_t vNode     = (uint8_t)v[0];
    uint8_t pressure  = (uint8_t)v[1];
    uint8_t vibration = (uint8_t)v[2];
    uint8_t mode      = (uint8_t)v[3];
    int     node     = vNode - 1;   // 0x01..0x04 -> 0..3 (FRONT, TEMPLE, EAR, BACK)

    switch (mode) {
      case BLE_MODE_EMERGENCY:
        stopAllVibration();
        reliefAllPads();
        Serial.println("BLE → EMERGENCY SHUTOFF");
        return;

      case BLE_MODE_RESTORE:
        reliefAllPads();
        captureReferencePressure();
        for (int i = 0; i < 4; i++) targetPressure[i] = savedPressure[i];
        currentChannel = 0;
        resetChannelState();
        currentState = PRESSURIZING;
        Serial.println("BLE → RESTORE");
        return;

      case BLE_MODE_RESET:
        reliefAllPads();
        captureReferencePressure();
        for (int i = 0; i < 4; i++) {
          targetPressure[i] = defaultPressure[i];
          savedPressure[i]  = defaultPressure[i];
        }
        currentChannel = 0;
        resetChannelState();
        currentState = PRESSURIZING;
        Serial.println("BLE → RESET");
        return;

      case BLE_MODE_DEVICE_OFF:
        deviceOn = false;
        stopAllVibration();
        reliefAllPads();
        currentState = STOPPED;
        Serial.println("BLE → DEVICE OFF");
        return;

      case BLE_MODE_DEVICE_ON:
        deviceOn     = true;
        currentState = IDLE;
        Serial.println("BLE → DEVICE ON");
        return;

      case BLE_MODE_DYNAMIC:
        Serial.println("BLE → dynamic/pulse mode requested but not implemented — ignored");
        return;
    }

    // BLE_MODE_STATIC_HOLD (or any other value) — normal per-node absolute set.
    if (node < 0 || node > 3) return;

    targetPressure[node]  = pressure;
    savedPressure[node]   = pressure;
    vibrationLevel[node]  = constrain((int)vibration, 0, 3);
    if (vibrationLevel[node] > 0) vibStartTime[node] = millis();

    currentChannel = 0;
    resetChannelState();
    currentState = PRESSURIZING;
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

  service->start();

  NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->start();

  Serial.println("BLE GATT server started — advertising as FOLLISAVE-POUCH");
}

void updateBLE() {
  if (millis() - lastTelemetryMs < TELEMETRY_INTERVAL_MS) return;
  lastTelemetryMs = millis();

  uint8_t payload[6];
  for (int i = 0; i < 4; i++) {
    payload[i] = (uint8_t)constrain((int)currentPressure_gage[i], 0, 255);  // FRONT, TEMPLE, EAR, BACK
  }
  payload[4] = 0;  // battery SoC — not measured on this hardware yet
  payload[5] = 0;  // system error flag — no leak/over-temp detection wired up yet

  telemetryChar->setValue(payload, 6);
  telemetryChar->notify();
}
