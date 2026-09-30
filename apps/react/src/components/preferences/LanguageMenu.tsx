import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { isLocale, setLocale, type Locale } from '@/lib/i18n'

interface LanguageOption {
  value: Locale
  label: string
}

// I nomi delle lingue restano nella loro lingua, così chi non capisce l'altra la riconosce
const LANGUAGES: LanguageOption[] = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
]

const LanguageMenu = () => {
  const { t, i18n } = useTranslation()
  const current = LANGUAGES.find((language) => language.value === i18n.language) ?? LANGUAGES[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" aria-label={t('preferences.currentLanguage', { language: current.label })}>
          <Languages aria-hidden="true" />
          <span className="text-[13px] font-semibold uppercase">{current.value}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>{t('preferences.language')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current.value}
          onValueChange={(value) => {
            if (isLocale(value)) void setLocale(value)
          }}
        >
          {LANGUAGES.map((language) => (
            <DropdownMenuRadioItem key={language.value} value={language.value} lang={language.value}>
              {language.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default LanguageMenu
