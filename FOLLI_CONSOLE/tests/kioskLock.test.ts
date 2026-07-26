import { BackHandler } from 'react-native';
import { KioskLock } from '../src/services/kiosk/KioskLock';

describe('KioskLock.exit', () => {
  it('releases lock-task before terminating the app (stop -> exitApp order)', async () => {
    const stopSpy = jest.spyOn(KioskLock, 'stop').mockResolvedValue(undefined);
    const exitSpy = jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => {});

    await KioskLock.exit();

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledTimes(1);
    // stop must be invoked before exitApp so the app can actually close.
    expect(stopSpy.mock.invocationCallOrder[0]).toBeLessThan(
      exitSpy.mock.invocationCallOrder[0],
    );

    stopSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
