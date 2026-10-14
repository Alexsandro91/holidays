import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { Clock, LoaderCircle } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import PasswordInput from '@/components/PasswordInput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import ProfileCard from '@/features/profile/components/ProfileCard'
import { useChangePassword } from '@/features/profile/api'
import { useCountdown } from '@/hooks/useCountdown'
import { isApiError } from '@/lib/api'

const MIN_PASSWORD_LENGTH = 12

const createSchema = (t: TFunction) =>
  z
    .object({
      currentPassword: z.string().min(1, t('validation.currentPasswordRequired')),
      password: z.string().min(MIN_PASSWORD_LENGTH, t('validation.passwordMin')),
      confirmation: z.string(),
    })
    // Errore sotto la conferma: è il campo da correggere
    .refine((values) => values.password === values.confirmation, { error: t('validation.passwordMismatch'), path: ['confirmation'] })

type PasswordValues = z.infer<ReturnType<typeof createSchema>>

const FIELDS: (keyof PasswordValues)[] = ['currentPassword', 'password', 'confirmation']

const EMPTY: PasswordValues = { currentPassword: '', password: '', confirmation: '' }

interface PasswordCardProps {
  /** Email dell'account, nel campo nascosto `username` per i gestori di password */
  email: string
}

/** Cambio della propria password: le altre sessioni si chiudono, questa resta aperta (spec fase 4 §2.3 e §3.2). */
const PasswordCard = ({ email }: PasswordCardProps) => {
  const { t } = useTranslation()
  const change = useChangePassword()
  const schema = useMemo(() => createSchema(t), [t])
  const form = useForm<PasswordValues>({ resolver: zodResolver(schema), defaultValues: EMPTY })
  const { errors } = form.formState
  // Blocco dopo un 429: il messaggio del server dice già quanto attendere
  const lock = useCountdown()
  const [lockNotice, setLockNotice] = useState<string | null>(null)
  // Evita il doppio invio (doppio click, Invio ripetuto): si attiva già all'invio, prima della validazione asincrona.
  // Letto solo nei gestori di evento
  const submitting = useRef(false)

  const submit = async (values: PasswordValues) => {
    try {
      await change.mutateAsync(values)
      // Le password non restano nei campi
      form.reset(EMPTY)
      toast.success(t('profile.password.done'))
    } catch (error) {
      if (isApiError(error, 'validation')) {
        const messages: Record<keyof PasswordValues, string | undefined> = {
          currentPassword: error.fieldErrors.current_password?.[0],
          password: error.fieldErrors.password?.[0],
          confirmation: error.fieldErrors.password_confirmation?.[0],
        }
        FIELDS.forEach((field) => {
          const message = messages[field]
          if (message) form.setError(field, { message })
        })
        const first = FIELDS.find((field) => messages[field] !== undefined)
        if (first) form.setFocus(first)
        else toast.error(error.message)
      } else if (isApiError(error, 'throttled')) {
        setLockNotice(error.message)
        lock.start(error.retryAfter ?? 60)
      } else {
        toast.error(isApiError(error, 'network') ? t('errors.network') : t('errors.generic'))
      }
    } finally {
      submitting.current = false
    }
  }

  // Invio in corso o blocco dopo un 429: il pulsante resta focalizzabile (aria-disabled) e l'invio non parte
  const locked = lock.secondsLeft > 0
  const blocked = change.isPending || locked

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (submitting.current || blocked) {
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
      titleId="profile-password-title"
      title={t('profile.password.title')}
      description={t('profile.password.description')}
      onSubmit={onSubmit}
      footer={
        <Button type="submit" className="w-full sm:w-auto" aria-disabled={blocked || undefined}>
          {change.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('profile.password.submit')}
        </Button>
      }
    >
      <FieldGroup>
        {/* Account a cui appartiene la nuova password, per i gestori di password (stesso schema del reset) */}
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        {locked && lockNotice && (
          <Alert>
            <Clock aria-hidden="true" />
            <AlertDescription>{lockNotice}</AlertDescription>
          </Alert>
        )}
        <Field data-invalid={errors.currentPassword ? true : undefined}>
          <FieldLabel htmlFor="profile-current-password">{t('profile.password.current')}</FieldLabel>
          <PasswordInput
            id="profile-current-password"
            autoComplete="current-password"
            aria-invalid={errors.currentPassword ? true : undefined}
            aria-describedby={errors.currentPassword ? 'profile-current-password-error' : undefined}
            {...form.register('currentPassword')}
          />
          <FieldError id="profile-current-password-error">{errors.currentPassword?.message}</FieldError>
        </Field>
        {/* Affiancate solo da xl, quando la colonna è abbastanza larga da tenerle leggibili */}
        <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
          {/* Correggere la nuova password rivaluta la conferma: l'avviso di password diverse non resta obsoleto */}
          <Field data-invalid={errors.password ? true : undefined}>
            <FieldLabel htmlFor="profile-new-password">{t('profile.password.new')}</FieldLabel>
            <PasswordInput
              id="profile-new-password"
              autoComplete="new-password"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? 'profile-new-password-hint profile-new-password-error' : 'profile-new-password-hint'}
              {...form.register('password', { deps: 'confirmation' })}
            />
            <FieldDescription id="profile-new-password-hint">{t('profile.password.hint')}</FieldDescription>
            <FieldError id="profile-new-password-error">{errors.password?.message}</FieldError>
          </Field>
          <Field data-invalid={errors.confirmation ? true : undefined}>
            <FieldLabel htmlFor="profile-password-confirmation">{t('profile.password.confirmation')}</FieldLabel>
            <PasswordInput
              id="profile-password-confirmation"
              autoComplete="new-password"
              aria-invalid={errors.confirmation ? true : undefined}
              aria-describedby={errors.confirmation ? 'profile-password-confirmation-error' : undefined}
              {...form.register('confirmation')}
            />
            <FieldError id="profile-password-confirmation-error">{errors.confirmation?.message}</FieldError>
          </Field>
        </div>
      </FieldGroup>
    </ProfileCard>
  )
}

export default PasswordCard
