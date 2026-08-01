import React, { useState } from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ADMIN_PASSWORD } from '../config';
import { ScreenFrame } from '../components/ScreenFrame';
import { colors, font, layout } from '../theme';

const PADLOCK = require('../../assets/buttons/Padlock_Icon_01.png');

type Props = {
  onSuccess: () => void;
  onCancel: () => void;
  /** Drives the status-bar link indicator; the gate itself needs no pouch. */
  isConnected?: boolean;
};

/**
 * console_ui_05 PAGE_03 — the password gate in front of the admin panel.
 *
 * A soft lock (see config.ts): it stops a curious patient, not a determined
 * attacker. Laid out absolutely against the comp's own coordinates — the card
 * is x 41, y 351, 804 x 1048, and everything inside is placed relative to it.
 *
 * The comp draws no error state, so the incorrect-password message sits in the
 * gap between the field and the button, where it displaces nothing.
 */
export default function AdminGateScreen({ onSuccess, onCancel, isConnected = false }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const submit = () => {
    if (value === ADMIN_PASSWORD) {
      setError(false);
      setValue('');
      onSuccess();
    } else {
      setError(true);
    }
  };

  return (
    <ScreenFrame isConnected={isConnected}>
      <View style={styles.card}>
        <Image source={PADLOCK} style={styles.padlock} resizeMode="contain" />

        <Text style={styles.title}>Admin Access</Text>
        <Text style={styles.subtitle}>
          Enter the <Text style={styles.emphasis}>administrator password</Text> to continue
        </Text>

        <TextInput
          testID="admin-password-input"
          style={[styles.input, error && styles.inputError]}
          value={value}
          onChangeText={(t) => {
            setValue(t);
            if (error) setError(false);
          }}
          placeholder="Password"
          placeholderTextColor={colors.textDim}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={submit}
        />

        {error && (
          <Text testID="admin-error" style={styles.errorText}>
            Incorrect password. Try again.
          </Text>
        )}

        <TouchableOpacity testID="admin-submit" style={styles.submitButton} onPress={submit}>
          <Text style={styles.submitText}>UNLOCK</Text>
        </TouchableOpacity>

        <TouchableOpacity testID="admin-cancel" style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelText}>Back to Console</Text>
        </TouchableOpacity>
      </View>
    </ScreenFrame>
  );
}

// The card is an absolute child of the frame's canvas, so its `top` is the
// comp's canvas y directly. Every `top` inside it is the comp's y minus the
// card's own 351.
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

  padlock: { position: 'absolute', alignSelf: 'center', top: 75, width: 152, height: 190 },

  title: {
    position: 'absolute',
    top: 284,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: colors.white,
    fontSize: 91.7,
  },
  // The comp sets this in one line spanning x 55..831 — nearly the full card —
  // so the card carries almost no horizontal padding here.
  subtitle: {
    position: 'absolute',
    top: 402,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: colors.text,
    fontSize: font.bodyLine,
  },
  emphasis: { fontWeight: '700' },

  input: {
    position: 'absolute',
    top: 542,
    left: 62,
    width: 681,
    height: 135,
    borderWidth: 2,
    borderColor: colors.panelBorder,
    borderRadius: 10,
    paddingHorizontal: 35,
    color: colors.white,
    fontSize: 50,
  },
  inputError: { borderColor: colors.disconnected },
  errorText: {
    position: 'absolute',
    top: 686,
    left: 62,
    color: colors.disconnected,
    fontSize: 34,
  },

  submitButton: {
    position: 'absolute',
    top: 735,
    left: 62,
    width: 681,
    height: 135,
    borderRadius: 6,
    backgroundColor: '#bcbec0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: '#4a4f55', fontSize: 66.7, letterSpacing: 2 },

  cancelButton: { position: 'absolute', top: 966, left: 0, right: 0, alignItems: 'center' },
  cancelText: { color: colors.text, fontSize: font.bodyLine },
});
