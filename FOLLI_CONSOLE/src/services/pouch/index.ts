/**
 * Explicit pouch-client factory.
 *
 * The transport is a stated decision, not an accident of which import happens
 * to throw (the old client fell back to a mock whenever require('./BleClient')
 * failed — indistinguishable from a packaging bug). Callers pass the kind they
 * mean; resolveDefaultTransport() centralizes the one platform rule.
 */
import { Platform } from 'react-native';

import { FolliPouchClient } from './PouchClient';
import type { PouchClient, PouchTransport, TransportKind } from './types';

export function resolveDefaultTransport(): TransportKind {
  // Web (and Expo Go, which has no native BLE module) can only simulate.
  return Platform.OS === 'web' ? 'mock' : 'ble';
}

export function createPouchClient(options?: {
  transport?: TransportKind;
}): PouchClient {
  const kind = options?.transport ?? resolveDefaultTransport();
  let transport: PouchTransport;
  if (kind === 'mock') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { MockTransport } = require('./MockTransport');
    transport = new MockTransport();
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BleTransport } = require('./BleTransport');
    transport = new BleTransport();
  }
  return new FolliPouchClient(transport);
}

export type {
  ConnectionListener,
  ConnectionState,
  LineListener,
  PouchClient,
  PouchTransport,
  ResponseListener,
  TelemetryListener,
  TransportKind,
} from './types';
export * from './protocol';
