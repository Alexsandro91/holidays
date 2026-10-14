import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'

interface ProfileCardProps {
  /** id del titolo: dà il nome alla sezione (landmark `region`) */
  titleId: string
  title: string
  description?: string
  children: ReactNode
}

/** Blocco della pagina Profilo: una sezione con titolo di livello 2, per chi naviga per titoli o per regioni. */
const ProfileCard = ({ titleId, title, description, children }: ProfileCardProps) => (
  <section aria-labelledby={titleId}>
    <Card>
      <CardHeader>
        <h2 id={titleId} className="text-base leading-snug font-semibold">
          {title}
        </h2>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  </section>
)

export default ProfileCard
