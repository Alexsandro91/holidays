import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/locales/en.json'
import it from '@/locales/it.json'

export type Locale = 'it' | 'en'

const STORAGE_KEY = 'holidays-locale'

export const isLocale = (value: unknown): value is Locale => value === 'it' || value === 'en'

/** Lingua iniziale: scelta salvata, poi lingua del browser se supportata, altrimenti italiano. */
export const detectLocale = (): Locale => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isLocale(stored)) return stored
  } catch {
    // localStorage non disponibile (es. navigazione privata): si usa la lingua del browser
  }
  const browser = window.navigator.language.slice(0, 2)
  return isLocale(browser) ? browser : 'it'
}

export const setLocale = async (locale: Locale): Promise<void> => {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Preferenza non salvata: vale fino alla chiusura della pagina
  }
  await i18n.changeLanguage(locale)
}

i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language
})

void i18n.use(initReactI18next).init({
  resources: { it: { translation: it }, en: { translation: en } },
  lng: detectLocale(),
  fallbackLng: 'it',
  supportedLngs: ['it', 'en'],
  interpolation: { escapeValue: false },
})

export default i18n
