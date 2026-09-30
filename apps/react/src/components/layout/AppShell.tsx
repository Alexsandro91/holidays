import { CalendarDays, ChevronsUpDown, House, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import Logo from '@/components/brand/Logo'
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
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { useCurrentUser, useLogout } from '@/features/auth/api'
import { APP_NAME } from '@/lib/appName'
import { initials } from '@/lib/initials'
import { useRouteTitleKey } from '@/lib/routeTitle'

const AppShell = () => {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const logout = useLogout()
  const titleKey = useRouteTitleKey()

  // ProtectedRoute garantisce l'utente: questo ramo copre solo l'istante del logout
  if (!user) return null

  return (
    <SidebarProvider>
      <SkipLink />
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
                    <SidebarMenuButton asChild tooltip={t('nav.home')}>
                      <NavLink to="/" end>
                        <House aria-hidden="true" />
                        <span>{t('nav.home')}</span>
                      </NavLink>
                    </SidebarMenuButton>
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
                  <DropdownMenuItem onSelect={() => logout.mutate()}>
                    <LogOut aria-hidden="true" />
                    {t('account.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      {/* SidebarInset rende già l'unico <main> della pagina: è il bersaglio dello skip link */}
      <SidebarInset id="main" tabIndex={-1} className="outline-none">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-1 h-5" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">{titleKey ? t(titleKey) : ''}</p>
          <LanguageMenu />
          <ThemeMenu />
        </header>
        <div className="w-full max-w-6xl flex-1 px-4 pt-6 pb-16 md:px-8 md:pt-8">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default AppShell
