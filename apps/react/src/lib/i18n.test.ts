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
})
