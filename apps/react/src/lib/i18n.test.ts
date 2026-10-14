import { describe, expect, it } from 'vitest'
import i18n, { detectLocale, setLocale } from '@/lib/i18n'

describe('i18n', () => {
  it('uses Italian by default', () => {
    expect(i18n.t('login.title')).toBe('Accedi')
  })

  it('switches language, updates <html lang> and remembers the choice', async () => {
    await setLocale('en')

    expect(i18n.t('login.title')).toBe('Sign in')
    expect(document.documentElement.lang).toBe('en')
    expect(detectLocale()).toBe('en')
  })

  // Blocchi dopo troppi tentativi: "1 secondo", mai "1 secondi"
  it.each([
    ['login.locked', 'Troppi tentativi. Potrai riprovare tra 1 secondo.', 'Troppi tentativi. Potrai riprovare tra 2 secondi.', 'Too many attempts. You can try again in 1 second.', 'Too many attempts. You can try again in 2 seconds.'],
    ['verify.throttled', 'Troppi tentativi. Riprova tra 1 secondo.', 'Troppi tentativi. Riprova tra 2 secondi.', 'Too many attempts. Try again in 1 second.', 'Too many attempts. Try again in 2 seconds.'],
    ['reset.throttled', 'Troppi tentativi. Potrai riprovare tra 1 secondo.', 'Troppi tentativi. Potrai riprovare tra 2 secondi.', 'Too many attempts. You can try again in 1 second.', 'Too many attempts. You can try again in 2 seconds.'],
    ['invitation.throttled', 'Troppi tentativi. Potrai riprovare tra 1 secondo.', 'Troppi tentativi. Potrai riprovare tra 2 secondi.', 'Too many attempts. You can try again in 1 second.', 'Too many attempts. You can try again in 2 seconds.'],
    ['forgot.throttled', 'Troppe richieste. Potrai riprovare tra 1 minuto.', 'Troppe richieste. Potrai riprovare tra 2 minuti.', 'Too many requests. You can try again in 1 minute.', 'Too many requests. You can try again in 2 minutes.'],
  ])('uses singular and plural for %s', (key, itOne, itOther, enOne, enOther) => {
    expect(i18n.t(key, { count: 1, lng: 'it' })).toBe(itOne)
    expect(i18n.t(key, { count: 2, lng: 'it' })).toBe(itOther)
    expect(i18n.t(key, { count: 1, lng: 'en' })).toBe(enOne)
    expect(i18n.t(key, { count: 2, lng: 'en' })).toBe(enOther)
  })
})
