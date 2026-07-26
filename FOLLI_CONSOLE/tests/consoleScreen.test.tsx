import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import ConsoleScreen from '../src/screens/ConsoleScreen';

// ConsoleScreen uses the default (mock) BLE client, which runs a 250ms telemetry
// interval, plus the 1s session timer. Fake timers keep those from leaking.
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('ConsoleScreen (full UI wiring)', () => {
  it('boots PENDING with a START button, timer at 00:00 and the UI_01 defaults', () => {
    const { getByTestId, getByText } = render(
      <ConsoleScreen onOpenSettings={jest.fn()} />,
    );

    expect(getByText('PENDING')).toBeTruthy();
    expect(getByTestId('session-timer').props.children.join('')).toContain('00:00');
    expect(getByTestId('start-button')).toBeTruthy();
    // STOP stays mounted (to avoid remount flicker) but is inert while pending.
    fireEvent(getByTestId('stop-button'), 'pressIn');
    act(() => {
      jest.advanceTimersByTime(1600);
    });
    expect(getByText('PENDING')).toBeTruthy();
    expect(getByTestId('settings-gear')).toBeTruthy();
    expect(getByTestId('pressure-slider')).toBeTruthy();
    expect(getByTestId('pressure-minus')).toBeTruthy();
    expect(getByTestId('pressure-plus')).toBeTruthy();
    expect(getByTestId('set-button')).toBeTruthy();
    // UI_01 default selections: Temples, 25 mmHg.
    expect(getByText('Temples')).toBeTruthy();
    expect(getByTestId('pressure-readout').props.children).toBe(25);
  });

  it('gear icon opens the admin gate', () => {
    const onOpenSettings = jest.fn();
    const { getByTestId } = render(<ConsoleScreen onOpenSettings={onOpenSettings} />);

    fireEvent.press(getByTestId('settings-gear'));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('controls are adjustable before starting and each zone keeps its own values', () => {
    const { getByTestId, getByText, queryByText } = render(
      <ConsoleScreen onOpenSettings={jest.fn()} />,
    );

    // While PENDING: switching zones works and shows that zone's own settings.
    fireEvent.press(getByTestId('zone-1'));
    expect(getByText('Front')).toBeTruthy();
    expect(queryByText('Temples')).toBeNull();
    expect(getByTestId('pressure-readout').props.children).toBe(0); // front default: off

    // Adjust forehead, then flip back to Temples — Temples kept its values.
    fireEvent.press(getByTestId('pressure-plus'));
    expect(getByTestId('pressure-readout').props.children).toBe(1);
    fireEvent.press(getByTestId('zone-2'));
    expect(getByTestId('pressure-readout').props.children).toBe(25);

    // ...and forehead kept its adjusted value too.
    fireEvent.press(getByTestId('zone-1'));
    expect(getByTestId('pressure-readout').props.children).toBe(1);
  });

  it('START begins the session and runs the timer; long-press STOP ends it', () => {
    const { getByTestId, getByText } = render(
      <ConsoleScreen onOpenSettings={jest.fn()} />,
    );

    fireEvent.press(getByTestId('start-button'));
    expect(getByText('ACTIVE')).toBeTruthy();
    expect(getByTestId('stop-button')).toBeTruthy();

    // Timer counts up while active.
    act(() => {
      jest.advanceTimersByTime(61000);
    });
    expect(getByTestId('session-timer').props.children.join('')).toContain('01:01');

    // Hold STOP for the full 1.5s -> console stops, START is revealed.
    fireEvent(getByTestId('stop-button'), 'pressIn');
    act(() => {
      jest.advanceTimersByTime(1600);
    });
    expect(getByText('STOPPED')).toBeTruthy();
    expect(getByTestId('start-button')).toBeTruthy();

    // START stays disabled briefly (until the stopping finger lifts) so the
    // same press that stopped the session can't restart it.
    fireEvent.press(getByTestId('start-button'));
    expect(getByText('STOPPED')).toBeTruthy();

    // A new session resets the timer.
    act(() => {
      jest.advanceTimersByTime(1100);
    });
    fireEvent.press(getByTestId('start-button'));
    expect(getByText('ACTIVE')).toBeTruthy();
    expect(getByTestId('session-timer').props.children.join('')).toContain('00:00');
  });

  it('releasing STOP early cancels the hold and keeps the session active', () => {
    const { getByTestId, getByText } = render(<ConsoleScreen onOpenSettings={jest.fn()} />);

    fireEvent.press(getByTestId('start-button'));
    fireEvent(getByTestId('stop-button'), 'pressIn');
    act(() => {
      jest.advanceTimersByTime(800); // less than the 1500ms hold
    });
    fireEvent(getByTestId('stop-button'), 'pressOut');
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(getByText('ACTIVE')).toBeTruthy();
    expect(getByTestId('stop-button')).toBeTruthy();
  });

  it('the +/- steppers adjust the pressure readout by 1 mmHg (even while PENDING)', () => {
    const { getByTestId } = render(<ConsoleScreen onOpenSettings={jest.fn()} />);

    expect(getByTestId('pressure-readout').props.children).toBe(25);

    fireEvent.press(getByTestId('pressure-plus'));
    expect(getByTestId('pressure-readout').props.children).toBe(26);

    fireEvent.press(getByTestId('pressure-minus'));
    fireEvent.press(getByTestId('pressure-minus'));
    expect(getByTestId('pressure-readout').props.children).toBe(24);
  });
});
