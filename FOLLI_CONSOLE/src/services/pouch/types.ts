/**
 * The two-layer pouch contract.
 *
 * PouchTransport is a dumb line pipe: it moves newline-less text lines to and
 * from the board and reports link state. It never knows what a command means —
 * the same discipline as the backend's Link class, so a WiFi transport later is
 * one new implementation, nothing else moves.
 *
 * PouchClient is the semantic layer the view model talks to: typed commands in,
 * decoded telemetry/responses out. It is transport-agnostic by construction —
 * it receives its transport via the factory (dependency injection), which is
 * also how the tests drive it without any BLE present.
 */
import type { BleTelemetry, DeviceUser, Zone } from './protocol';

export type ConnectionState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export type LineListener = (line: string) => void;
export type ConnectionListener = (state: ConnectionState) => void;
export type TelemetryListener = (telemetry: BleTelemetry) => void;
export type ResponseListener = (tag: 'OK' | 'ERR' | 'R', payload: string) => void;

export interface PouchTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Ship one command line (no trailing newline) to the board. */
  sendLine(line: string): Promise<void>;
  /** Every line the board notifies, verbatim. */
  onLine(listener: LineListener): () => void;
  onConnectionChange(listener: ConnectionListener): () => void;
  getState(): ConnectionState;
}

export interface PouchClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  start(): Promise<void>;
  stop(): Promise<void>;
  /** Set one zone's live target without touching the others. */
  setZonePressure(zone: Zone, mmhg: number): Promise<void>;
  /** One-shot vibration for one zone; other zones keep running (-1 semantics). */
  vibrateZone(zone: Zone, level: number): Promise<void>;
  /** Ask the board for its checked-out user; answer arrives via onUser. */
  requestUser(): Promise<void>;

  onTelemetry(listener: TelemetryListener): () => void;
  onUser(listener: (user: DeviceUser) => void): () => void;
  onResponse(listener: ResponseListener): () => void;
  onConnectionChange(listener: ConnectionListener): () => void;
  getState(): ConnectionState;
}

export type TransportKind = 'ble' | 'mock';
