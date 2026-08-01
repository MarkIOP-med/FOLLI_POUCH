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

const styles = StyleSheet.create({
  // The comp floats one tall panel below the header, inset by the page gutter.
  card: {
    marginTop: 140,
    marginHorizontal: layout.gutter,
    height: 1040,
    borderWidth: 3,
    borderColor: colors.panelBorder,
    borderRadius: layout.panelRadius,
    backgroundColor: colors.panel,
    paddingHorizontal: 60,
    alignItems: 'center',
  },
  heading: {
    marginTop: 70,
    color: colors.white,
    fontSize: 76,
  },
  subheading: {
    marginTop: 22,
    color: colors.text,
    fontSize: font.bodyLine,
    textAlign: 'center',
  },
  emphasis: { fontWeight: '700' },

  // Positioned to the comp rather than centred in the remaining space: the
  // button sits above the vertical middle, not in it.
  exitButton: {
    marginTop: 300,
    width: 682,
    height: 130,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitText: {
    color: colors.textDim,
    fontSize: 58,
    fontWeight: '600',
    letterSpacing: 1,
  },

  backButton: { marginTop: 300 },
  backText: { color: colors.text, fontSize: font.bodyLine },
});
