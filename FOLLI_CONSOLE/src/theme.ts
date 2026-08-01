/**
 * Design tokens for the console_ui_05 screens.
 *
 * Colours are the vector fills read out of the design firm's PDFs with PyMuPDF,
 * and the geometry is the drawing and text-span coordinates from the same files
 * — not values eyedropped off the rasters. The PDFs subset their fonts, so the
 * glyphs do not decode, but positions and sizes are exact.
 *
 * The comps are 886 x 1890. Everything below is in those units; `scale()` maps
 * them onto the actual device, which is never exactly that size.
 */

import { ScaledSize } from 'react-native';

/** The canvas the design is drawn on. */
export const DESIGN_W = 886;
export const DESIGN_H = 1890;

/**
 * How much to shrink the 886x1890 canvas to fit a given screen.
 *
 * Fit, not fill, and one factor for both axes. The design is 2.13:1 — taller
 * than almost any real device — so scaling on width alone would push the START
 * button and its hint off the bottom. Scaling each axis independently would
 * instead squash the circular status dots and the head artwork into ovals.
 *
 * The whole canvas is scaled as a single unit, so every coordinate below stays
 * in design units and the layout can be read straight off the comps.
 */
export function canvasScale(window: ScaledSize): number {
  return Math.min(window.width / DESIGN_W, window.height / DESIGN_H);
}

export const colors = {
  // Page background. A vertical gradient in the comps, lighter at the edges.
  pageTop: '#0e3c4a',
  pageBottom: '#0a343f',

  statusBar: '#0a343f',
  // The hairline under the status bar is the one pure-white rule in the design.
  statusRule: '#ffffff',

  // Panels: a flat fill with a distinctly lighter 1px stroke.
  panel: '#165161',
  panelBorder: '#557b8a',

  text: '#e3e5e9',
  textDim: '#bec9cc',
  brand: '#7abcd3',
  brandPale: '#badfea',
  white: '#ffffff',

  // Session state, and the dot beside the big status word.
  active: '#8dc63f',
  pending: '#d5aa5a',
  stopped: '#ae3433',

  // Link state. Distinct from session state on purpose — a real device reaches
  // connected+pending and disconnected+active, which the comps never show
  // because each page happens to pair them.
  connected: '#00b065',
  disconnected: '#ee6051',

  // Controls. The button artwork carries its own colour; these are for the
  // surfaces drawn in code.
  control: '#5e5e6b',
  controlTrack: '#6d6e71',
  controlOn: '#a9aeb4',
  accent: '#2393bd',

  danger: '#ae3433',
  padlock: '#f7c024',
} as const;

/**
 * Font sizes, in design units, taken from the PDF text spans.
 *
 * The comps set Source Sans for everything except the zone-button captions and
 * the massage digits, which are Poppins. Neither is bundled yet, so these
 * render in the platform font — the sizes are right, the letterforms are not.
 */
export const font = {
  statusBar: 41.7,
  clock: 37.5,
  battery: 36.2,
  sessionWord: 87.6,
  patientLine: 41.7,
  pouchLine: 33.3,
  panelTitle: 50,
  zoneName: 91.7,
  bodyLine: 41.7,
  unit: 44,
  massageDigit: 71.4,
  hint: 41.7,
} as const;

/** Panel rectangles, straight from the PDF drawing list. */
export const layout = {
  statusBarH: 105,
  headerH: 100,

  gutter: 41,
  panelW: 804,
  panelRadius: 24,

  treatment: { y: 483, h: 525 },
  pressure: { y: 1027, h: 313 },
  massage: { y: 1359, h: 290 },

  massagePill: { x: 62, y: 1485, w: 547, h: 99 },
  // Measured off the comp: the capsule body spans x 205..637, y 1674..1814.
  primaryButton: { y: 1670, w: 433, h: 140 },
  hintY: 1818,
} as const;
