import { useRef } from 'react';

import { CANVAS_HEIGHT, CANVAS_WIDTH, useCanvasFit } from './AppFrame.lib';
import { MockupOverlay } from './MockupOverlay';
import type { AppFrameProps } from './AppFrame.types';
import './AppFrame.scss';

/**
 * Fixed 1920x1200 design canvas, scaled to fit the viewport.
 *
 * Everything inside positions in design coordinates taken straight from the
 * mockups, so the rendered result is proportionally identical to the source at
 * any 16:10 resolution. Off that ratio it letterboxes rather than rearranging —
 * reflowing measured coordinates would be a different design.
 *
 * Three boxes, because a `transform` does not change layout size: the frame
 * scrolls, the sizer occupies the canvas's *scaled* footprint so the frame has
 * something real to scroll, and the canvas itself stays 1920x1200 and is scaled
 * from its top-left corner inside it.
 */
export function AppFrame({ children }: AppFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const { scale, overflows } = useCanvasFit(frameRef);

  return (
    <div
      ref={frameRef}
      className="app-frame"
      style={{ '--canvas-scale': scale } as React.CSSProperties}
      data-fit={overflows ? 'pan' : 'contain'}
    >
      <div className="app-frame__sizer">
        <div
          className="app-frame__canvas"
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
    </div>
  );
}
