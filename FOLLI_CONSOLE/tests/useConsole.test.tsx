import { act, renderHook } from '@testing-library/react-native';
import { useConsole } from '../src/viewmodels/useConsole';
import {
  FolliBleClient,
  ConnectionState,
  TelemetryListener,
  ConnectionListener,
} from '../src/services/ble';
import { PouchCommand } from '../src/models/telemetry';

// A fully controllable fake pouch so we can assert exactly what the ViewModel
// sends and feed telemetry/connection events into the hook.
function makeFakeClient() {
  let telemetryListener: TelemetryListener | null = null;
  let connectionListener: ConnectionListener | null = null;
  const client: FolliBleClient & {
    sendCommand: jest.Mock<Promise<void>, [PouchCommand]>;
    sendEmergencyStop: jest.Mock;
    emitTelemetry: TelemetryListener;
    emitConnection: ConnectionListener;
  } = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    sendCommand: jest.fn().mockResolvedValue(undefined),
    sendEmergencyStop: jest.fn().mockResolvedValue(undefined),
    onTelemetry: (l: TelemetryListener) => {
      telemetryListener = l;
      return () => {
        telemetryListener = null;
      };
    },
    onConnectionChange: (l: ConnectionListener) => {
      connectionListener = l;
      return () => {
        connectionListener = null;
      };
    },
    getState: () => 'connected' as ConnectionState,
    emitTelemetry: (t) => telemetryListener && telemetryListener(t),
    emitConnection: (s) => connectionListener && connectionListener(s),
  };
  return client;
}

describe('useConsole controls', () => {
  it('boots PENDING with the UI_01 control defaults and connects', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    expect(result.current.sessionState).toBe('pending');
    expect(result.current.isSessionActive).toBe(false);
    expect(result.current.elapsedSeconds).toBe(0);
    // Defaults mirror the mock: Temples selected at 25 mmHg / level 2.
    expect(result.current.activeZone).toBe(0x02);
    expect(result.current.targetPressure).toBe(25);
    expect(result.current.massageLevel).toBe(2);
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it('controls are adjustable while PENDING and each zone keeps its own settings', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    // Forehead has to be prescribed before it can be trimmed at all.
    act(() => result.current.applyPrescription({ 0x01: 10 }));
    act(() => result.current.setActiveZone(0x01));
    act(() => result.current.updateTargetPressure(10));
    act(() => result.current.setMassageLevel(1));
    expect(result.current.targetPressure).toBe(10);
    expect(result.current.massageLevel).toBe(1);

    // Temples still has its own values...
    act(() => result.current.setActiveZone(0x02));
    expect(result.current.targetPressure).toBe(25);
    expect(result.current.massageLevel).toBe(2);

    // ...and Forehead remembered what we set.
    act(() => result.current.setActiveZone(0x01));
    expect(result.current.targetPressure).toBe(10);
    expect(result.current.massageLevel).toBe(1);

    // Nothing was sent to the pouch — configuration only.
    expect(client.sendCommand).not.toHaveBeenCalled();
  });

  it('START pushes the full per-zone configuration to the pouch', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => result.current.startSession());

    expect(result.current.sessionState).toBe('active');
    expect(client.sendCommand).toHaveBeenCalledTimes(4);
    expect(client.sendCommand).toHaveBeenCalledWith({
      targetNode: 0x02,
      targetPressure: 25,
      massageLevel: 2,
      operationMode: 0x01,
    });
    expect(client.sendCommand).toHaveBeenCalledWith({
      targetNode: 0x01,
      targetPressure: 0,
      massageLevel: 0,
      operationMode: 0x01,
    });
  });

  it('the timer counts seconds only while active', () => {
    jest.useFakeTimers();
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current.elapsedSeconds).toBe(0); // pending: no ticking

    act(() => result.current.startSession());
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current.elapsedSeconds).toBe(3);

    jest.useRealTimers();
  });

  it('SET pushes only the selected zone as a Static Hold (mode 0x01)', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => result.current.startSession());
    client.sendCommand.mockClear();

    act(() => result.current.applyPrescription({ 0x03: 40 }));
    act(() => result.current.setActiveZone(0x03));
    act(() => result.current.updateTargetPressure(40));
    act(() => result.current.setMassageLevel(3));
    act(() => result.current.sendCommandToPouch());

    expect(client.sendCommand).toHaveBeenCalledTimes(1);
    expect(client.sendCommand).toHaveBeenLastCalledWith({
      targetNode: 0x03,
      targetPressure: 40,
      massageLevel: 3,
      operationMode: 0x01,
    });
  });

  it('confines pressure to the prescription +/-10%, not to the full 0..70 range', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    // Temples is prescribed 25, so the patient may move between 23 and 28.
    expect(result.current.trimMin).toBe(23);
    expect(result.current.trimMax).toBe(28);

    act(() => result.current.updateTargetPressure(500));
    expect(result.current.targetPressure).toBe(28);
    act(() => result.current.updateTargetPressure(-20));
    expect(result.current.targetPressure).toBe(23);
  });

  it('will not let an unprescribed zone be turned on', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    // Forehead is prescribed 0 — switched off by the clinician. The patient may
    // trim a treatment that was ordered, not start one that was not.
    act(() => result.current.setActiveZone(0x01));
    expect(result.current.canTrim).toBe(false);
    act(() => result.current.updateTargetPressure(40));
    expect(result.current.targetPressure).toBe(0);
  });

  it('re-centres the band when a new prescription arrives', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => result.current.updateTargetPressure(28)); // trimmed to the top
    act(() => result.current.applyPrescription({ 0x02: 50 }));

    // The new order takes effect at its own value, rather than inheriting the
    // previous patient's trim.
    expect(result.current.targetPressure).toBe(50);
    expect(result.current.trimMin).toBe(45);
    expect(result.current.trimMax).toBe(55);
  });

  it('never exceeds the 70 mmHg hardware ceiling, even at the top of a band', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    // 68 +10% is 74.8, which the pouch must never be asked for.
    act(() => result.current.applyPrescription({ 0x02: 68 }));
    expect(result.current.trimMax).toBe(70);
    act(() => result.current.updateTargetPressure(999));
    expect(result.current.targetPressure).toBe(70);
  });

  it('held STOP sends the emergency stop and zeroes every zone', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => result.current.startSession());
    act(() => result.current.handleEmergencyStop());

    expect(client.sendEmergencyStop).toHaveBeenCalledTimes(1);
    expect(result.current.sessionState).toBe('stopped');
    ([0x01, 0x02, 0x03, 0x04] as const).forEach((zone) => {
      expect(result.current.zoneSettings[zone].pressure).toBe(0);
      expect(result.current.zoneSettings[zone].massage).toBe(0);
    });
    // The prescription survives: the next session resumes the clinical order
    // rather than starting from nothing.
    expect(result.current.zoneSettings[0x02].prescribed).toBe(25);
  });

  it('START begins a fresh session (timer reset, config re-pushed) after a stop', () => {
    jest.useFakeTimers();
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => result.current.startSession());
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    act(() => result.current.handleEmergencyStop());
    expect(result.current.sessionState).toBe('stopped');
    expect(result.current.elapsedSeconds).toBe(5);

    client.sendCommand.mockClear();
    act(() => result.current.startSession());
    expect(result.current.sessionState).toBe('active');
    expect(result.current.elapsedSeconds).toBe(0);
    expect(client.sendCommand).toHaveBeenCalledTimes(4); // full config re-push

    jest.useRealTimers();
  });

  it('ignores SET unless a session is active', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    // PENDING: ignored.
    act(() => result.current.sendCommandToPouch());
    expect(client.sendCommand).not.toHaveBeenCalled();

    // STOPPED: ignored too.
    act(() => result.current.startSession());
    act(() => result.current.handleEmergencyStop());
    client.sendCommand.mockClear();
    act(() => result.current.sendCommandToPouch());
    expect(client.sendCommand).not.toHaveBeenCalled();
  });

  it('flags unapplied changes until SET succeeds (and clears when values match again)', async () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    // Not active yet — nothing to apply.
    expect(result.current.hasUnappliedChanges).toBe(false);

    await act(async () => result.current.startSession());
    // START pushed the config, board and app agree.
    expect(result.current.hasUnappliedChanges).toBe(false);

    // Change pressure -> dirty until SET.
    act(() => result.current.updateTargetPressure(27));
    expect(result.current.hasUnappliedChanges).toBe(true);

    await act(async () => result.current.sendCommandToPouch());
    expect(result.current.hasUnappliedChanges).toBe(false);

    // Change and change back -> values match what the board has, not dirty.
    act(() => result.current.updateTargetPressure(30));
    expect(result.current.hasUnappliedChanges).toBe(true);
    act(() => result.current.updateTargetPressure(27));
    expect(result.current.hasUnappliedChanges).toBe(false);

    // Failed write keeps the change flagged as unapplied.
    client.sendCommand.mockRejectedValueOnce(new Error('link down'));
    act(() => result.current.setMassageLevel(3));
    await act(async () => result.current.sendCommandToPouch());
    expect(result.current.hasUnappliedChanges).toBe(true);
  });

  it('reflects live telemetry frames pushed by the pouch', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() =>
      client.emitTelemetry({
        foreheadPressure: 33,
        leftTemplePressure: 0,
        rightTemplePressure: 0,
        backPressure: 0,
        batteryPercentage: 77,
        errorFlag: 0x00,
      }),
    );

    expect(result.current.liveTelemetry.foreheadPressure).toBe(33);
    expect(result.current.liveTelemetry.batteryPercentage).toBe(77);
  });

  it('tracks connection state', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => client.emitConnection('connected'));
    expect(result.current.isConnected).toBe(true);

    act(() => client.emitConnection('disconnected'));
    expect(result.current.isConnected).toBe(false);
  });
});
