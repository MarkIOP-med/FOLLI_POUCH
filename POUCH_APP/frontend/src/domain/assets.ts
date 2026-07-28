/**
 * The shared asset language, resolved for the web app.
 *
 * Same artwork the console renders, addressed by the same logical names as
 * SHARED_ASSETS/manifest.json — so a zone tile can never mean one thing here and
 * another thing on the patient's screen.
 *
 * Zone keys are the canonical firmware map (index = firmware channel), deliberately
 * not the console protocol doc's Forehead / L-Temple / R-Temple / Back.
 */
import backOff from '@shared-assets/buttons/back_off.png';
import backOn from '@shared-assets/buttons/back_on.png';
import earsOff from '@shared-assets/buttons/ears_off.png';
import earsOn from '@shared-assets/buttons/ears_on.png';
import frontOff from '@shared-assets/buttons/front_off.png';
import frontOn from '@shared-assets/buttons/front_on.png';
import tileBack from '@shared-assets/buttons/head_zones_back.png';
import tileEars from '@shared-assets/buttons/head_zones_ears.png';
import tileFront from '@shared-assets/buttons/head_zones_front.png';
import tileTemples from '@shared-assets/buttons/head_zones_temples.png';
import minus from '@shared-assets/buttons/minus.png';
import plus from '@shared-assets/buttons/plus.png';
import setOff from '@shared-assets/buttons/set_off.png';
import setOn from '@shared-assets/buttons/set_on.png';
import startOff from '@shared-assets/buttons/start_off.png';
import startOn from '@shared-assets/buttons/start_on.png';
import stopOff from '@shared-assets/buttons/stop_off.png';
import stopOn from '@shared-assets/buttons/stop_on.png';
import templesOff from '@shared-assets/buttons/temples_off.png';
import templesOn from '@shared-assets/buttons/temples_on.png';
import headAllZones from '@shared-assets/head/head_zones_all.png';
import headHero from '@shared-assets/head/head-hero.png';

import type { Zone } from '@/api/types';

export const ZONE_ART: Record<Zone, { tile: string; on: string; off: string }> = {
  FRONT: { tile: tileFront, on: frontOn, off: frontOff },
  TEMPLE: { tile: tileTemples, on: templesOn, off: templesOff },
  EAR: { tile: tileEars, on: earsOn, off: earsOff },
  BACK: { tile: tileBack, on: backOn, off: backOff },
};

export const CONTROL_ART = {
  startOn,
  startOff,
  stopOn,
  stopOff,
  setOn,
  setOff,
  plus,
  minus,
};

export const HEAD_ART = {
  allZones: headAllZones,
  hero: headHero,
};
