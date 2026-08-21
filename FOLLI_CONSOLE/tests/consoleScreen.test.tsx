import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

import ConsoleScreen from '../src/screens/ConsoleScreen';

// The screen runs against the REAL protocol + client layers over MockTransport
// (the simulated pouch speaking the actual text grammar) — the factory is
// pinned here so jest can never accidentally construct the BLE transport
// against the dead react-native-ble-plx stub, which is exactly the silent trap
// the previous suite fell into.
jest.mock('../src/services/pouch', () => {
  const actual = jest.requireActual('../src/services/pouch');
  const { FolliPouchClient } = jest.requireActual('../src/services/pouch/PouchClient');
  const { MockTransport } = jest.requireActual('../src/services/pouch/MockTransport');
  return {
    ...actual,
    createPouchClient: () => new FolliPouchClient(new MockTransport()),
  };
});

// First render loads the full asset table and the client stack — slow on a cold
// jest worker, so the default 5s per-test budget is not enough.
jest.setTimeout(30000);

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

/** Render + let the mock pouch connect, answer readuser and emit a frame. */
async function renderScreen(props: { onOpenSettings?: jest.Mock } = {}) {
  const utils = render(
    <ConsoleScreen onOpenSettings={props.onOpenSettings ?? jest.fn()} />,
  );
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  return utils;
}

/** Advance the mock pouch by a few telemetry frames. */
const tick = async (ms = 600) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

describe('ConsoleScreen (full UI wiring over the mock pouch)', () => {
  it('boots PENDING with a START button and the board prescription loaded', async () => {
    const { getByTestId, getByText } = await renderScreen();

    expect(getByText('PENDING')).toBeTruthy();
    expect(getByTestId('session-timer').props.children.join('')).toContain('00:00');
    expect(getByTestId('start-button')).toBeTruthy();
    // STOP stays mounted (to avoid remount flicker) but is inert while pending.
    fireEvent(getByTestId('stop-button'), 'pressIn');
    await tick(1600);
    expect(getByText('PENDING')).toBeTruthy();
    expect(getByTestId('settings-gear')).toBeTruthy();
    expect(getByTestId('pressure-slider')).toBeTruthy();
    expect(getByTestId('set-button')).toBeTruthy();
    // The prescription came from the pouch's user record: patient #8, Temples at 25.
    expect(getByTestId('patient-line').props.children.join('')).toContain('#8');
    expect(getByText('Temples')).toBeTruthy();
    expect(getByTestId('pressure-readout').props.children).toBe(25);
  });

  it('gear icon opens the admin gate', async () => {
    const onOpenSettings = jest.fn();
    const { getByTestId } = await renderScreen({ onOpenSettings });

    fireEvent.press(getByTestId('settings-gear'));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('zones keep their own values; unprescribed zones cannot be raised', async () => {
    const { getByTestId, getByText, queryByText } = await renderScreen();

    // Front (channel 0) is unprescribed — off, and stays off.
    fireEvent.press(getByTestId('zone-0'));
    expect(getByText('Front')).toBeTruthy();
    expect(queryByText('Temples')).toBeNull();
    expect(getByTestId('pressure-readout').props.children).toBe(0);
    fireEvent.press(getByTestId('pressure-plus'));
    expect(getByTestId('pressure-readout').props.children).toBe(0);

    // Temples (channel 1) is prescribed 25 → trimmable within 22..28.
    fireEvent.press(getByTestId('zone-1'));
    expect(getByTestId('pressure-readout').props.children).toBe(25);
    fireEvent.press(getByTestId('pressure-plus'));
    expect(getByTestId('pressure-readout').props.children).toBe(26);

    // Each zone remembers its own value across a switch.
    fireEvent.press(getByTestId('zone-0'));
    expect(getByTestId('pressure-readout').props.children).toBe(0);
    fireEvent.press(getByTestId('zone-1'));
    expect(getByTestId('pressure-readout').props.children).toBe(26);
  });

  // Regression guard: START and STOP share one slot and both stay mounted; the
  // hidden one must be non-interactive or it eats every touch on a device.
  it('the hidden master button cannot receive touches', async () => {
    const { getByTestId } = await renderScreen();

    const flatten = (style: unknown): Record<string, unknown> =>
      Object.assign({}, ...([style].flat(Infinity).filter(Boolean) as object[]));

    // PENDING: STOP is the hidden one and must not intercept.
    expect(flatten(getByTestId('stop-button').props.style).pointerEvents).toBe('none');
    expect(flatten(getByTestId('start-button').props.style).pointerEvents).toBeUndefined();

    fireEvent.press(getByTestId('start-button'));
    await tick(); // ACTIVE arrives from the pouch's telemetry, not locally

    expect(flatten(getByTestId('start-button').props.style).pointerEvents).toBe('none');
    expect(flatten(getByTestId('stop-button').props.style).pointerEvents).toBeUndefined();
  });

  it('START activates via the board; the clock is the board clock; STOP ends it', async () => {
    const { getByTestId, getByText } = await renderScreen();

    fireEvent.press(getByTestId('start-button'));
    await tick(); // the board reports PRESSURIZING → ACTIVE mirrors in
    expect(getByText('ACTIVE')).toBeTruthy();
    expect(getByTestId('stop-button')).toBeTruthy();

    // The clock displays the BOARD's elapsed seconds.
    await tick(61000);
    expect(getByTestId('session-timer').props.children.join('')).toContain('01:01');

    // Hold STOP for the full 1.5s → stop lands, the board vents, STOPPED shows.
    fireEvent(getByTestId('stop-button'), 'pressIn');
    await tick(1600);
    await tick();
    expect(getByText('STOPPED')).toBeTruthy();
    expect(getByTestId('start-button')).toBeTruthy();

    // A new session resets the board clock.
    await tick(1100);
    fireEvent.press(getByTestId('start-button'));
    await tick();
    expect(getByText('ACTIVE')).toBeTruthy();
    expect(getByTestId('session-timer').props.children.join('')).toContain('00:00');
  });

  it('releasing STOP early cancels the hold and keeps the session active', async () => {
    const { getByTestId, getByText } = await renderScreen();

    fireEvent.press(getByTestId('start-button'));
    await tick();
    fireEvent(getByTestId('stop-button'), 'pressIn');
    await tick(800); // less than the 1500ms hold
    fireEvent(getByTestId('stop-button'), 'pressOut');
    await tick(1000);

    expect(getByText('ACTIVE')).toBeTruthy();
    expect(getByTestId('stop-button')).toBeTruthy();
  });

  it('the +/- steppers adjust the pressure readout by 1 mmHg (even while PENDING)', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('pressure-readout').props.children).toBe(25);

    fireEvent.press(getByTestId('pressure-plus'));
    expect(getByTestId('pressure-readout').props.children).toBe(26);

    fireEvent.press(getByTestId('pressure-minus'));
    fireEvent.press(getByTestId('pressure-minus'));
    expect(getByTestId('pressure-readout').props.children).toBe(24);
  });
});
