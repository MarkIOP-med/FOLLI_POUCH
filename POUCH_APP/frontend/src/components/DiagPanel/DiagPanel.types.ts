import type { CSSProperties, ReactNode } from 'react';

export interface DiagPanelProps {
  title: string;
  children: ReactNode;
  /** Absolute placement inside the 1920x1200 canvas. */
  style: CSSProperties;
  className?: string;
  /**
   * Horizontal nudge for the caption, in canvas px.
   *
   * Captions are centred in their panel everywhere except the User Info panel
   * on PAGE_03 and the V-Nodes panel on PAGE_02, where the design draws them
   * ~71px left of centre. Reproduced rather than corrected, but kept as an
   * explicit per-panel value so it is obvious this is tracking the mockup and
   * not an accident.
   */
  captionOffsetX?: number;
}
