/**
 * The semantic layer: typed commands over any PouchTransport.
 *
 * Owns exactly one concern — translating between the view model's vocabulary
 * (zones, mmHg, vibration levels) and protocol.ts wire lines. No BLE imports,
 * no React: the transport is injected, so this whole layer is unit-testable
 * with a fake pipe.
 */
import {
  Zone,
  VIB_LEAVE_UNCHANGED,
  decodeLine,
  decodeUserPayload,
  encodeRead,
  encodeSetPressure,
  encodeSetVibration,
  encodeStart,
  encodeStop,
} from './protocol';
import type { DeviceUser } from './protocol';
import type {
  ConnectionListener,
  ConnectionState,
  PouchClient,
  PouchTransport,
  ResponseListener,
  TelemetryListener,
} from './types';

export class FolliPouchClient implements PouchClient {
  private telemetryListeners = new Set<TelemetryListener>();
  private userListeners = new Set<(user: DeviceUser) => void>();
  private responseListeners = new Set<ResponseListener>();
  private unsubscribeLine: (() => void) | null = null;

  constructor(private readonly transport: PouchTransport) {}

  async connect(): Promise<void> {
    this.unsubscribeLine?.();
    this.unsubscribeLine = this.transport.onLine((line) => this.handleLine(line));
    await this.transport.connect();
    // The board's user record is the console's prescription source; ask once
    // per connection (the view model re-asks on session transitions).
    await this.requestUser().catch(() => undefined);
  }

  async disconnect(): Promise<void> {
    this.unsubscribeLine?.();
    this.unsubscribeLine = null;
    await this.transport.disconnect();
  }

  start = (): Promise<void> => this.transport.sendLine(encodeStart());
  stop = (): Promise<void> => this.transport.sendLine(encodeStop());

  setZonePressure(zone: Zone, mmhg: number): Promise<void> {
    return this.transport.sendLine(encodeSetPressure({ [zone]: mmhg }));
  }

  vibrateZone(zone: Zone, level: number): Promise<void> {
    const levels = [
      VIB_LEAVE_UNCHANGED,
      VIB_LEAVE_UNCHANGED,
      VIB_LEAVE_UNCHANGED,
      VIB_LEAVE_UNCHANGED,
    ];
    levels[
      (['FRONT', 'TEMPLE', 'EAR', 'BACK'] as Zone[]).indexOf(zone)
    ] = level;
    return this.transport.sendLine(encodeSetVibration(levels));
  }

  requestUser(): Promise<void> {
    return this.transport.sendLine(encodeRead('user'));
  }

  onTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    return () => this.telemetryListeners.delete(listener);
  }

  onUser(listener: (user: DeviceUser) => void): () => void {
    this.userListeners.add(listener);
    return () => this.userListeners.delete(listener);
  }

  onResponse(listener: ResponseListener): () => void {
    this.responseListeners.add(listener);
    return () => this.responseListeners.delete(listener);
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    return this.transport.onConnectionChange(listener);
  }

  getState(): ConnectionState {
    return this.transport.getState();
  }

  // --- internals ---

  private handleLine(line: string): void {
    const decoded = decodeLine(line);
    if (decoded.kind === 'telemetry') {
      this.telemetryListeners.forEach((l) => l(decoded.telemetry));
      return;
    }
    if (decoded.kind === 'response') {
      if (decoded.tag === 'R') {
        const user = decodeUserPayload(decoded.payload);
        if (user) this.userListeners.forEach((l) => l(user));
      }
      this.responseListeners.forEach((l) => l(decoded.tag, decoded.payload));
    }
    // invalid lines are dropped: a truncated notify is not worth surfacing,
    // the next frame arrives in 250ms.
  }
}
