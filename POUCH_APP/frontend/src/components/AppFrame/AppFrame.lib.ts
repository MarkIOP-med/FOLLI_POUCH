import { useEffect, useState, type RefObject } from 'react';

/** The design canvas — the PDFs are authored at exactly this size. */
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1200;

/**
 * The floor the canvas is allowed to shrink to before it stops shrinking and
 * starts overflowing instead.
 *
 * The design's body run is 32 canvas px, so 0.55 renders it at 17.6 CSS px and
 * the 24px small run at 13.2 — about the point where a 300-weight face over a
 * dark ground stops being readable. Below the floor, continuing to shrink buys
 * nothing: at a phone's 390px the fit factor is 0.203, which draws the whole
 * screen 244px tall in body text under 7px. Pinning the scale and letting the
 * canvas be panned keeps it legible, which is the same trade every fixed-width
 * desktop site makes on a phone.
 *
 * Above the floor nothing changes at all. Every viewport that can contain the
 * canvas at >= 0.55 gets exactly the contain-fit it got before, so the 1920x1200
 * kiosk tablet and every laptop-sized window render byte-identically.
 */
export const MIN_SCALE = 0.55;

export interface CanvasFit {
  /** Factor the 1920x1200 canvas is drawn at. */
  scale: number;
  /** True when the canvas is bigger than its container and has to be panned. */
  overflows: boolean;
}

/**
 * Fit policy for a container of the given size.
 *
 * Contain-fit — the largest scale that shows the whole canvas undistorted — is
 * the design-correct answer and stays the default. A non-16:10 container
 * letterboxes rather than rearranging, because every screen positions in
 * measured canvas coordinates and reflowing them would be a different design.
 *
 * The one departure is the floor above: past it the canvas overflows and the
 * shell scrolls, rather than shrinking to an unreadable postage stamp behind
 * `overflow: hidden` with no way out.
 */
export function fitCanvas(width: number, height: number): CanvasFit {
  const contain = Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT);
  const scale = Math.max(contain, MIN_SCALE);

  // Half a pixel of slack: at the floor boundary the scaled canvas and the
  // container are the same size to within rounding, and treating that as
  // overflow would flag a pan state for a canvas that actually fits.
  const overflows =
    CANVAS_WIDTH * scale > width + 0.5 || CANVAS_HEIGHT * scale > height + 0.5;

  return { scale, overflows };
}

/**
 * Layout-viewport size, used until the container has mounted and can be measured
 * directly.
 *
 * `documentElement.clientWidth/Height` rather than `visualViewport`: the visual
 * viewport shrinks when the user pinch-zooms, so measuring it would re-scale the
 * canvas to undo the zoom — and on a small screen pinch-zoom is exactly the
 * recovery this whole change is meant to preserve.
 */
function measureViewport(): { width: number; height: number } {
  if (typeof document === 'undefined') {
    return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };
  }
  const root = document.documentElement;
  return { width: root.clientWidth, height: root.clientHeight };
}

/**
 * Fit for the given scroll container, kept current as it resizes.
 *
 * Measures the container rather than `window.innerWidth`. The container's
 * content box excludes its own scrollbar, so once the canvas can overflow the
 * scale is computed from the space actually available; measuring the window
 * would size the canvas to a width the scrollbar has already taken back.
 * `ResizeObserver` also catches what `window.resize` reports inconsistently —
 * browser zoom, devtools docking, a split-screen drag.
 */
export function useCanvasFit(ref: RefObject<HTMLElement>): CanvasFit {
  // Measured in the initialiser, not in an effect. Starting at 1 and correcting
  // afterwards paints one frame with the canvas at full 1920x1200 — on a smaller
  // viewport that is a visible flash of oversized, clipped UI every time the
  // canvas mounts, which is once per navigation.
  const [fit, setFit] = useState<CanvasFit>(() => {
    const { width, height } = measureViewport();
    return fitCanvas(width, height);
  });

  useEffect(() => {
    const element = ref.current;

    const measure = () => {
      const { width, height } = element
        ? { width: element.clientWidth, height: element.clientHeight }
        : measureViewport();
      const next = fitCanvas(width, height);
      // Compared rather than set unconditionally: ResizeObserver fires on every
      // frame of a window drag, and re-rendering four absolutely-positioned
      // screens for an unchanged scale is the difference between a smooth resize
      // and a stuttering one.
      setFit((prev) =>
        prev.scale === next.scale && prev.overflows === next.overflows ? prev : next,
      );
    };

    measure();

    let observer: ResizeObserver | undefined;
    if (element && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(element);
    }

    // The observer covers container resizes; these cover the cases where the
    // container's box is unchanged but the usable area is not — a rotated tablet,
    // and a mobile URL bar sliding away. visualViewport is only a trigger to
    // re-measure here, never the measurement itself (see measureViewport).
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.visualViewport?.addEventListener('resize', measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [ref]);

  return fit;
}
