/**
 * Artwork for the redesigned diagnostics screens.
 *
 * Sourced from the design firm's delivery under SHARED_ASSETS/FOLLI_IMAGES so the
 * screens use the supplied assets rather than approximations of them — which is
 * what makes a 1:1 match achievable at all.
 */
import battery100 from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Battery_100_01.png';
import battery25 from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Battery_25_01.png';
import battery25Red from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Battery_25_RED_01.png';
import battery50 from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Battery_50_01.png';
import battery75 from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Battery_75_01.png';
import iconDiagnostics from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Diagnostics_Icon_01.png';
import iconHome from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Home_Icon_01.png';
import iconSettings from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Setting_Icon_01.png';
import iconUserData from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/User_Data_Icon_01.png';
import logoLight from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Logo_Light_01.png';

import dotGreen from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Green_Dot_01.png';
import dotRed from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Red_Dot_01.png';
import dotYellow from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Yellow_Dot_01.png';

import btnEnter from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Enter_Button_01.png';
import btnResetAll from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/reset_All_Button_01.png';
import btnSave from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Save_Button_01.png';
import btnSet from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Set_Button_01.png';
import btnStart from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Start_Button_01.png';
import btnStop from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Stop_Button_01.png';

import profileFemale from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Female_Profile_01.png';
import profileFemaleBack from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Female_Profile_BACK_01.png';
import profileFemaleEar from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Female_Profile_EAR_01.png';
import profileFemaleFront from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Female_Profile_FRONT_01.png';
import profileFemaleTemple from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Female_Profile_TEMPLE_01.png';
import profileMale from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Male_Profile_01.png';
import profileMaleBack from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Male_Profile_BACK_01.png';
import profileMaleEar from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Male_Profile_EAR_01.png';
import profileMaleFront from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Male_Profile_FRONT_01.png';
import profileMaleTemple from '@shared-assets/FOLLI_IMAGES/DIAGNOSTIC_IMAGES/Buttons/Male_Profile_TEMPLE_01.png';

import type { Zone } from '@/api/types';

export type Gender = 'male' | 'female';

export const LOGO = logoLight;

export const RAIL_ICONS = {
  home: iconHome,
  diagnostics: iconDiagnostics,
  users: iconUserData,
  settings: iconSettings,
} as const;

export type RailIcon = keyof typeof RAIL_ICONS;

export const DOTS = { green: dotGreen, red: dotRed, yellow: dotYellow } as const;

export const BUTTONS = {
  start: btnStart,
  stop: btnStop,
  set: btnSet,
  save: btnSave,
  resetAll: btnResetAll,
  enter: btnEnter,
} as const;

/** Zone-highlighted head profiles, per gender. */
export const PROFILE: Record<Gender, Record<Zone | 'NONE', string>> = {
  female: {
    NONE: profileFemale,
    FRONT: profileFemaleFront,
    TEMPLE: profileFemaleTemple,
    EAR: profileFemaleEar,
    BACK: profileFemaleBack,
  },
  male: {
    NONE: profileMale,
    FRONT: profileMaleFront,
    TEMPLE: profileMaleTemple,
    EAR: profileMaleEar,
    BACK: profileMaleBack,
  },
};

const BATTERY_STEPS: ReadonlyArray<readonly [number, string]> = [
  [87, battery100],
  [62, battery75],
  [37, battery50],
  [0, battery25],
];

/**
 * Battery artwork for a charge level, or null when the level is unknown.
 *
 * Returning null is deliberate: pouch and console battery are not reported by the
 * firmware, so the caller renders the no-data state rather than a plausible icon.
 */
export function batteryArt(percent: number | null): string | null {
  if (percent == null) return null;
  if (percent <= 25) return battery25Red;
  return BATTERY_STEPS.find(([floor]) => percent >= floor)?.[1] ?? battery25;
}
