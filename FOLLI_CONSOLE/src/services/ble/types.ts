import { PouchCommand, PouchTelemetry } from '../../models/telemetry';

export type ConnectionState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export type TelemetryListener = (telemetry: PouchTelemetry) => void;
export type ConnectionListener = (state: ConnectionState) => void;

// The surface the UI/ViewModel depends on. Both the real ble-plx client and the
// in-memory mock implement this, so screens never import ble-plx directly and
// tests can inject a fake.
export interface FolliBleClient {
  // Begin scanning and connect to the first FOLLI pouch found.
  connect(): Promise<void>;
  // Cleanly disconnect and release resources.
  disconnect(): Promise<void>;
  // Write a 4-byte command to the command characteristic.
  sendCommand(command: PouchCommand): Promise<void>;
  // Send the hard emergency stop payload [0x00,0x00,0x00,0x00].
  sendEmergencyStop(): Promise<void>;
  // Subscribe to decoded 6-byte telemetry frames. Returns an unsubscribe fn.
  onTelemetry(listener: TelemetryListener): () => void;
  // Subscribe to connection-state changes. Returns an unsubscribe fn.
  onConnectionChange(listener: ConnectionListener): () => void;
  // Current connection state (synchronous read).
  getState(): ConnectionState;
}
