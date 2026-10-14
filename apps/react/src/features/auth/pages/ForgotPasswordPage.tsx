import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { ArrowLeft, CircleAlert, Clock, LoaderCircle, MailCheck, RotateCw } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { z } from 'zod'
import PageHeading from '@/components/layout/PageHeading'
import { Alert, AlertDescription, alertVariants } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useForgotPassword } from '@/features/auth/api'
import { useResumeSession } from '@/features/auth/useResumeSession'
import { emailField, emailStateSchema } from '@/features/auth/validation'
import { useCountdown } from '@/hooks/useCountdown'
import { isAlreadyAuthenticated, isApiError } from '@/lib/api'

// Il broker di Laravel ignora un nuovo link per lo stesso utente entro 60 s
const RESEND_COOLDOWN_SECONDS = 60

const createForgotSchema = (t: TFunction) => z.object({ email: emailField(t) })

type ForgotValues = z.infer<ReturnType<typeof createForgotSchema>>

const toMinutes = (seconds: number): number => Math.max(1, Math.ceil(seconds / 60))

const ForgotPasswordPage = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const forgot = useForgotPassword()
  const resumeSession = useResumeSession()
  const cooldown = useCountdown()
  const lock = useCountdown()
  // minuti iniziali del blocco: testo costante per gli screen reader, così non è riannunciato a ogni tick
  const [lockedFor, setLockedFor] = useState(0)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const schema = useMemo(() => createForgotSchema(t), [t])
  const initialState = emailStateSchema.safeParse(location.state)
  const form = useForm<ForgotValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: initialState.success ? initialState.data.email : '' },
  })
  const typedEmail = useWatch({ control: form.control, name: 'email' })
  const { errors } = form.formState

  // Il contenuto cambia senza cambiare pagina: il focus va sul nuovo titolo (lo annuncia anche agli screen reader)
  useEffect(() => {
    if (sentTo !== null) document.getElementById('page-title')?.focus()
  }, [sentTo])

  // Invio in corso, attesa tra un link e l'altro o blocco dopo un 429: i pulsanti restano focalizzabili (aria-disabled)
  const submitBlocked = forgot.isPending || lock.secondsLeft > 0
  const resendBlocked = submitBlocked || cooldown.secondsLeft > 0

  const send = async (email: string, isResend: boolean) => {
    setFormError(null)
    // Svuota la regione di stato: lo stesso messaggio ripetuto viene annunciato di nuovo
    setInfo(null)
    try {
      await forgot.mutateAsync(email)
      setSentTo(email)
      // L'attesa dopo un invio è sempre la stessa: il nome del pulsante per gli screen reader resta costante
      cooldown.start(RESEND_COOLDOWN_SECONDS)
      if (isResend) setInfo(t('forgot.resent'))
    } catch (error) {
      // Sessione già aperta: il recupero non serve, si va alla home
      if (isAlreadyAuthenticated(error) && (await resumeSession(null))) return
      if (isApiError(error, 'throttled')) {
        const seconds = error.retryAfter ?? RESEND_COOLDOWN_SECONDS
        setLockedFor(seconds)
        lock.start(seconds)
        return
      }
      const fieldError = isApiError(error, 'validation') ? error.fieldErrors.email?.[0] : undefined
      if (fieldError && !isResend) {
        form.setError('email', { message: fieldError }, { shouldFocus: true })
        return
      }
      setFormError(isApiError(error, 'network') ? t('errors.network') : t('errors.generic'))
    }
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (submitBlocked) {
      event.preventDefault()
      return
    }
    return form.handleSubmit((values) => send(values.email, false))(event)
  }

  const notices =
    lock.secondsLeft > 0 ? (
      <Alert>
        <Clock aria-hidden="true" />
        <AlertDescription>
          <span className="sr-only">{t('forgot.throttled', { count: toMinutes(lockedFor) })}</span>
          <span aria-hidden="true" className="tabular-nums">
            {t('forgot.throttled', { count: toMinutes(lock.secondsLeft) })}
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
    )

  // WCAG 3.3.7: l'email già scritta non va reinserita nel login
  const backToLogin = (
    <Button asChild variant="link" className="justify-self-start px-0">
      <Link to="/login" state={{ email: (sentTo ?? typedEmail).trim() }}>
        <ArrowLeft aria-hidden="true" />
        {t('forgot.backToLogin')}
      </Link>
    </Button>
  )

  if (sentTo !== null) {
    return (
      <>
        <PageHeading icon={<MailCheck className="size-5" aria-hidden="true" />} title={t('forgot.sentTitle')} description={t('forgot.sent', { email: sentTo })} />
        <div className="grid gap-4">
          {notices}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full tabular-nums"
            aria-disabled={resendBlocked || undefined}
            onClick={() => {
              if (!resendBlocked) void send(sentTo, true)
            }}
          >
            <RotateCw aria-hidden="true" />
            {cooldown.secondsLeft > 0 ? (
              <>
                <span className="sr-only">{t('forgot.resendWait', { count: RESEND_COOLDOWN_SECONDS })}</span>
                <span aria-hidden="true">{t('forgot.resendIn', { count: cooldown.secondsLeft })}</span>
              </>
            ) : (
              t('forgot.resend')
            )}
          </Button>
          {backToLogin}
          {/* Unica live region: il messaggio ha lo stile di Alert, senza role="alert" */}
          <div aria-live="polite">
            {info && (
              <div data-slot="alert" className={alertVariants()}>
                <AlertDescription>{info}</AlertDescription>
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeading title={t('forgot.title')} description={t('forgot.subtitle')} />
      <div className="grid gap-4">
        {notices}
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={errors.email ? true : undefined}>
              <FieldLabel htmlFor="email">{t('login.email')}</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...form.register('email')}
              />
              <FieldError id="email-error">{errors.email?.message}</FieldError>
            </Field>
            <Button type="submit" size="lg" className="w-full" aria-disabled={submitBlocked || undefined}>
              {forgot.isPending ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  {t('forgot.submitting')}
                </>
              ) : (
                t('forgot.submit')
              )}
            </Button>
          </FieldGroup>
        </form>
        {backToLogin}
      </div>
    </>
  )
}

export default ForgotPasswordPage
