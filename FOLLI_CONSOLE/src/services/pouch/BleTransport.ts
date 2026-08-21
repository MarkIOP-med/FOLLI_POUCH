/**
 * BLE line transport backed by react-native-ble-plx.
 *
 * Dumb pipe by design: text lines out through the command characteristic,
 * notify payloads in as text lines. Protocol knowledge lives one layer up.
 * Requires a native build (expo-dev-client / prebuild) — not Expo Go or web;
 * the factory selects MockTransport there instead.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device, Subscription, State } from 'react-native-ble-plx';

import { base64ToBytes, bytesToBase64 } from '../ble/codec';
import { BLE } from './protocol';
import type {
  ConnectionListener,
  ConnectionState,
  LineListener,
  PouchTransport,
} from './types';

const SCAN_TIMEOUT_MS = 15000;

const utf8Encode = (text: string): number[] =>
  Array.from(text).map((ch) => ch.charCodeAt(0) & 0xff);

const utf8Decode = (bytes: number[]): string =>
  bytes.map((b) => String.fromCharCode(b)).join('');

export class BleTransport implements PouchTransport {
  private manager = new BleManager();
  private device: Device | null = null;
  private telemetrySub: Subscription | null = null;
  private disconnectSub: Subscription | null = null;
  private state: ConnectionState = 'idle';
  private lineListeners = new Set<LineListener>();
  private connectionListeners = new Set<ConnectionListener>();

  async connect(): Promise<void> {
    // Android 12+ requires BLUETOOTH_SCAN / BLUETOOTH_CONNECT before any scan;
    // older Androids need fine location. Without this the scan silently fails.
    await this.ensureAndroidPermissions();
    this.setState('scanning');
    await this.waitForPoweredOn();

    const found = await this.scanForPouch();
    this.setState('connecting');

    const connected = await found.connect();
    await connected.discoverAllServicesAndCharacteristics();

    // The enriched telemetry line (~55 bytes) and long commands exceed the
    // default 20-byte ATT MTU — negotiate before subscribing, or notifies
    // arrive truncated (there is no long-notify reassembly in BLE).
    try {
      await connected.requestMTU(BLE.minMtu);
    } catch {
      // Some stacks refuse; write-with-response still reassembles long WRITES,
      // and the firmware's telemetry line fits most default-negotiated MTUs on
      // Android (185+). Truncated frames are dropped upstream as invalid.
    }

    this.device = connected;
    this.disconnectSub = connected.onDisconnected(() => {
      this.cleanupSubscriptions();
      this.device = null;
      this.setState('disconnected');
    });

    this.subscribeNotifications(connected);
    this.setState('connected');
  }

  async disconnect(): Promise<void> {
    this.cleanupSubscriptions();
    if (this.device) {
      try {
        await this.device.cancelConnection();
      } catch {
        // already gone
      }
      this.device = null;
    }
    this.setState('disconnected');
  }

  async sendLine(line: string): Promise<void> {
    if (!this.device) throw new Error('FOLLI pouch is not connected');
    // With-response: the stack's long-write path reassembles commands longer
    // than one ATT packet, and a failed write rejects instead of vanishing.
    await this.device.writeCharacteristicWithResponseForService(
      BLE.serviceUuid,
      BLE.commandCharUuid,
      bytesToBase64(utf8Encode(line)),
    );
  }

  onLine(listener: LineListener): () => void {
    this.lineListeners.add(listener);
    return () => this.lineListeners.delete(listener);
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

  private subscribeNotifications(device: Device): void {
    this.telemetrySub = device.monitorCharacteristicForService(
      BLE.serviceUuid,
      BLE.telemetryCharUuid,
      (error, characteristic) => {
        if (error || !characteristic?.value) return;
        // One notify = one line (the firmware sets the full value per notify).
        const line = utf8Decode(base64ToBytes(characteristic.value)).trim();
        if (line.length === 0) return;
        this.lineListeners.forEach((l) => l(line));
      },
    );
  }

  private scanForPouch(): Promise<Device> {
    return new Promise<Device>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.manager.stopDeviceScan();
        this.setState('error');
        reject(new Error('Timed out scanning for FOLLI pouch'));
      }, SCAN_TIMEOUT_MS);

      this.manager.startDeviceScan([BLE.serviceUuid], null, (error, device) => {
        if (error) {
          clearTimeout(timeout);
          this.manager.stopDeviceScan();
          this.setState('error');
          reject(error);
          return;
        }
        if (
          device &&
          (device.name === BLE.advertisedName ||
            device.serviceUUIDs?.includes(BLE.serviceUuid))
        ) {
          clearTimeout(timeout);
          this.manager.stopDeviceScan();
          resolve(device);
        }
      });
    });
  }

  private async ensureAndroidPermissions(): Promise<void> {
    if (Platform.OS !== 'android') return;
    const apiLevel =
      typeof Platform.Version === 'number'
        ? Platform.Version
        : parseInt(String(Platform.Version), 10);

    if (apiLevel >= 31) {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      const denied = Object.values(result).some(
        (status) => status !== PermissionsAndroid.RESULTS.GRANTED,
      );
      if (denied) {
        this.setState('error');
        throw new Error('Bluetooth permissions were denied');
      }
    } else {
      const status = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      if (status !== PermissionsAndroid.RESULTS.GRANTED) {
        this.setState('error');
        throw new Error('Location permission (required for BLE scan) was denied');
      }
    }
  }

  private waitForPoweredOn(): Promise<void> {
    return new Promise<void>((resolve) => {
      const sub = this.manager.onStateChange((state) => {
        if (state === State.PoweredOn) {
          sub.remove();
          resolve();
        }
      }, true);
    });
  }

  private cleanupSubscriptions(): void {
    this.telemetrySub?.remove();
    this.telemetrySub = null;
    this.disconnectSub?.remove();
    this.disconnectSub = null;
  }

  private setState(next: ConnectionState): void {
    this.state = next;
    this.connectionListeners.forEach((l) => l(next));
  }
}
