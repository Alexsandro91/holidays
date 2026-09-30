import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'
import Logo from '@/components/brand/Logo'
import SkipLink from '@/components/layout/SkipLink'
import TeamCalendar from '@/components/layout/TeamCalendar'
import LanguageMenu from '@/components/preferences/LanguageMenu'
import ThemeMenu from '@/components/preferences/ThemeMenu'
import { APP_NAME } from '@/lib/appName'

const CURRENT_YEAR = new Date().getFullYear()

const AuthLayout = () => {
  const { t } = useTranslation()

  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <SkipLink />
      <aside className="hidden flex-col justify-between bg-primary-soft px-12 py-10 text-primary-soft-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <Logo className="size-7" />
          <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
        </div>
        <div className="grid max-w-md gap-8">
          <div className="grid gap-3">
            <p className="text-[2.1rem] leading-[1.1] font-semibold tracking-tight">{t('brand.tagline')}</p>
            <p className="text-[15px] leading-relaxed opacity-80">{t('brand.subtitle')}</p>
          </div>
          <TeamCalendar />
        </div>
        <p className="text-[12.5px]">
          © {CURRENT_YEAR} {APP_NAME}
        </p>
      </aside>
      <div className="flex min-h-svh flex-col px-4 sm:px-8">
        <header className="flex items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-2 lg:invisible">
            <Logo className="size-6 text-primary" />
            <span className="font-semibold tracking-tight">{APP_NAME}</span>
          </div>
          <div className="flex items-center gap-1">
            <LanguageMenu />
            <ThemeMenu />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center pt-4 pb-16 outline-none">
          <div className="w-full max-w-[400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default AuthLayout
