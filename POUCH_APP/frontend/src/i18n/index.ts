import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';

/**
 * All user-facing copy lives in ./locales. No literal strings in components.
 *
 * Adding a locale is a two-line change here plus one JSON file — the keys are
 * already namespaced by screen. Hebrew is the obvious next one given the
 * deployment context; it will also need `dir="rtl"` on <html>, which is why
 * `direction` is exposed on the resource bundle rather than hardcoded in CSS.
 */
export const SUPPORTED_LOCALES = ['en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: {
    // React already escapes; double-escaping mangles values like "•••••6782".
    escapeValue: false,
  },
  returnNull: false,
});

export default i18n;
