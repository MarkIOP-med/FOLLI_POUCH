import type { ReactNode } from 'react';

import { AppFrame } from '@/components/AppFrame';
import { HeaderBand } from '@/components/HeaderBand';
import type { HeaderBandProps } from '@/components/HeaderBand';
import { IconRail } from '@/components/IconRail';
import { StatusBar } from '@/components/StatusBar';
import type { RailIcon } from '@/domain/diagnosticsAssets';

export interface DiagLayoutProps extends HeaderBandProps {
  active: RailIcon;
  children: ReactNode;
}

/**
 * Chrome shared by all four redesigned screens: scaling canvas, status bar,
 * icon rail and header band. Screens supply only their own content, positioned
 * in design coordinates.
 */
export function DiagLayout({ active, children, ...header }: DiagLayoutProps) {
  return (
    <AppFrame>
      <StatusBar batteryPercent={null} online={header.connected} />
      <HeaderBand {...header} />
      <IconRail active={active} />
      {children}
    </AppFrame>
  );
}
