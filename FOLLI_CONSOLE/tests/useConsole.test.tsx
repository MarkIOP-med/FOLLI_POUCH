import { act, renderHook } from '@testing-library/react-native';

import { useConsole } from '../src/viewmodels/useConsole';
import type { PouchTelemetry } from '../src/models/telemetry';
import type {
  ConnectionListener,
  ConnectionState,
  PouchClient,
  ResponseListener,
  TelemetryListener,
} from '../src/services/pouch';
import type { DeviceUser } from '../src/services/pouch';

// A fully controllable fake pouch client so we can assert exactly what the
// ViewModel commands and feed telemetry/user/connection events into the hook.
function makeFakeClient() {
  let telemetryListener: TelemetryListener | null = null;
  let userListener: ((user: DeviceUser) => void) | null = null;
  let connectionListener: ConnectionListener | null = null;

  const client: PouchClient & {
    start: jest.Mock;
    stop: jest.Mock;
    setZonePressure: jest.Mock;
    vibrateZone: jest.Mock;
    requestUser: jest.Mock;
    emitTelemetry: (t: PouchTelemetry) => void;
    emitUser: (u: DeviceUser) => void;
    emitConnection: (s: ConnectionState) => void;
  } = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    setZonePressure: jest.fn().mockResolvedValue(undefined),
    vibrateZone: jest.fn().mockResolvedValue(undefined),
    requestUser: jest.fn().mockResolvedValue(undefined),
    onTelemetry: (l: TelemetryListener) => {
      telemetryListener = l;
      return () => {
        telemetryListener = null;
      };
    },
    onUser: (l: (user: DeviceUser) => void) => {
      userListener = l;
      return () => {
        userListener = null;
      };
    },
    onResponse: (_l: ResponseListener) => () => undefined,
    onConnectionChange: (l: ConnectionListener) => {
      connectionListener = l;
      return () => {
        connectionListener = null;
      };
    },
    getState: () => 'connected' as ConnectionState,
    emitTelemetry: (t) => telemetryListener && telemetryListener(t),
    emitUser: (u) => userListener && userListener(u),
    emitConnection: (s) => connectionListener && connectionListener(s),
  };
  return client;
}

const frame = (over: Partial<PouchTelemetry> = {}): PouchTelemetry => ({
  state: 'IDLE',
  elapsedSeconds: 0,
  actuals: [0, 0, 0, 0],
  targets: [0, 0, 0, 0],
  battery: 80,
  error: 0,
  ...over,
});

const BENCH_USER: DeviceUser = {
  userId: 8,
  assigned: true,
  pressures: [0, 25, 60, 0],
};

describe('useConsole — device-mirrored session', () => {
  it('boots PENDING, unprescribed, and connects', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    expect(result.current.sessionState).toBe('pending');
    expect(result.current.isSessionActive).toBe(false);
    expect(result.current.elapsedSeconds).toBe(0);
    // No prescription until the board's user record arrives — every zone inert.
    expect(result.current.canTrim).toBe(false);
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it("takes its prescription from the board's user record", () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => client.emitUser(BENCH_USER));

    act(() => result.current.setActiveZone(1));
    expect(result.current.zoneSettings[1].prescribed).toBe(25);
    expect(result.current.targetPressure).toBe(25);
    expect(result.current.canTrim).toBe(true);
    // Unprescribed zones stay off.
    expect(result.current.zoneSettings[0].prescribed).toBe(0);
  });

  it('START sends the start command; ACTIVE arrives from telemetry, not locally', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => client.emitUser(BENCH_USER)); // START needs an assigned patient
    act(() => result.current.startSession());
    expect(client.start).toHaveBeenCalledTimes(1);
    // Mirroring: the console does not declare itself active — the board does.
    expect(result.current.sessionState).toBe('pending');

    act(() => client.emitTelemetry(frame({ state: 'PRESSURIZING' })));
    expect(result.current.sessionState).toBe('active');
  });

  it('mirrors an ADMIN-started session: active state and the board clock', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    // No local START ever happened — the admin app drove the board over serial.
    act(() =>
      client.emitTelemetry(
        frame({ state: 'MAINTENANCE', elapsedSeconds: 754, targets: [0, 95, 125, 0] }),
      ),
    );

    expect(result.current.sessionState).toBe('active');
    expect(result.current.elapsedSeconds).toBe(754);
  });

  it('the clock is the board clock — no local ticking', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => client.emitTelemetry(frame({ state: 'PRESSURIZING', elapsedSeconds: 3 })));
    expect(result.current.elapsedSeconds).toBe(3);
    act(() => client.emitTelemetry(frame({ state: 'MAINTENANCE', elapsedSeconds: 9 })));
    expect(result.current.elapsedSeconds).toBe(9);
  });

  it('SET pushes only the selected zone, by zone name', async () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => client.emitUser({ ...BENCH_USER, pressures: [0, 25, 40, 0] }));
    act(() => client.emitTelemetry(frame({ state: 'MAINTENANCE' })));

    act(() => result.current.setActiveZone(2));
    act(() => result.current.updateTargetPressure(43));
    await act(async () => result.current.sendCommandToPouch());

    expect(client.setZonePressure).toHaveBeenCalledTimes(1);
    expect(client.setZonePressure).toHaveBeenLastCalledWith('EAR', 43);
  });

  it('ignores SET while the board is idle — trimming adjusts a running treatment', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => client.emitUser(BENCH_USER));
    act(() => result.current.sendCommandToPouch());
    expect(client.setZonePressure).not.toHaveBeenCalled();
  });

  it('massage SET is a one-shot trigger for the selected zone', async () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => client.emitUser(BENCH_USER));
    act(() => result.current.setActiveZone(1));
    act(() => result.current.setMassageLevel(2));
    await act(async () => result.current.triggerMassage());

    expect(client.vibrateZone).toHaveBeenCalledWith('TEMPLE', 2);
  });

  it('confines pressure to the trim band, not the full 0..70 range', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => client.emitUser(BENCH_USER));
    act(() => result.current.setActiveZone(1));
    // Prescribed 25: 10% is 2.5, below the 3 mmHg deadband floor → band 22..28.
    expect(result.current.trimMin).toBe(22);
    expect(result.current.trimMax).toBe(28);

    act(() => result.current.updateTargetPressure(500));
    expect(result.current.targetPressure).toBe(28);
    act(() => result.current.updateTargetPressure(-20));
    expect(result.current.targetPressure).toBe(22);
  });

  it('will not let an unprescribed zone be turned on', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => client.emitUser(BENCH_USER));
    act(() => result.current.setActiveZone(0));
    expect(result.current.canTrim).toBe(false);
    act(() => result.current.updateTargetPressure(40));
    expect(result.current.targetPressure).toBe(0);
  });

  it('never exceeds the 70 mmHg ceiling, even at the top of a band', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => client.emitUser({ ...BENCH_USER, pressures: [0, 68, 0, 0] }));
    act(() => result.current.setActiveZone(1));
    expect(result.current.trimMax).toBe(70);
    act(() => result.current.updateTargetPressure(999));
    expect(result.current.targetPressure).toBe(70);
  });

  it('held STOP sends stop; STOPPED shows once the board reports idle', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => client.emitUser(BENCH_USER));
    act(() => client.emitTelemetry(frame({ state: 'MAINTENANCE', elapsedSeconds: 60 })));
    act(() => result.current.handleEmergencyStop());

    expect(client.stop).toHaveBeenCalledTimes(1);
    // Still active until the board actually vents...
    expect(result.current.sessionState).toBe('active');
    act(() => client.emitTelemetry(frame({ state: 'IDLE', elapsedSeconds: 0 })));
    expect(result.current.sessionState).toBe('stopped');
    // Dials reset onto the surviving prescription.
    expect(result.current.zoneSettings[1].pressure).toBe(25);
    expect(result.current.zoneSettings[1].prescribed).toBe(25);
  });

  it("a stop from the ADMIN side shows as PENDING here, not this console's STOPPED", () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => client.emitTelemetry(frame({ state: 'MAINTENANCE', elapsedSeconds: 30 })));
    expect(result.current.sessionState).toBe('active');
    act(() => client.emitTelemetry(frame({ state: 'IDLE' })));
    expect(result.current.sessionState).toBe('pending');
  });

  it('re-requests the board user record on run boundaries', () => {
    const client = makeFakeClient();
    renderHook(() => useConsole(client));
    client.requestUser.mockClear();

    act(() => client.emitTelemetry(frame({ state: 'PRESSURIZING' })));
    expect(client.requestUser).toHaveBeenCalledTimes(1);
    act(() => client.emitTelemetry(frame({ state: 'MAINTENANCE' })));
    expect(client.requestUser).toHaveBeenCalledTimes(1); // still the same run
    act(() => client.emitTelemetry(frame({ state: 'IDLE' })));
    expect(client.requestUser).toHaveBeenCalledTimes(2); // run ended
  });

  it('flags unapplied changes until SET succeeds', async () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => client.emitUser(BENCH_USER));
    act(() => client.emitTelemetry(frame({ state: 'MAINTENANCE' })));
    act(() => result.current.setActiveZone(1));

    act(() => result.current.updateTargetPressure(27));
    expect(result.current.hasUnappliedChanges).toBe(true);

    await act(async () => result.current.sendCommandToPouch());
    expect(result.current.hasUnappliedChanges).toBe(false);

    // Failed write keeps the zone dirty.
    client.setZonePressure.mockRejectedValueOnce(new Error('link down'));
    act(() => result.current.updateTargetPressure(24));
    await act(async () => result.current.sendCommandToPouch());
    expect(result.current.hasUnappliedChanges).toBe(true);
  });

  it('reflects live telemetry and battery', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() =>
      client.emitTelemetry(
        frame({ state: 'MAINTENANCE', actuals: [0, 33, 0, 0], battery: 77 }),
      ),
    );

    expect(result.current.liveTelemetry.actuals[1]).toBe(33);
    expect(result.current.liveTelemetry.battery).toBe(77);
    expect(result.current.hasTelemetry).toBe(true);
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

describe('useConsole — patient assignment (the board user record)', () => {
  it('an UNASSIGNED board yields no prescription and no START', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));
    act(() => client.emitConnection('connected'));

    // Fresh boot: factory regime aboard, nobody assigned. Must not become a
    // prescription — and START must not run it.
    act(() => client.emitUser({ userId: -1, assigned: false, pressures: [0, 95, 125, 0] }));

    expect(result.current.patient).toEqual({ assigned: false, userId: null });
    expect(result.current.canStart).toBe(false);
    act(() => result.current.setActiveZone(1));
    expect(result.current.zoneSettings[1].prescribed).toBe(0);
    expect(result.current.canTrim).toBe(false);

    act(() => result.current.startSession());
    expect(client.start).not.toHaveBeenCalled();
  });

  it('an assigned patient enables START once connected and idle', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => client.emitUser(BENCH_USER));
    expect(result.current.patient).toEqual({ assigned: true, userId: 8 });
    expect(result.current.canStart).toBe(false); // link not up yet

    act(() => client.emitConnection('connected'));
    expect(result.current.canStart).toBe(true);

    act(() => client.emitTelemetry(frame({ state: 'PRESSURIZING' })));
    expect(result.current.canStart).toBe(false); // already running
  });

  it('a zone prescribed above the patient ceiling is shown truthfully but locked', async () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => client.emitUser({ ...BENCH_USER, pressures: [0, 95, 0, 0] }));
    act(() => client.emitTelemetry(frame({ state: 'MAINTENANCE' })));
    act(() => result.current.setActiveZone(1));

    // Not silently clamped to 70 — that would make SET lower the clinician's regime.
    expect(result.current.targetPressure).toBe(95);
    expect(result.current.canTrim).toBe(false);
    act(() => result.current.updateTargetPressure(60));
    expect(result.current.targetPressure).toBe(95);
    await act(async () => result.current.sendCommandToPouch());
    expect(client.setZonePressure).not.toHaveBeenCalled();
  });

  it('re-assignment after a reset restores the prescription', () => {
    const client = makeFakeClient();
    const { result } = renderHook(() => useConsole(client));

    act(() => client.emitUser(BENCH_USER));
    act(() => client.emitUser({ userId: -1, assigned: false, pressures: [0, 95, 125, 0] }));
    expect(result.current.zoneSettings[1].prescribed).toBe(0);

    act(() => client.emitUser(BENCH_USER));
    expect(result.current.patient).toEqual({ assigned: true, userId: 8 });
    expect(result.current.zoneSettings[1].prescribed).toBe(25);
  });
});
