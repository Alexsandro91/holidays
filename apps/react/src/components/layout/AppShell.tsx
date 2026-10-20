import { CalendarDays, ChevronsUpDown, House, LogOut, ListChecks, MapPin, Settings, ShieldCheck, UserRound, Users } from 'lucide-react'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet } from 'react-router'
import { toast } from 'sonner'
import Logo from '@/components/brand/Logo'
import FullPageLoader from '@/components/layout/FullPageLoader'
import SessionExpiryDialog from '@/components/layout/SessionExpiryDialog'
import SidebarNavLink from '@/components/layout/SidebarNavLink'
import SkipLink from '@/components/layout/SkipLink'
import LanguageMenu from '@/components/preferences/LanguageMenu'
import ThemeMenu from '@/components/preferences/ThemeMenu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { isAlreadySignedOut, useCurrentUser, useLogout } from '@/features/auth/api'
import { useChangeAccountLocale, useSyncAccountLocale } from '@/features/profile/useAccountLocale'
import { APP_NAME } from '@/lib/appName'
import { initials } from '@/lib/initials'
import { useRouteTitleKey } from '@/lib/routeTitle'

const AppShell = () => {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const logout = useLogout()
  const titleKey = useRouteTitleKey()
  const changeLocale = useChangeAccountLocale()
  useSyncAccountLocale(user?.id, user?.locale)

  // ProtectedRoute garantisce l'utente: questo ramo copre solo l'istante del logout
  if (!user) return null

  return (
    <SidebarProvider>
      <SkipLink />
      {/* Avviso di scadenza della sessione (WCAG 2.2.1): uno solo per tutta l'area riservata */}
      <SessionExpiryDialog session={user.session} />
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex h-12 items-center gap-2.5 px-1">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Logo className="size-5" />
            </span>
            <span className="font-semibold tracking-tight group-data-[collapsible=icon]:hidden">{APP_NAME}</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label={t('nav.main')}>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarNavLink to="/" end label={t('nav.home')} icon={<House aria-hidden="true" />} />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton disabled aria-disabled="true" tooltip={t('nav.leave')}>
                      <CalendarDays aria-hidden="true" />
                      <span>{t('nav.leave')}</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>{t('nav.soon')}</SidebarMenuBadge>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {/* Gestione: utenti per responsabili e admin, amministratori solo per gli admin (spec §2) */}
            {(user.role === 'manager' || user.role === 'admin') && (
              <SidebarGroup>
                <SidebarGroupLabel>{t('nav.management')}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarNavLink to="/users" label={t('nav.users')} icon={<Users aria-hidden="true" />} />
                    </SidebarMenuItem>
                    {user.role === 'admin' && (
                      <>
                        <SidebarMenuItem>
                          <SidebarNavLink to="/admin/administrators" label={t('nav.administrators')} icon={<ShieldCheck aria-hidden="true" />} />
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                          <SidebarNavLink to="/admin/locations" label={t('nav.locations')} icon={<MapPin aria-hidden="true" />} />
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                          <SidebarNavLink to="/admin/absence-types" label={t('nav.absenceTypes')} icon={<ListChecks aria-hidden="true" />} />
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                          <SidebarNavLink to="/admin/settings" label={t('nav.settings')} icon={<Settings aria-hidden="true" />} />
                        </SidebarMenuItem>
                      </>
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </nav>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg">
                    <span
                      aria-hidden="true"
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground"
                    >
                      {initials(user.name)}
                    </span>
                    {/* Il nome accessibile contiene il testo visibile (WCAG 2.5.3) */}
                    <span className="sr-only">{t('account.menu')}: </span>
                    <span className="grid min-w-0 flex-1 text-left leading-tight">
                      <span className="truncate text-sm font-medium">{user.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user.role_label}</span>
                    </span>
                    <ChevronsUpDown className="ml-auto size-4" aria-hidden="true" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="min-w-56">
                  <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile">
                      <UserRound aria-hidden="true" />
                      {t('account.profile')}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      logout.mutate(undefined, {
                        onError: (error) => {
                          if (!isAlreadySignedOut(error)) toast.error(t('account.logoutError'))
                        },
                      })
                    }
                  >
                    <LogOut aria-hidden="true" />
                    {t('account.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      {/* SidebarInset rende già l'unico <main> della pagina: è il bersaglio dello skip link.
          min-w-0: da figlio flex non si allarga sul contenuto, così una tabella larga scorre nel suo contenitore e non la pagina */}
      <SidebarInset id="main" tabIndex={-1} className="min-w-0 outline-none">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-1 h-5" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">{titleKey ? t(titleKey) : ''}</p>
          <LanguageMenu onChange={changeLocale} />
          <ThemeMenu />
        </header>
        {/* Senza larghezza massima: le tabelle usano tutto lo spazio, le pagine di solo testo hanno la loro (es. HomePage) */}
        <div className="w-full min-w-0 flex-1 px-4 pt-6 pb-16 md:px-8 md:pt-8">
          {/* Pagine caricate a richiesta (vedi routes.tsx): il loader resta dentro il layout */}
          <Suspense fallback={<FullPageLoader className="min-h-60" />}>
            <Outlet />
          </Suspense>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default AppShell
