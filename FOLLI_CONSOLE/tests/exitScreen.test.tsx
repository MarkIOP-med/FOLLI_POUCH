import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ExitScreen from '../src/screens/ExitScreen';
import { KioskLock } from '../src/services/kiosk/KioskLock';

describe('ExitScreen (the only way out)', () => {
  it('EXIT triggers the kiosk unlock+quit path', () => {
    const exitSpy = jest.spyOn(KioskLock, 'exit').mockResolvedValue(undefined);
    const { getByTestId } = render(<ExitScreen onBack={jest.fn()} />);

    fireEvent.press(getByTestId('exit-button'));

    expect(exitSpy).toHaveBeenCalledTimes(1);
    exitSpy.mockRestore();
  });

  it('the back link returns to the console instead of exiting', () => {
    const onBack = jest.fn();
    const exitSpy = jest.spyOn(KioskLock, 'exit').mockResolvedValue(undefined);
    const { getByTestId } = render(<ExitScreen onBack={onBack} />);

    fireEvent.press(getByTestId('exit-back'));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});
