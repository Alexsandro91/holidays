import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { ArrowLeft, CircleAlert, Clock, LinkIcon, LoaderCircle } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { z } from 'zod'
import PageHeading from '@/components/layout/PageHeading'
import PasswordInput from '@/components/PasswordInput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useResetPassword } from '@/features/auth/api'
import { useCountdown } from '@/hooks/useCountdown'
import { isApiError } from '@/lib/api'

const MIN_PASSWORD_LENGTH = 12

const createResetSchema = (t: TFunction) =>
  z
    .object({ password: z.string().min(MIN_PASSWORD_LENGTH, t('validation.passwordMin')), confirmation: z.string() })
    // Errore sotto la conferma: è il campo da correggere
    .refine((values) => values.password === values.confirmation, { message: t('validation.passwordMismatch'), path: ['confirmation'] })

type ResetValues = z.infer<ReturnType<typeof createResetSchema>>

const ResetPasswordPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { token = '' } = useParams()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const reset = useResetPassword()
  const lock = useCountdown()
  // secondi iniziali del blocco: testo costante per gli screen reader
  const [lockedFor, setLockedFor] = useState(0)
  const [rejected, setRejected] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // Evita il doppio invio (doppio click, Invio ripetuto): letto solo nei gestori di evento
  const submitting = useRef(false)
  const schema = useMemo(() => createResetSchema(t), [t])
  const form = useForm<ResetValues>({ resolver: zodResolver(schema), defaultValues: { password: '', confirmation: '' } })
  const { errors } = form.formState

  // Link troncato dal client email (senza email o token) o rifiutato dal server: il form non serve più
  const linkInvalid = rejected || token === '' || !z.email().safeParse(email).success

  // Il contenuto cambia senza cambiare pagina: il focus va sul nuovo titolo
  useEffect(() => {
    if (rejected) document.getElementById('page-title')?.focus()
  }, [rejected])

  const submit = async ({ password, confirmation }: ResetValues) => {
    if (submitting.current) return
    submitting.current = true
    setFormError(null)
    try {
      await reset.mutateAsync({ token, email, password, password_confirmation: confirmation })
      // Il reset non apre la sessione: si entra con il codice appena inviato (spec §6.3)
      navigate('/login/verify', { replace: true, state: { email, passwordReset: true } })
    } catch (error) {
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
        setRejected(true)
        return
      }
      setFormError(isApiError(error, 'network') ? t('errors.network') : t('errors.generic'))
    } finally {
      submitting.current = false
    }
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => form.handleSubmit(submit)(event)

  // WCAG 3.3.7: l'email già nota non va reinserita nel login
  const backToLogin = (
    <Button asChild variant="link" className="justify-self-start px-0">
      <Link to="/login" state={email ? { email } : undefined}>
        <ArrowLeft aria-hidden="true" />
        {t('forgot.backToLogin')}
      </Link>
    </Button>
  )

  if (linkInvalid) {
    return (
      <>
        <PageHeading icon={<LinkIcon className="size-5" aria-hidden="true" />} title={t('reset.invalidTitle')} description={t('reset.invalid')} />
        <div className="grid gap-4">
          <Button asChild size="lg" className="w-full">
            <Link to="/forgot-password" state={email ? { email } : undefined}>
              {t('reset.requestNew')}
            </Link>
          </Button>
          {backToLogin}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeading title={t('reset.title')} description={t('reset.subtitle')} />
      <div className="grid gap-4">
        {lock.secondsLeft > 0 ? (
          <Alert>
            <Clock aria-hidden="true" />
            <AlertDescription>
              <span className="sr-only">{t('reset.throttled', { count: lockedFor })}</span>
              <span aria-hidden="true" className="tabular-nums">
                {t('reset.throttled', { count: lock.secondsLeft })}
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
              <Input id="email" type="email" autoComplete="username" value={email} readOnly />
            </Field>
            <Field data-invalid={errors.password ? true : undefined}>
              <FieldLabel htmlFor="password">{t('reset.password')}</FieldLabel>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'password-hint password-error' : 'password-hint'}
                {...form.register('password')}
              />
              <FieldDescription id="password-hint">{t('reset.hint')}</FieldDescription>
              <FieldError id="password-error">{errors.password?.message}</FieldError>
            </Field>
            <Field data-invalid={errors.confirmation ? true : undefined}>
              <FieldLabel htmlFor="password-confirmation">{t('reset.confirmation')}</FieldLabel>
              <PasswordInput
                id="password-confirmation"
                autoComplete="new-password"
                aria-invalid={errors.confirmation ? true : undefined}
                aria-describedby={errors.confirmation ? 'password-confirmation-error' : undefined}
                {...form.register('confirmation')}
              />
              <FieldError id="password-confirmation-error">{errors.confirmation?.message}</FieldError>
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={reset.isPending || lock.secondsLeft > 0}>
              {reset.isPending ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  {t('reset.submitting')}
                </>
              ) : (
                t('reset.submit')
              )}
            </Button>
          </FieldGroup>
        </form>
        {backToLogin}
      </div>
    </>
  )
}

export default ResetPasswordPage
