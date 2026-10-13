import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { CircleAlert, Clock, LinkIcon, LoaderCircle } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import PageHeading from '@/components/layout/PageHeading'
import PasswordInput from '@/components/PasswordInput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAcceptInvitation, useInvitation } from '@/features/invitations/api'
import { useCountdown } from '@/hooks/useCountdown'
import { isApiError } from '@/lib/api'

const MIN_PASSWORD_LENGTH = 12

const createInvitationSchema = (t: TFunction) =>
  z
    .object({
      password: z.string().min(MIN_PASSWORD_LENGTH, t('validation.passwordMin')),
      confirmation: z.string(),
      // Il checkbox parte non spuntato: l'errore è dedicato, il valore inviato al server è sempre true
      privacy: z.boolean().refine((value) => value, t('invitation.privacyRequired')),
    })
    // Errore sotto la conferma: è il campo da correggere
    // when: il controllo gira anche se il checkbox non è spuntato, così i due errori compaiono insieme
    .refine((values) => values.password === values.confirmation, {
      message: t('validation.passwordMismatch'),
      path: ['confirmation'],
      when: (payload) => !payload.issues.some((issue) => issue.path?.[0] === 'password' || issue.path?.[0] === 'confirmation'),
    })

type InvitationInput = z.input<ReturnType<typeof createInvitationSchema>>
type InvitationValues = z.output<ReturnType<typeof createInvitationSchema>>

type Rejection = 'invalid' | 'expired'

// 410: scaduto; 404: inesistente o già usato; altri errori (rete, 5xx) non sono un rifiuto
const rejectionOf = (error: unknown): Rejection | null => {
  if (!isApiError(error)) return null
  if (error.status === 410) return 'expired'
  return error.status === 404 ? 'invalid' : null
}

const AcceptInvitationPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { token = '' } = useParams()
  const invitation = useInvitation(token)
  const accept = useAcceptInvitation(token)
  const lock = useCountdown()
  // secondi iniziali del blocco: testo costante per gli screen reader
  const [lockedFor, setLockedFor] = useState(0)
  const [rejection, setRejection] = useState<Rejection | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  // Evita il doppio invio (doppio click, Invio ripetuto): letto solo nei gestori di evento
  const submitting = useRef(false)
  const schema = useMemo(() => createInvitationSchema(t), [t])
  const form = useForm<InvitationInput, unknown, InvitationValues>({ resolver: zodResolver(schema), defaultValues: { password: '', confirmation: '', privacy: false } })
  const { errors } = form.formState

  const queryRejection = rejectionOf(invitation.error)
  const state = rejection ?? queryRejection

  // Il contenuto cambia senza cambiare pagina (caricamento finito, rifiuto, errore, nuovo tentativo riuscito):
  // il focus va sul nuovo titolo
  const view = invitation.isPending ? null : (state ?? (invitation.data ? 'form' : 'error'))
  useEffect(() => {
    if (view) document.getElementById('page-title')?.focus()
  }, [view])

  const submit = async ({ password, confirmation }: InvitationValues) => {
    if (submitting.current || !invitation.data) return
    submitting.current = true
    setFormError(null)
    try {
      await accept.mutateAsync({ password, password_confirmation: confirmation, privacy_acknowledged: true })
    } catch (error) {
      submitting.current = false
      if (isApiError(error, 'throttled')) {
        const seconds = error.retryAfter ?? 60
        setLockedFor(seconds)
        lock.start(seconds)
        return
      }
      if (isApiError(error, 'validation')) {
        const passwordError = error.fieldErrors.password?.[0]
        if (passwordError) {
          form.setError('password', { message: passwordError }, { shouldFocus: true })
          return
        }
        const privacyError = error.fieldErrors.privacy_acknowledged?.[0]
        if (privacyError) {
          form.setError('privacy', { message: privacyError }, { shouldFocus: true })
          return
        }
      }
      const rejected = rejectionOf(error)
      if (rejected) {
        setRejection(rejected)
        return
      }
      setFormError(isApiError(error, 'network') ? t('errors.network') : t('errors.generic'))
      return
    }
    // Account attivato: submitting resta true fino allo smontaggio (la navigazione non è immediata e un secondo
    // invio userebbe un invito già consumato). L'attivazione non apre la sessione: si entra con il codice appena inviato
    navigate('/login/verify', { replace: true, state: { email: invitation.data.email, invitationAccepted: true } })
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => form.handleSubmit(submit)(event)

  if (invitation.isPending) {
    return (
      <div aria-busy="true" className="grid gap-4">
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (state) {
    const expired = state === 'expired'
    return (
      <>
        <PageHeading
          icon={<LinkIcon className="size-5" aria-hidden="true" />}
          title={t(expired ? 'invitation.expiredTitle' : 'invitation.invalidTitle')}
          description={t(expired ? 'invitation.expired' : 'invitation.invalid')}
        />
        <div className="grid gap-4">
          <p className="text-[15px] leading-relaxed">{t('invitation.askHr')}</p>
          <Button asChild size="lg" className="w-full">
            <Link to="/login">{t('invitation.toLogin')}</Link>
          </Button>
        </div>
      </>
    )
  }

  if (!invitation.data) {
    // Rete o 5xx: titolo ed errore in linea con nuovo tentativo (il layout ha già il suo <main>)
    return (
      <>
        <PageHeading title={t('invitation.loadErrorTitle')} />
        <Alert>
          <CircleAlert aria-hidden="true" />
          <AlertDescription className="grid gap-3">
            <p>{t(isApiError(invitation.error, 'network') ? 'errors.network' : 'errors.generic')}</p>
            <Button variant="outline" size="sm" className="justify-self-start" onClick={() => void invitation.refetch()}>
              {t('common.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      </>
    )
  }

  return (
    <>
      <PageHeading title={t('invitation.title', { name: invitation.data.name })} description={t('invitation.subtitle')} />
      <div className="grid gap-4">
        {lock.secondsLeft > 0 ? (
          <Alert>
            <Clock aria-hidden="true" />
            <AlertDescription>
              <span className="sr-only">{t('invitation.throttled', { count: lockedFor })}</span>
              <span aria-hidden="true" className="tabular-nums">
                {t('invitation.throttled', { count: lock.secondsLeft })}
              </span>
            </AlertDescription>
          </Alert>
        ) : (
          formError && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )
        )}
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {/* Email visibile e in sola lettura: il gestore di password la associa alla nuova password */}
            <Field>
              <FieldLabel htmlFor="email">{t('login.email')}</FieldLabel>
              <Input id="email" type="email" autoComplete="username" value={invitation.data.email} readOnly className="cursor-default bg-muted text-muted-foreground" />
            </Field>
            <Field data-invalid={errors.password ? true : undefined}>
              <FieldLabel htmlFor="password">{t('invitation.password')}</FieldLabel>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'password-hint password-error' : 'password-hint'}
                {...form.register('password', { deps: 'confirmation' })}
              />
              <FieldDescription id="password-hint">{t('invitation.hint')}</FieldDescription>
              <FieldError id="password-error">{errors.password?.message}</FieldError>
            </Field>
            <Field data-invalid={errors.confirmation ? true : undefined}>
              <FieldLabel htmlFor="password-confirmation">{t('invitation.confirmation')}</FieldLabel>
              <PasswordInput
                id="password-confirmation"
                autoComplete="new-password"
                aria-invalid={errors.confirmation ? true : undefined}
                aria-describedby={errors.confirmation ? 'password-confirmation-error' : undefined}
                {...form.register('confirmation')}
              />
              <FieldError id="password-confirmation-error">{errors.confirmation?.message}</FieldError>
            </Field>
            <Field data-invalid={errors.privacy ? true : undefined}>
              <div className="flex items-center gap-2">
                <Controller
                  control={form.control}
                  name="privacy"
                  render={({ field }) => (
                    <Checkbox
                      id="privacy"
                      ref={field.ref}
                      name={field.name}
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      onBlur={field.onBlur}
                      aria-invalid={errors.privacy ? true : undefined}
                      aria-describedby={errors.privacy ? 'privacy-link privacy-error' : 'privacy-link'}
                    />
                  )}
                />
                <FieldLabel htmlFor="privacy">{t('invitation.privacy')}</FieldLabel>
              </div>
              <Button asChild variant="link" className="justify-self-start px-0">
                <Link id="privacy-link" to="/privacy" target="_blank" rel="noopener noreferrer">
                  {t('invitation.privacyLink')}
                </Link>
              </Button>
              <FieldError id="privacy-error">{errors.privacy?.message}</FieldError>
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={accept.isPending || lock.secondsLeft > 0}>
              {accept.isPending ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  {t('invitation.submitting')}
                </>
              ) : (
                t('invitation.submit')
              )}
            </Button>
          </FieldGroup>
        </form>
      </div>
    </>
  )
}

export default AcceptInvitationPage
