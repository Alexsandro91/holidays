import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
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

interface ThemeOption {
  value: 'light' | 'dark' | 'system'
  labelKey: string
  icon: LucideIcon
}

const THEMES: ThemeOption[] = [
  { value: 'light', labelKey: 'preferences.themeLight', icon: Sun },
  { value: 'dark', labelKey: 'preferences.themeDark', icon: Moon },
  { value: 'system', labelKey: 'preferences.themeSystem', icon: Monitor },
]

const ThemeMenu = () => {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const current = THEMES.find((option) => option.value === theme) ?? THEMES[2]
  const CurrentIcon = current.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={t('preferences.currentTheme', { theme: t(current.labelKey) })}>
          <CurrentIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t('preferences.theme')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={current.value} onValueChange={setTheme}>
          {THEMES.map(({ value, labelKey, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon aria-hidden="true" />
              {t(labelKey)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ThemeMenu
