import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';

import { KioskLock } from '../services/kiosk/KioskLock';
import { ScreenFrame } from '../components/ScreenFrame';
import { colors, font, layout } from '../theme';

type Props = {
  onBack: () => void;
  /** Drives the status-bar link indicator; the screen itself needs no pouch. */
  isConnected?: boolean;
};

/**
 * console_ui_05 PAGE_04 — the admin control panel.
 *
 * The single red EXIT button is the only sanctioned way out of the locked
 * console: it releases lock-task mode and terminates the app (KioskLock.exit).
 *
 * The comp's artwork reads "Contol Panel" and "Press EXIT unlock and close the
 * FOLLI console". Both are typos in the design file, and this is patient-facing
 * text on a medical device, so it is set in correct English.
 */
export default function ExitScreen({ onBack, isConnected = false }: Props) {
  return (
    <ScreenFrame isConnected={isConnected}>
      <View style={styles.card}>
        <Text style={styles.heading}>Control Panel</Text>
        <Text style={styles.subheading}>
          Press <Text style={styles.emphasis}>EXIT</Text> to unlock and close the FOLLI console
        </Text>

        <TouchableOpacity
          testID="exit-button"
          style={styles.exitButton}
          activeOpacity={0.85}
          onPress={() => KioskLock.exit()}
        >
          <Text style={styles.exitText}>EXIT</Text>
        </TouchableOpacity>

        <TouchableOpacity testID="exit-back" style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>Back to console</Text>
        </TouchableOpacity>
      </View>
    </ScreenFrame>
  );
}

// Same card box as PAGE_03 — x 41, y 351, 804 x 1048. The card sits on the
// frame's canvas so its `top` is the comp's y; everything inside is that y
// minus 351.
const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: layout.gutter,
    top: 351,
    width: layout.panelW,
    height: 1048,
    borderWidth: 3,
    borderColor: colors.panelBorder,
    borderRadius: layout.panelRadius,
    backgroundColor: colors.panel,
  },

  heading: {
    position: 'absolute',
    top: 47,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: colors.white,
    fontSize: 91.7,
  },
  subheading: {
    position: 'absolute',
    top: 165,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: colors.text,
    fontSize: font.bodyLine,
  },
  emphasis: { fontWeight: '700' },

  exitButton: {
    position: 'absolute',
    top: 495,
    left: 62,
    width: 681,
    height: 135,
    borderRadius: 6,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitText: { color: colors.textDim, fontSize: 66.7, letterSpacing: 2 },

  backButton: { position: 'absolute', top: 966, left: 0, right: 0, alignItems: 'center' },
  backText: { color: colors.text, fontSize: font.bodyLine },
});
