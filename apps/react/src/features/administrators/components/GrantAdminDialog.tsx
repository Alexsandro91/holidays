import { ShieldPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import InviteAdminForm from '@/features/administrators/components/InviteAdminForm'
import PromoteExistingForm from '@/features/administrators/components/PromoteExistingForm'

type GrantMode = 'existing' | 'new'

const MODES: GrantMode[] = ['existing', 'new']

const isMode = (value: string): value is GrantMode => value === 'existing' || value === 'new'

/** Pulsante "Aggiungi admin": promozione di un utente esistente o invito di una persona nuova, sempre con la password. */
const GrantAdminDialog = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<GrantMode>('existing')
  // Durante l'invio il dialog non si chiude (Escape, clic fuori) e la modalità non cambia: un errore non va perso
  const [busy, setBusy] = useState(false)
  // Conta le aperture: ogni apertura rimonta il form (anche se avviene durante l'animazione di chiusura)
  const [openCount, setOpenCount] = useState(0)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return
        if (next) {
          setOpenCount(openCount + 1)
          setMode('existing')
        }
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <ShieldPlus aria-hidden="true" />
          {t('administrators.add')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('administrators.grant.title')}</DialogTitle>
          <DialogDescription>{t('administrators.grant.description')}</DialogDescription>
        </DialogHeader>
        <FieldSet>
          <FieldLegend variant="label">{t('administrators.grant.mode')}</FieldLegend>
          <RadioGroup value={mode} onValueChange={(value) => !busy && isMode(value) && setMode(value)} className="flex flex-wrap gap-x-6 gap-y-2">
            {MODES.map((item) => (
              <Field key={item} orientation="horizontal" className="w-auto">
                <RadioGroupItem value={item} id={`grant-mode-${item}`} />
                <FieldLabel htmlFor={`grant-mode-${item}`}>{t(`administrators.grant.${item}`)}</FieldLabel>
              </Field>
            ))}
          </RadioGroup>
        </FieldSet>
        {/* Cambiando modalità il form si rimonta: password ed errori non passano da una all'altra */}
        {mode === 'existing' ? (
          <PromoteExistingForm key={`existing-${openCount}`} onDone={() => setOpen(false)} onBusyChange={setBusy} />
        ) : (
          <InviteAdminForm key={`new-${openCount}`} onDone={() => setOpen(false)} onBusyChange={setBusy} />
        )}
      </DialogContent>
    </Dialog>
  )
}

export default GrantAdminDialog
