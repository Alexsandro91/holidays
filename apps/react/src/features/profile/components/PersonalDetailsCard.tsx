import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { LoaderCircle } from 'lucide-react'
import { useMemo, useRef, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { User } from '@/features/auth/api'
import ProfileCard from '@/features/profile/components/ProfileCard'
import { useUpdateProfileName } from '@/features/profile/api'
import { isApiError } from '@/lib/api'

const createSchema = (t: TFunction) =>
  z.object({
    firstName: z.string().trim().min(1, t('validation.firstNameRequired')),
    lastName: z.string().trim().min(1, t('validation.lastNameRequired')),
  })

type NameValues = z.infer<ReturnType<typeof createSchema>>

const FIELDS: (keyof NameValues)[] = ['firstName', 'lastName']

interface PersonalDetailsCardProps {
  user: User
}

/** Nome e cognome modificabili; email e ruolo in sola lettura (spec fase 4 §3.2). */
const PersonalDetailsCard = ({ user }: PersonalDetailsCardProps) => {
  const { t } = useTranslation()
  const update = useUpdateProfileName()
  const schema = useMemo(() => createSchema(t), [t])
  const form = useForm<NameValues>({ resolver: zodResolver(schema), defaultValues: { firstName: user.first_name, lastName: user.last_name } })
  const { errors } = form.formState
  // Evita il doppio invio: si attiva già all'invio, prima della validazione asincrona (un doppio click la scavalcherebbe).
  // Letto solo nei gestori di evento
  const submitting = useRef(false)

  const submit = async ({ firstName, lastName }: NameValues) => {
    try {
      const updated = await update.mutateAsync({ firstName, lastName })
      // Il form riparte dai valori salvati (già ripuliti dal server)
      form.reset({ firstName: updated.first_name, lastName: updated.last_name })
      toast.success(t('profile.personal.done'))
    } catch (error) {
      if (isApiError(error, 'validation')) {
        const messages: Record<keyof NameValues, string | undefined> = {
          firstName: error.fieldErrors.first_name?.[0],
          lastName: error.fieldErrors.last_name?.[0],
        }
        FIELDS.forEach((field) => {
          const message = messages[field]
          if (message) form.setError(field, { message })
        })
        // Il focus va al primo campo con errore, nell'ordine in cui compaiono
        const first = FIELDS.find((field) => messages[field] !== undefined)
        if (first) form.setFocus(first)
        else toast.error(error.message)
      } else {
        // Il messaggio del server (es. troppe richieste) è già tradotto
        toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error, 'throttled') ? error.message : t('errors.generic'))
      }
    } finally {
      submitting.current = false
    }
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    // Invio in corso: l'Invio non fa nulla, nemmeno la validazione
    if (submitting.current) {
      event.preventDefault()
      return
    }
    submitting.current = true
    return form.handleSubmit(submit, () => {
      // Campi non validi: nessuna richiesta, si può correggere e riprovare
      submitting.current = false
    })(event)
  }

  return (
    <ProfileCard
      titleId="profile-personal-title"
      title={t('profile.personal.title')}
      onSubmit={onSubmit}
      footer={
        // aria-disabled: durante l'invio il pulsante resta focalizzabile (il blocco è nel gestore dell'invio)
        <Button type="submit" className="w-full sm:w-auto" aria-disabled={update.isPending || undefined}>
          {update.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('profile.personal.submit')}
        </Button>
      }
    >
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={errors.firstName ? true : undefined}>
            <FieldLabel htmlFor="profile-first-name">{t('profile.personal.firstName')}</FieldLabel>
            <Input
              id="profile-first-name"
              autoComplete="given-name"
              aria-invalid={errors.firstName ? true : undefined}
              aria-describedby={errors.firstName ? 'profile-first-name-error' : undefined}
              {...form.register('firstName')}
            />
            <FieldError id="profile-first-name-error">{errors.firstName?.message}</FieldError>
          </Field>
          <Field data-invalid={errors.lastName ? true : undefined}>
            <FieldLabel htmlFor="profile-last-name">{t('profile.personal.lastName')}</FieldLabel>
            <Input
              id="profile-last-name"
              autoComplete="family-name"
              aria-invalid={errors.lastName ? true : undefined}
              aria-describedby={errors.lastName ? 'profile-last-name-error' : undefined}
              {...form.register('lastName')}
            />
            <FieldError id="profile-last-name-error">{errors.lastName?.message}</FieldError>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* In sola lettura, non disabilitati: restano leggibili e raggiungibili da tastiera, con la spiegazione */}
          <Field>
            <FieldLabel htmlFor="profile-email">{t('profile.personal.email')}</FieldLabel>
            <Input
              id="profile-email"
              type="email"
              autoComplete="email"
              value={user.email}
              readOnly
              aria-describedby="profile-email-note"
              className="cursor-default bg-muted text-muted-foreground"
            />
            <FieldDescription id="profile-email-note">{t('profile.personal.emailNote')}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-role">{t('profile.personal.role')}</FieldLabel>
            <Input id="profile-role" value={user.role_label} readOnly className="cursor-default bg-muted text-muted-foreground" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Li decide l'amministrazione (spec SP2 fase 1 §7.4): in sola lettura come email e ruolo */}
          <Field>
            <FieldLabel htmlFor="profile-employment-type">{t('profile.personal.employmentType')}</FieldLabel>
            <Input id="profile-employment-type" value={user.employment_type_label} readOnly className="cursor-default bg-muted text-muted-foreground" />
          </Field>
          {/* Con una sola sede il campo non compare (spec §5.5) */}
          {user.multipleLocations === true && (
            <Field>
              <FieldLabel htmlFor="profile-location">{t('profile.personal.location')}</FieldLabel>
              <Input id="profile-location" value={user.location.name} readOnly className="cursor-default bg-muted text-muted-foreground" />
            </Field>
          )}
        </div>
      </FieldGroup>
    </ProfileCard>
  )
}

export default PersonalDetailsCard
