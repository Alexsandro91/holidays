import type { ReactNode } from 'react'
import { NavLink, useMatch, useResolvedPath } from 'react-router'
import { SidebarMenuButton } from '@/components/ui/sidebar'

interface SidebarNavLinkProps {
  to: string
  label: string
  icon: ReactNode
  /** true quando la voce è attiva solo sul percorso esatto (es. la home) */
  end?: boolean
}

/**
 * Voce del menu laterale: NavLink imposta aria-current="page", data-active porta lo stile della voce attiva
 * (sfondo pieno, grassetto e barra a sinistra, vedi sidebarMenuButtonVariants).
 */
const SidebarNavLink = ({ to, label, icon, end = false }: SidebarNavLinkProps) => {
  const resolved = useResolvedPath(to)
  const active = useMatch({ path: resolved.pathname, end }) !== null

  return (
    <SidebarMenuButton asChild isActive={active} tooltip={label}>
      <NavLink to={to} end={end}>
        {icon}
        <span>{label}</span>
      </NavLink>
    </SidebarMenuButton>
  )
}

export default SidebarNavLink
