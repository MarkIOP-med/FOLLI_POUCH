import { CANVAS_HEIGHT, CANVAS_WIDTH, useCanvasScale } from './AppFrame.lib';
import { MockupOverlay } from './MockupOverlay';
import type { AppFrameProps } from './AppFrame.types';
import './AppFrame.scss';

/**
 * Fixed 1920x1200 design canvas, scaled to fit the viewport.
 *
 * Everything inside positions in design coordinates taken straight from the
 * mockups, so the rendered result is proportionally identical to the source at
 * any 16:10 resolution.
 */
export function AppFrame({ children }: AppFrameProps) {
  const scale = useCanvasScale();

  return (
    <div className="app-frame">
      <div
        className="app-frame__canvas"
        style={{ '--canvas-scale': scale } as React.CSSProperties}
        role="application"
        aria-label="FOLLI diagnostics"
        data-canvas={`${CANVAS_WIDTH}x${CANVAS_HEIGHT}`}
      >
        {/* Drawn before the screen content: this is the lit interior every
            panel sits on, not an overlay. */}
        <div className="app-frame__interior" />
        {children}
        {import.meta.env.DEV && <MockupOverlay />}
      </div>
    </div>
  );
}
