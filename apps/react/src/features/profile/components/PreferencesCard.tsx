import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import ProfileCard from '@/features/profile/components/ProfileCard'
import { useChangeAccountLocale } from '@/features/profile/useAccountLocale'
import { isLocale, type Locale } from '@/lib/i18n'

interface LanguageOption {
  value: Locale
  label: string
}

// I nomi delle lingue restano nella loro lingua, come nel menu in alto
const LANGUAGES: LanguageOption[] = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
]

type ThemeValue = 'light' | 'dark' | 'system'

const THEMES: { value: ThemeValue; labelKey: string }[] = [
  { value: 'light', labelKey: 'preferences.themeLight' },
  { value: 'dark', labelKey: 'preferences.themeDark' },
  { value: 'system', labelKey: 'preferences.themeSystem' },
]

const isThemeValue = (value: unknown): value is ThemeValue => value === 'light' || value === 'dark' || value === 'system'

/** Lingua (salvata sull'account) e tema (per dispositivo, come il menu in alto). */
const PreferencesCard = () => {
  const { t, i18n: active } = useTranslation()
  const { theme, setTheme } = useTheme()
  const changeLocale = useChangeAccountLocale()
  const locale = isLocale(active.language) ? active.language : 'it'
  const currentTheme = isThemeValue(theme) ? theme : 'system'

  return (
    <ProfileCard titleId="profile-preferences-title" title={t('profile.preferences.title')}>
      {/* Due colonne quando la card è a tutta larghezza; una sola nella colonna stretta di destra (da lg) */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
        <FieldSet>
          <FieldLegend variant="label">{t('profile.preferences.language')}</FieldLegend>
          <RadioGroup
            value={locale}
            onValueChange={(value) => {
              if (isLocale(value)) changeLocale(value, { confirm: true })
            }}
          >
            {LANGUAGES.map((language) => (
              <Field key={language.value} orientation="horizontal">
                <RadioGroupItem value={language.value} id={`profile-locale-${language.value}`} />
                <FieldLabel htmlFor={`profile-locale-${language.value}`} lang={language.value}>
                  {language.label}
                </FieldLabel>
              </Field>
            ))}
          </RadioGroup>
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label">{t('profile.preferences.theme')}</FieldLegend>
          <RadioGroup value={currentTheme} onValueChange={setTheme} aria-describedby="profile-theme-note">
            {THEMES.map(({ value, labelKey }) => (
              <Field key={value} orientation="horizontal">
                <RadioGroupItem value={value} id={`profile-theme-${value}`} />
                <FieldLabel htmlFor={`profile-theme-${value}`}>{t(labelKey)}</FieldLabel>
              </Field>
            ))}
          </RadioGroup>
          <FieldDescription id="profile-theme-note">{t('profile.preferences.themeNote')}</FieldDescription>
        </FieldSet>
      </div>
    </ProfileCard>
  )
}

export default PreferencesCard
