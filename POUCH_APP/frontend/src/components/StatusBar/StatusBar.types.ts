export interface StatusBarProps {
  /** Tablet battery level. Null renders the no-data state. */
  batteryPercent?: number | null;
  /** Network reachability of the pouch server, not the internet. */
  online?: boolean;
}
