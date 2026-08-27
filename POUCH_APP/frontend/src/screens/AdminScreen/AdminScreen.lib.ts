import type { DeviceSnapshot, Settings, Zone } from '@/api/types';

/** How a row's Set Value commits. 'readonly' rows render no input. */
export type AdminRowKind =
  | 'zone'
  | 'vibration'
  | 'ceiling'
  | 'trimRange'
  | 'massageSeconds'
  | 'pressureTolerance'
  | 'readonly';

export interface AdminAction {
  key: string;
  kind: AdminRowKind;
  zone?: Zone;
  labelKey: string;
  descriptionKey: string;
  /** Current value, or null when nothing supplies one. */
  value: number | string | null;
  /** Zone/vibration rows need a loaded patient (or service mode) and a
      connection; app-settings rows need neither. */
  needsSession: boolean;
}

/** Rows the mockup lists, bound to what the snapshot and settings actually know. */
export function adminActions(
  snapshot: DeviceSnapshot | null,
  settings: Settings | null,
): AdminAction[] {
  // Read the CHECKED-OUT patient's stored regime (shown/edited at idle), not
  // zones[] (what the pouch is commanding right now, 0 when idle).
  const zone = (name: string) =>
    snapshot?.checked_out_regime?.[name]?.prescribed_mmhg ?? null;

  const zoneRow = (key: string, name: Zone): AdminAction => ({
    key,
    kind: 'zone',
    zone: name,
    labelKey: `diagnostics.admin.rows.${key}`,
    descriptionKey: `diagnostics.admin.rows.${key}Desc`,
    value: zone(name),
    needsSession: true,
  });

  return [
    zoneRow('front', 'FRONT'),
    zoneRow('temple', 'TEMPLE'),
    zoneRow('ear', 'EAR'),
    zoneRow('back', 'BACK'),
    {
      // Derived — the pump charges the manifold to the highest commanded zone.
      // There is nothing to set, so no input; the old editable input collected a
      // value that was never sent anywhere.
      key: 'manifold',
      kind: 'readonly',
      labelKey: 'diagnostics.admin.rows.manifold',
      descriptionKey: 'diagnostics.admin.rows.manifoldDesc',
      value: snapshot?.manifold_target_mmhg ?? null,
      needsSession: false,
    },
    {
      // One level (0-3) applied to all four zones of the loaded patient.
      key: 'vibration',
      kind: 'vibration',
      labelKey: 'diagnostics.admin.rows.vibration',
      descriptionKey: 'diagnostics.admin.rows.vibrationDesc',
      value: snapshot?.checked_out_regime?.FRONT?.massage_level ?? null,
      needsSession: true,
    },
    {
      // Control-loop deadband — how far a pad may drift from target before the
      // loop corrects. Pushed to the firmware (setvariable PRESSURE_TOLERANCE).
      key: 'pressureTolerance',
      kind: 'pressureTolerance',
      labelKey: 'diagnostics.admin.rows.pressureTolerance',
      descriptionKey: 'diagnostics.admin.rows.pressureToleranceDesc',
      value: settings?.pressure_tolerance_mmhg ?? null,
      needsSession: false,
    },
    {
      // The clinical pressure ceiling (app setting, device-independent).
      key: 'defaults',
      kind: 'ceiling',
      labelKey: 'diagnostics.admin.rows.defaults',
      descriptionKey: 'diagnostics.admin.rows.defaultsDesc',
      value: settings?.max_pressure_mmhg ?? snapshot?.ceiling_mmhg ?? null,
      needsSession: false,
    },
    {
      key: 'trimRange',
      kind: 'trimRange',
      labelKey: 'diagnostics.admin.rows.trimRange',
      descriptionKey: 'diagnostics.admin.rows.trimRangeDesc',
      value: settings?.trim_range_pct ?? snapshot?.trim_range_pct ?? null,
      needsSession: false,
    },
    {
      key: 'massageSeconds',
      kind: 'massageSeconds',
      labelKey: 'diagnostics.admin.rows.massageSeconds',
      descriptionKey: 'diagnostics.admin.rows.massageSecondsDesc',
      value: settings?.default_massage_seconds ?? null,
      needsSession: false,
    },
  ];
}

/** The mockup shows ten rows; the tail is blank. */
export const TABLE_ROWS = 10;
