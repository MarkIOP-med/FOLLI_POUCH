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
 * attacker. The comp draws no error state, so the incorrect-password message is
 * placed under the field where it pushes nothing else out of position.
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

const styles = StyleSheet.create({
  card: {
    marginTop: 140,
    marginHorizontal: layout.gutter,
    borderWidth: 3,
    borderColor: colors.panelBorder,
    borderRadius: layout.panelRadius,
    backgroundColor: colors.panel,
    paddingHorizontal: 60,
    paddingBottom: 48,
    alignItems: 'center',
  },

  padlock: { marginTop: 70, width: 150, height: 200 },

  title: { color: colors.white, fontSize: 76 },
  subtitle: {
    marginTop: 10,
    color: colors.text,
    fontSize: font.bodyLine,
    textAlign: 'center',
  },
  emphasis: { fontWeight: '700' },

  input: {
    marginTop: 90,
    width: '100%',
    height: 133,
    borderWidth: 2,
    borderColor: colors.panelBorder,
    borderRadius: 10,
    paddingHorizontal: 38,
    color: colors.white,
    fontSize: 46,
  },
  inputError: { borderColor: colors.disconnected },
  errorText: {
    alignSelf: 'flex-start',
    marginTop: 12,
    color: colors.disconnected,
    fontSize: 32,
  },

  submitButton: {
    marginTop: 60,
    width: '100%',
    height: 133,
    borderRadius: 8,
    backgroundColor: colors.controlOn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: '#4a4f55', fontSize: 58, letterSpacing: 2 },

  cancelButton: { marginTop: 90 },
  cancelText: { color: colors.text, fontSize: font.bodyLine },
});
