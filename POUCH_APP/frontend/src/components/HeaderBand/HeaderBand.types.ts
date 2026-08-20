export interface HeaderUser {
  id: number;
  name: string;
  nationalId: string | null;
}

export interface HeaderBandProps {
  /** Shown after the screen title, e.g. "v2.4.3". */
  version: string;
  users: HeaderUser[];
  selectedUserId: number | null;
  onSelectUser: (id: number | null) => void;
  /** Renders the user selector read-only (screens where selection has no meaning). */
  selectDisabled?: boolean;

  consoleId: string | null;
  pouchId: string | null;

  /** Link state of the pouch. */
  connected: boolean;

  /** Seconds elapsed in the running session, or null when none. */
  sessionElapsedS: number | null;

  /**
   * Battery levels. Null renders the no-data state — the firmware reports no
   * battery for either unit, and inventing a number on a clinical screen is not
   * an option.
   */
  pouchBatteryPercent?: number | null;
  consoleBatteryPercent?: number | null;
}
