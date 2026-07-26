// BLE GATT identifiers, lifted verbatim from FOLLI_COMSOLE_OVERVIEW.md §3.

// FOLLI Custom Service.
export const FOLLI_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';

// Characteristic A: Command Channel (WRITE / WRITE_NO_RESPONSE, 4-byte payload).
export const COMMAND_CHAR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

// Characteristic B: Live Telemetry Channel (NOTIFY, 6-byte payload @ 250ms).
export const TELEMETRY_CHAR_UUID = 'd68a2a54-7f15-4ba5-bc44-59368d400d3b';

// Advertised device name the ESP32 firmware should use (adjust to match firmware).
export const FOLLI_DEVICE_NAME = 'FOLLI-POUCH';
