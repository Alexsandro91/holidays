import type { FormEvent, ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card'

interface ProfileCardProps {
  /** id del titolo: dà il nome alla sezione (landmark `region`) */
  titleId: string
  title: string
  description?: string
  children: ReactNode
  /** Con un form: contenuto e piede stanno nello stesso `<form>`, così il pulsante del piede lo invia */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  /** Pulsante di salvataggio, in fondo alla card come nei dialog */
  footer?: ReactNode
}

/** Blocco della pagina Profilo: una sezione con titolo di livello 2, per chi naviga per titoli o per regioni. */
const ProfileCard = ({ titleId, title, description, children, onSubmit, footer }: ProfileCardProps) => {
  const body = (
    <>
      <CardContent>{children}</CardContent>
      {/* Come il piede dei dialog: a destra su schermi larghi, a tutta larghezza sul telefono */}
      {footer && <CardFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</CardFooter>}
    </>
  )

  return (
    <section aria-labelledby={titleId}>
      <Card>
        <CardHeader>
          <h2 id={titleId} className="text-base leading-snug font-semibold">
            {title}
          </h2>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        {onSubmit ? (
          // Stessa spaziatura verticale della card, che il form altrimenti interromperebbe
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-(--card-spacing)">
            {body}
          </form>
        ) : (
          body
        )}
      </Card>
    </section>
  )
}

export default ProfileCard
