import type { ReactNode } from 'react'

interface PageHeadingProps {
  title: string
  description?: ReactNode
  icon?: ReactNode
}

/** Titolo di pagina: `#page-title` riceve il focus a ogni cambio di pagina (vedi RouteAnnouncer). */
const PageHeading = ({ title, description, icon }: PageHeadingProps) => (
  <div className="mb-7 grid gap-2">
    {icon && (
      <span className="mb-2 inline-flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">{icon}</span>
    )}
    <h1 id="page-title" tabIndex={-1} className="text-[1.65rem] leading-tight font-semibold tracking-tight outline-none">
      {title}
    </h1>
    {description && <p className="text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
  </div>
)

export default PageHeading
