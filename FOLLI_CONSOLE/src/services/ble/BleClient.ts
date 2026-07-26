import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device, Subscription, State } from 'react-native-ble-plx';
import { PouchCommand, decodeTelemetry, EMERGENCY_STOP_COMMAND } from '../../models/telemetry';
import { bytesToBase64, base64ToBytes } from './codec';
import {
  FOLLI_SERVICE_UUID,
  COMMAND_CHAR_UUID,
  TELEMETRY_CHAR_UUID,
  FOLLI_DEVICE_NAME,
} from './constants';
import {
  FolliBleClient,
  ConnectionState,
  TelemetryListener,
  ConnectionListener,
} from './types';
import { encodeCommand } from '../../models/telemetry';

// Real BLE client backed by react-native-ble-plx. Requires a native build
// (expo-dev-client / prebuild) — it will NOT run in Expo Go or on web.
export class BleClient implements FolliBleClient {
  private manager: BleManager;
  private device: Device | null = null;
  private telemetrySub: Subscription | null = null;
  private disconnectSub: Subscription | null = null;
  private state: ConnectionState = 'idle';
  private telemetryListeners = new Set<TelemetryListener>();
  private connectionListeners = new Set<ConnectionListener>();

  constructor() {
    this.manager = new BleManager();
  }

  async connect(): Promise<void> {
    // Android 12+ requires the BLUETOOTH_SCAN / BLUETOOTH_CONNECT runtime
    // permissions before any scan; older Androids need fine location instead.
    // Without this, startDeviceScan silently fails on a real phone.
    await this.ensureAndroidPermissions();

    this.setState('scanning');

    // Wait for the adapter to be powered on before scanning.
    await this.waitForPoweredOn();

    const device = await this.scanForPouch();
    this.setState('connecting');

    const connected = await device.connect();
    await connected.discoverAllServicesAndCharacteristics();
    this.device = connected;

    this.disconnectSub = connected.onDisconnected(() => {
      this.cleanupSubscriptions();
      this.device = null;
      this.setState('disconnected');
    });

    await this.subscribeTelemetry(connected);
    this.setState('connected');
  }

  async disconnect(): Promise<void> {
    this.cleanupSubscriptions();
    if (this.device) {
      try {
        await this.device.cancelConnection();
      } catch {
        // ignore — already gone
      }
      this.device = null;
    }
    this.setState('disconnected');
  }

  async sendCommand(command: PouchCommand): Promise<void> {
    await this.writeCommandBytes(encodeCommand(command));
  }

  async sendEmergencyStop(): Promise<void> {
    await this.writeCommandBytes(EMERGENCY_STOP_COMMAND);
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

  private async writeCommandBytes(bytes: number[]): Promise<void> {
    if (!this.device) throw new Error('FOLLI pouch is not connected');
    const payload = bytesToBase64(bytes);
    // Command characteristic is WRITE_NO_RESPONSE per the spec.
    await this.device.writeCharacteristicWithoutResponseForService(
      FOLLI_SERVICE_UUID,
      COMMAND_CHAR_UUID,
      payload,
    );
  }

  private async subscribeTelemetry(device: Device): Promise<void> {
    this.telemetrySub = device.monitorCharacteristicForService(
      FOLLI_SERVICE_UUID,
      TELEMETRY_CHAR_UUID,
      (error, characteristic) => {
        if (error || !characteristic?.value) return;
        const bytes = base64ToBytes(characteristic.value);
        const telemetry = decodeTelemetry(bytes);
        this.telemetryListeners.forEach((l) => l(telemetry));
      },
    );
  }

  private scanForPouch(): Promise<Device> {
    return new Promise<Device>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.manager.stopDeviceScan();
        this.setState('error');
        reject(new Error('Timed out scanning for FOLLI pouch'));
      }, 15000);

      this.manager.startDeviceScan([FOLLI_SERVICE_UUID], null, (error, device) => {
        if (error) {
          clearTimeout(timeout);
          this.manager.stopDeviceScan();
          this.setState('error');
          reject(error);
          return;
        }
        if (device && (device.name === FOLLI_DEVICE_NAME || device.serviceUUIDs?.includes(FOLLI_SERVICE_UUID))) {
          clearTimeout(timeout);
          this.manager.stopDeviceScan();
          resolve(device);
        }
      });
    });
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

  private cleanupSubscriptions() {
    this.telemetrySub?.remove();
    this.telemetrySub = null;
    this.disconnectSub?.remove();
    this.disconnectSub = null;
  }

  private setState(next: ConnectionState) {
    this.state = next;
    this.connectionListeners.forEach((l) => l(next));
  }
}
