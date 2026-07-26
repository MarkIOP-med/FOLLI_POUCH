import {
  PouchCommand,
  PouchTelemetry,
  EMPTY_TELEMETRY,
  clampPressure,
} from '../../models/telemetry';
import {
  FolliBleClient,
  ConnectionState,
  TelemetryListener,
  ConnectionListener,
} from './types';

// In-memory simulation of the ESP32 pouch. Used when no native BLE module is
// available (Expo Go / web / unit tests) so the whole UI stays interactive and
// "alive" without hardware. It mirrors the 250ms notify cadence from the spec.
export class MockBleClient implements FolliBleClient {
  private state: ConnectionState = 'idle';
  private telemetry: PouchTelemetry = { ...EMPTY_TELEMETRY, batteryPercentage: 80 };
  private lastCommand: PouchCommand | null = null;
  private telemetryListeners = new Set<TelemetryListener>();
  private connectionListeners = new Set<ConnectionListener>();
  private timer: ReturnType<typeof setInterval> | null = null;

  async connect(): Promise<void> {
    this.setState('connecting');
    this.setState('connected');
    this.startStream();
  }

  async disconnect(): Promise<void> {
    this.stopStream();
    this.setState('disconnected');
  }

  async sendCommand(command: PouchCommand): Promise<void> {
    this.lastCommand = command;
  }

  async sendEmergencyStop(): Promise<void> {
    this.lastCommand = null;
    this.telemetry = { ...this.telemetry, foreheadPressure: 0 };
    this.emitTelemetry();
  }

  onTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    return () => this.telemetryListeners.delete(listener);
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.state);
    return () => this.connectionListeners.delete(listener);
  }

  getState(): ConnectionState {
    return this.state;
  }

  // --- internals ---
  private setState(next: ConnectionState) {
    this.state = next;
    this.connectionListeners.forEach((l) => l(next));
  }

  private startStream() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      // Slowly walk the forehead pressure toward the last commanded target and
      // add a small +/-1 mmHg flutter so the readout looks live.
      const target = this.lastCommand ? clampPressure(this.lastCommand.targetPressure) : 0;
      let p = this.telemetry.foreheadPressure;
      if (p < target) p += 1;
      else if (p > target) p -= 1;
      const flutter = Math.floor(Math.random() * 3) - 1;
      this.telemetry = {
        ...this.telemetry,
        foreheadPressure: Math.max(0, p + flutter),
      };
      this.emitTelemetry();
    }, 250);
  }

  private stopStream() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private emitTelemetry() {
    this.telemetryListeners.forEach((l) => l(this.telemetry));
  }
}
