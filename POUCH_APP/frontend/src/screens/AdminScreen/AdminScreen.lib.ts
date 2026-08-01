import type { DeviceSnapshot } from '@/api/types';

export interface AdminAction {
  key: string;
  labelKey: string;
  descriptionKey: string;
  /** Current value, or null when nothing supplies one. */
  value: number | string | null;
  editable: boolean;
}

/** Rows the mockup lists, bound to what the snapshot actually knows. */
export function adminActions(snapshot: DeviceSnapshot | null): AdminAction[] {
  const zone = (name: string) =>
    snapshot?.zones.find((z) => z.zone === name)?.prescribed_mmhg ?? null;

  return [
    {
      key: 'front',
      labelKey: 'diagnostics.admin.rows.front',
      descriptionKey: 'diagnostics.admin.rows.frontDesc',
      value: zone('FRONT'),
      editable: true,
    },
    {
      key: 'temple',
      labelKey: 'diagnostics.admin.rows.temple',
      descriptionKey: 'diagnostics.admin.rows.templeDesc',
      value: zone('TEMPLE'),
      editable: true,
    },
    {
      key: 'ear',
      labelKey: 'diagnostics.admin.rows.ear',
      descriptionKey: 'diagnostics.admin.rows.earDesc',
      value: zone('EAR'),
      editable: true,
    },
    {
      key: 'back',
      labelKey: 'diagnostics.admin.rows.back',
      descriptionKey: 'diagnostics.admin.rows.backDesc',
      value: zone('BACK'),
      editable: true,
    },
    {
      key: 'manifold',
      labelKey: 'diagnostics.admin.rows.manifold',
      descriptionKey: 'diagnostics.admin.rows.manifoldDesc',
      value: snapshot?.manifold_target_mmhg ?? null,
      editable: true,
    },
    {
      key: 'vibration',
      labelKey: 'diagnostics.admin.rows.vibration',
      descriptionKey: 'diagnostics.admin.rows.vibrationDesc',
      value: snapshot?.zones[0]?.massage_level ?? null,
      editable: true,
    },
    {
      // Listed in the mockup but undefined in the protocol and unimplemented.
      key: 'collaborative',
      labelKey: 'diagnostics.admin.rows.collaborative',
      descriptionKey: 'diagnostics.admin.rows.collaborativeDesc',
      value: null,
      editable: false,
    },
    {
      key: 'defaults',
      labelKey: 'diagnostics.admin.rows.defaults',
      descriptionKey: 'diagnostics.admin.rows.defaultsDesc',
      value: snapshot?.ceiling_mmhg ?? null,
      editable: true,
    },
  ];
}

/** The mockup shows ten rows; the tail is blank. */
export const TABLE_ROWS = 10;
