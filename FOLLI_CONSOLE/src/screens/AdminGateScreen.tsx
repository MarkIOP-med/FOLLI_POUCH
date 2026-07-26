import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { ADMIN_PASSWORD } from '../config';

type Props = {
  onSuccess: () => void;
  onCancel: () => void;
};

// Password gate in front of the admin control panel. This is a soft lock (see
// config.ts) — its job is to stop casual end-users, not determined attackers.
export default function AdminGateScreen({ onSuccess, onCancel }: Props) {
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
    <SafeAreaView style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.title}>Admin Access</Text>
        <Text style={styles.subtitle}>Enter the administrator password to continue.</Text>

        <TextInput
          testID="admin-password-input"
          style={[styles.input, error && styles.inputError]}
          value={value}
          onChangeText={(t) => {
            setValue(t);
            if (error) setError(false);
          }}
          placeholder="Password"
          placeholderTextColor="#54627a"
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
          <Text style={styles.cancelText}>Back to console</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#010813',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#050e1d',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1a2c42',
    padding: 24,
    alignItems: 'center',
  },
  lockIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#8e8e93',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  input: {
    width: '100%',
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1a2c42',
    backgroundColor: '#0a1424',
    color: '#ffffff',
    paddingHorizontal: 14,
    fontSize: 16,
  },
  inputError: {
    borderColor: '#ff3b30',
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 13,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  submitButton: {
    width: '100%',
    height: 48,
    borderRadius: 10,
    backgroundColor: '#2b8bff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  cancelButton: {
    marginTop: 16,
    padding: 8,
  },
  cancelText: {
    color: '#8e8e93',
    fontSize: 14,
  },
});
