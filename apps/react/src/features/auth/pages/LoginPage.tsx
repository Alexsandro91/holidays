import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { ArrowRight, CircleAlert, Clock, LoaderCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import PageHeading from '@/components/layout/PageHeading'
import PasswordInput from '@/components/PasswordInput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useLogin } from '@/features/auth/api'
import { useCountdown } from '@/hooks/useCountdown'
import { isApiError } from '@/lib/api'

type Notice = 'expired' | 'logged-out' | 'restart'

const isNotice = (value: string | null): value is Notice => value === 'expired' || value === 'logged-out' || value === 'restart'

const createLoginSchema = (t: TFunction) =>
  z.object({
    email: z.string().trim().min(1, t('validation.emailRequired')).pipe(z.email(t('validation.emailInvalid'))),
    password: z.string().min(1, t('validation.passwordRequired')),
  })

type LoginValues = z.infer<ReturnType<typeof createLoginSchema>>

const LoginPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const login = useLogin()
  const lock = useCountdown()
  const [formError, setFormError] = useState<string | null>(null)
  // secondi iniziali del blocco: testo costante per gli screen reader, così non è riannunciato a ogni tick
  const [lockedFor, setLockedFor] = useState(0)
  const schema = useMemo(() => createLoginSchema(t), [t])
  const form = useForm<LoginValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })
  const { errors } = form.formState
  const notice = searchParams.get('reason')
  const redirect = searchParams.get('redirect')

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login.mutateAsync(values)
      navigate({ pathname: '/login/verify', search: redirect ? `?${new URLSearchParams({ redirect }).toString()}` : '' }, { state: { email: values.email } })
    } catch (error) {
      if (isApiError(error, 'throttled')) {
        const seconds = error.retryAfter ?? 60
        setLockedFor(seconds)
        lock.start(seconds)
        return
      }
      if (isApiError(error, 'validation')) {
        setFormError(t('login.error'))
        form.resetField('password')
        form.setFocus('password')
        return
      }
      // rete o server: la password resta com'è, il problema non sono le credenziali
      setFormError(isApiError(error, 'network') ? t('errors.network') : t('errors.generic'))
    }
  })

  return (
    <>
      <PageHeading title={t('login.title')} description={t('login.subtitle')} />
      <div className="grid gap-4">
        {isNotice(notice) && (
          <Alert>
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{t(`login.notice.${notice}`)}</AlertDescription>
          </Alert>
        )}
        {lock.secondsLeft > 0 ? (
          <Alert>
            <Clock aria-hidden="true" />
            <AlertDescription>
              <span className="sr-only">{t('login.locked', { count: lockedFor })}</span>
              <span aria-hidden="true" className="tabular-nums">
                {t('login.locked', { count: lock.secondsLeft })}
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
            <Field data-invalid={errors.password ? true : undefined}>
              <FieldLabel htmlFor="password">{t('login.password')}</FieldLabel>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'password-error' : undefined}
                {...form.register('password')}
              />
              <FieldError id="password-error">{errors.password?.message}</FieldError>
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={login.isPending || lock.secondsLeft > 0}>
              {login.isPending ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  {t('login.submitting')}
                </>
              ) : (
                <>
                  {t('login.submit')}
                  <ArrowRight aria-hidden="true" />
                </>
              )}
            </Button>
          </FieldGroup>
        </form>
        <p className="text-center text-[13.5px] text-muted-foreground">{t('login.noAccount')}</p>
      </div>
    </>
  )
}

export default LoginPage
