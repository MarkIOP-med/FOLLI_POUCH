import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { DESIGN_H, DESIGN_W, canvasScale, colors, font, layout } from '../theme';

const ICONS = {
  connected: require('../../assets/buttons/Connected_icon_01.png'),
  disconnected: require('../../assets/buttons/Disconnected_icon_01.png'),
};

/** `hh:mm:ss`, matching the clock printed on every comp. */
function clockText(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/**
 * The battery outline from the comps, drawn rather than imported.
 *
 * The delivered battery artwork is fixed at the pouch's red low-charge state,
 * and this has to render an arbitrary level — or none at all.
 */
function BatteryGlyph({ percent, tint }: { percent: number | null; tint: string }) {
  const known = percent != null;
  const fraction = known ? Math.max(0, Math.min(100, percent as number)) / 100 : 0;
  return (
    <View style={styles.batteryShell}>
      <View style={styles.batteryBody}>
        {known && (
          <View style={[styles.batteryFill, { width: `${fraction * 100}%`, backgroundColor: tint }]} />
        )}
      </View>
      <View style={styles.batteryCap} />
    </View>
  );
}

interface StatusBarProps {
  isConnected: boolean;
  consoleBattery: number | null;
}

/**
 * The link / clock / battery strip across the top of all four comps.
 *
 * The battery here is the console's own, which is a different number from the
 * pouch battery on the console screen. Nothing reports it — the BLE telemetry
 * frame carries a single battery byte and that one is the pouch's — so it shows
 * as unknown rather than borrowing a value that means something else.
 */
function ConsoleStatusBar({ isConnected, consoleBattery }: StatusBarProps) {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.statusBar}>
      <View style={styles.statusLeft}>
        <Image
          source={isConnected ? ICONS.connected : ICONS.disconnected}
          style={styles.linkIcon}
          resizeMode="contain"
        />
        <Text
          testID="ble-status"
          style={[
            styles.statusLabel,
            { color: isConnected ? colors.connected : colors.disconnected },
          ]}
        >
          {isConnected ? 'Connected' : 'Disconnected'}
        </Text>
      </View>

      <Text style={styles.clock}>{clockText(now)}</Text>

      <View style={styles.statusRight}>
        <Text style={styles.battery}>
          {consoleBattery == null ? '--' : `${consoleBattery}%`}
        </Text>
        <BatteryGlyph percent={consoleBattery} tint={colors.white} />
      </View>
    </View>
  );
}

interface FrameProps {
  isConnected: boolean;
  consoleBattery?: number | null;
  /** Omitted on the admin and exit screens, which draw no gear. */
  onOpenSettings?: () => void;
  children: React.ReactNode;
}

/**
 * Page background, status bar and header — the shell every screen sits in.
 *
 * Lays out a fixed 886x1890 canvas and scales it to fit, so children can be
 * positioned in the comps' own coordinates.
 */
export function ScreenFrame({
  isConnected,
  consoleBattery = null,
  onOpenSettings,
  children,
}: FrameProps) {
  const window = useWindowDimensions();
  const scale = canvasScale(window);

  return (
    <LinearGradient
      colors={[colors.pageTop, colors.pageBottom]}
      style={styles.page}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View
        style={[
          styles.canvas,
          {
            // Anchored top-left then scaled, rather than centred: the status bar
            // has to stay flush with the top of the screen on every device.
            transform: [{ scale }],
            marginLeft: (window.width - DESIGN_W * scale) / 2,
          },
        ]}
      >
        <ConsoleStatusBar isConnected={isConnected} consoleBattery={consoleBattery} />

        <View style={styles.header}>
          {onOpenSettings ? (
            <TouchableOpacity
              testID="settings-gear"
              onPress={onOpenSettings}
              accessibilityLabel="Open admin control panel"
              hitSlop={{ top: 30, bottom: 30, left: 30, right: 30 }}
            >
              <Text style={styles.gear}>⚙</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}

          <Text style={styles.brand}>
            <Text style={styles.brandLight}>Folli</Text>
            <Text style={styles.brandBold}>Save</Text>
          </Text>
        </View>

        {children}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  canvas: {
    width: DESIGN_W,
    height: DESIGN_H,
    transformOrigin: 'top left',
  },

  statusBar: {
    height: layout.statusBarH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    backgroundColor: colors.statusBar,
    borderBottomWidth: 3,
    borderBottomColor: colors.statusRule,
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  statusRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  linkIcon: { width: 56, height: 40 },
  statusLabel: { fontSize: font.statusBar },
  clock: { color: colors.text, fontSize: font.clock },
  battery: { color: colors.text, fontSize: font.battery },

  batteryShell: { flexDirection: 'row', alignItems: 'center' },
  batteryBody: {
    width: 74,
    height: 38,
    borderWidth: 4,
    borderColor: colors.white,
    borderRadius: 6,
    padding: 4,
    justifyContent: 'center',
  },
  batteryFill: { height: '100%', borderRadius: 2 },
  batteryCap: {
    width: 6,
    height: 16,
    backgroundColor: colors.white,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },

  header: {
    height: layout.headerH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.gutter,
  },
  gear: { color: colors.white, fontSize: 56 },
  brand: { fontSize: 58 },
  brandLight: { color: colors.brand },
  brandBold: { color: colors.brandPale, fontWeight: '700' },
});
