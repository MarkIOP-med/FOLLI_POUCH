import { useCallback, useEffect, useState } from 'react';

import { api } from '@/api/client';
import type { DeviceSnapshot, SerialPort, Settings } from '@/api/types';
import type { NewDeviceDraft } from './Settings.types';

export const EMPTY_DEVICE_DRAFT: NewDeviceDraft = {
  id: '',
  label: '',
  transport: 'serial',
  port: '',
};

export function useSettingsScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [devices, setDevices] = useState<DeviceSnapshot[]>([]);
  const [ports, setPorts] = useState<SerialPort[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const refreshDevices = useCallback(async () => {
    try {
      const [nextDevices, nextPorts] = await Promise.all([
        api.devices(),
        api.serialPorts().catch(() => [] as SerialPort[]),
      ]);
      setDevices(nextDevices);
      setPorts(nextPorts);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    api.settings().then(setSettings).catch((e: Error) => setError(e.message));
    void refreshDevices();
  }, [refreshDevices]);

  const saveSettings = useCallback(async (next: Settings) => {
    try {
      setSettings(await api.saveSettings(next));
      setSaved(true);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const addDevice = useCallback(
    async (draft: NewDeviceDraft) => {
      try {
        await api.addDevice({
          id: draft.id.trim(),
          label: draft.label.trim(),
          transport: draft.transport,
          port: draft.transport === 'serial' ? draft.port || null : null,
        });
        await refreshDevices();
        setError(null);
        return true;
      } catch (err) {
        setError((err as Error).message);
        return false;
      }
    },
    [refreshDevices],
  );

  const removeDevice = useCallback(
    async (deviceId: string) => {
      try {
        await api.removeDevice(deviceId);
        await refreshDevices();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [refreshDevices],
  );

  return {
    settings,
    setSettings,
    devices,
    ports,
    error,
    saved,
    saveSettings,
    addDevice,
    removeDevice,
  };
}

export function formatPortList(ports: SerialPort[], emptyLabel: string): string {
  if (ports.length === 0) return emptyLabel;
  return ports.map((port) => `${port.port} (${port.description})`).join(', ');
}
