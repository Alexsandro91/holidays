import type { ReactNode } from 'react'
import { NavLink, useMatch, useResolvedPath } from 'react-router'
import { SidebarMenuButton } from '@/components/ui/sidebar'

interface SidebarNavLinkProps {
  to: string
  label: string
  icon: ReactNode
  /** true quando la voce è attiva solo sul percorso esatto (es. la home) */
  end?: boolean
  /** Numero mostrato accanto alla voce (es. richieste da approvare); non c'è se manca o è 0 */
  badge?: number
  /** Nome accessibile che comprende il numero, quando `badge` c'è */
  badgeLabel?: string
}

/**
 * Voce del menu laterale: NavLink imposta aria-current="page", data-active porta lo stile della voce attiva
 * (sfondo pieno, grassetto e barra a sinistra, vedi sidebarMenuButtonVariants).
 */
const SidebarNavLink = ({ to, label, icon, end = false, badge = 0, badgeLabel }: SidebarNavLinkProps) => {
  const resolved = useResolvedPath(to)
  const active = useMatch({ path: resolved.pathname, end }) !== null

  return (
    <SidebarMenuButton asChild isActive={active} tooltip={label}>
      <NavLink to={to} end={end} aria-label={badge > 0 ? badgeLabel : undefined}>
        {icon}
        <span>{label}</span>
        {badge > 0 && (
          <span aria-hidden="true" className="ml-auto min-w-5 rounded-full bg-primary px-1.5 text-center text-xs font-medium tabular-nums text-primary-foreground group-data-[collapsible=icon]:hidden">
            {badge}
          </span>
        )}
      </NavLink>
    </SidebarMenuButton>
  )
}

export default SidebarNavLink
