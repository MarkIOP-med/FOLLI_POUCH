import React, { useState } from 'react';
import { useKioskLock } from './src/viewmodels/useKioskLock';
import ConsoleScreen from './src/screens/ConsoleScreen';
import AdminGateScreen from './src/screens/AdminGateScreen';
import ExitScreen from './src/screens/ExitScreen';

// Simple state-based router. We deliberately avoid react-navigation so the back
// stack cannot be used to escape the kiosk — the hardware back button is also
// swallowed by useKioskLock. The only ways to move between screens are the
// on-screen controls below.
type Screen = 'console' | 'gate' | 'exit';

export default function App() {
  const [screen, setScreen] = useState<Screen>('console');

  // Engage the "unescapable console" lockdown for the whole app lifetime.
  useKioskLock(true);

  switch (screen) {
    case 'gate':
      return (
        <AdminGateScreen
          onSuccess={() => setScreen('exit')}
          onCancel={() => setScreen('console')}
        />
      );
    case 'exit':
      return <ExitScreen onBack={() => setScreen('console')} />;
    case 'console':
    default:
      return <ConsoleScreen onOpenSettings={() => setScreen('gate')} />;
  }
}
