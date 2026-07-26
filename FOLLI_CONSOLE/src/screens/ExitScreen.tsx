import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView } from 'react-native';
import { KioskLock } from '../services/kiosk/KioskLock';

type Props = {
  onBack: () => void;
};

// Admin control panel. The single large red EXIT button is the ONLY sanctioned
// way to leave the locked console — it releases lock-task mode then terminates
// the app (see KioskLock.exit).
export default function ExitScreen({ onBack }: Props) {
  const handleExit = () => {
    KioskLock.exit();
  };

  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.heading}>Control Panel</Text>
      <Text style={styles.subheading}>Press EXIT to unlock and close the FOLLI console.</Text>

      <View style={styles.center}>
        <TouchableOpacity
          testID="exit-button"
          style={styles.exitButton}
          activeOpacity={0.85}
          onPress={handleExit}
        >
          <Text style={styles.exitText}>EXIT</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity testID="exit-back" style={styles.backButton} onPress={onBack}>
        <Text style={styles.backText}>Return to console</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const BUTTON_SIZE = 200;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#010813',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 30,
  },
  heading: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  subheading: {
    color: '#8e8e93',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 30,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff3b30',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 12,
    borderWidth: 4,
    borderColor: '#ff6a61',
  },
  exitText: {
    color: '#ffffff',
    fontSize: 44,
    fontWeight: 'bold',
    letterSpacing: 3,
  },
  backButton: {
    padding: 12,
  },
  backText: {
    color: '#54627a',
    fontSize: 14,
  },
});
