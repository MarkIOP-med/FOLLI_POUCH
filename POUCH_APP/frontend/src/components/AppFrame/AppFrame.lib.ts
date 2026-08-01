import { useEffect, useState } from 'react';

/** The design canvas — the PDFs are authored at exactly this size. */
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1200;

/**
 * Scale factor that fits the 1920x1200 canvas inside the viewport without
 * distorting it.
 *
 * The whole screen scales as one unit rather than reflowing, which is what makes
 * a genuine 1:1 match possible: on a 16:10 tablet every element lands on the same
 * proportional coordinates the designer drew, at any resolution. A non-16:10
 * viewport letterboxes rather than rearranging.
 */
/** Fit factor for the current viewport. */
function measureScale(): number {
  if (typeof window === 'undefined') return 1;
  return Math.min(
    window.innerWidth / CANVAS_WIDTH,
    window.innerHeight / CANVAS_HEIGHT,
  );
}

export function useCanvasScale(): number {
  // Measured in the initialiser, not in an effect. Starting at 1 and correcting
  // afterwards paints one frame with the canvas at full 1920x1200 — on a smaller
  // viewport that is a visible flash of oversized, clipped UI every time the
  // canvas mounts, which is once per navigation.
  const [scale, setScale] = useState(measureScale);

  useEffect(() => {
    const measure = () => setScale(measureScale());

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  return scale;
}
