import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { ArrowLeft, LoaderCircle, MailOpen, RotateCw } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import PageHeading from '@/components/layout/PageHeading'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'
import { codeErrorMetaSchema, useResendCode, useVerifyCode } from '@/features/auth/api'
import { useCountdown } from '@/hooks/useCountdown'
import { isApiError } from '@/lib/api'
import { safeRedirect } from '@/lib/safeRedirect'

const RESEND_COOLDOWN_SECONDS = 60
const CODE_PATTERN = /^\d{6}$/
const SLOT_CLASS = 'h-14 w-11 sm:h-15 sm:w-12'

const locationStateSchema = z.object({ email: z.string() })

const maskEmail = (email: string): string => {
  const [local = '', domain = ''] = email.split('@')
  return `${local.slice(0, 1)}•••@${domain}`
}

const metaOf = (error: unknown) => codeErrorMetaSchema.safeParse(isApiError(error) ? error.meta : {})

const VerifyCodePage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const verify = useVerifyCode()
  const resend = useResendCode()
  const cooldown = useCountdown(RESEND_COOLDOWN_SECONDS)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [resendBlocked, setResendBlocked] = useState(false)
  // Evita il doppio invio (auto-invio al sesto numero + Invio): letto solo nei gestori di evento
  const submitting = useRef(false)
  // Riporta il focus sul campo dopo errori e nuovo invio: letto solo nei gestori di evento
  const codeInput = useRef<HTMLInputElement>(null)

  const parsedState = locationStateSchema.safeParse(location.state)
  const email = parsedState.success ? parsedState.data.email : null
  const redirect = searchParams.get('redirect')

  const restartLogin = () => {
    const params = new URLSearchParams({ reason: 'restart' })
    if (redirect) params.set('redirect', redirect)
    navigate(`/login?${params.toString()}`, { replace: true })
  }

  const submit = async (value: string) => {
    if (submitting.current) return
    if (!CODE_PATTERN.test(value)) {
      setError(t('verify.incomplete'))
      return
    }
    submitting.current = true
    setError(null)
    setInfo(null)
    try {
      await verify.mutateAsync(value)
      navigate(safeRedirect(redirect), { replace: true })
    } catch (caught) {
      const meta = metaOf(caught)
      if (meta.success && meta.data.restart) {
        restartLogin()
        return
      }
      if (isApiError(caught, 'throttled')) setError(t('verify.throttled', { count: caught.retryAfter ?? RESEND_COOLDOWN_SECONDS }))
      else if (isApiError(caught, 'network')) setError(t('errors.network'))
      else if (meta.success && meta.data.attempts_left !== undefined) setError(t('verify.invalid', { count: meta.data.attempts_left }))
      else setError(t('errors.generic'))
      setCode('')
      codeInput.current?.focus()
    } finally {
      submitting.current = false
    }
  }

  const onResend = async () => {
    setError(null)
    try {
      await resend.mutateAsync()
      setCode('')
      setInfo(t('verify.resent'))
      cooldown.start(RESEND_COOLDOWN_SECONDS)
      codeInput.current?.focus()
    } catch (caught) {
      const meta = metaOf(caught)
      if (meta.success && meta.data.restart) {
        restartLogin()
        return
      }
      if (meta.success && meta.data.limit_reached) {
        setResendBlocked(true)
        setInfo(t('verify.resendLimit'))
        return
      }
      if (isApiError(caught, 'throttled')) {
        cooldown.start(caught.retryAfter ?? RESEND_COOLDOWN_SECONDS)
        return
      }
      setError(isApiError(caught, 'network') ? t('errors.network') : t('errors.generic'))
    }
  }

  return (
    <>
      <PageHeading
        icon={<MailOpen className="size-5" aria-hidden="true" />}
        title={t('verify.title')}
        description={email ? t('verify.subtitle', { email: maskEmail(email) }) : t('verify.subtitleUnknown')}
      />
      <form
        className="grid gap-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit(code)
        }}
      >
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="code">{t('verify.label')}</FieldLabel>
          <InputOTP
            ref={codeInput}
            id="code"
            maxLength={6}
            value={code}
            onChange={(value) => {
              setCode(value)
              setError(null)
            }}
            onComplete={(value) => void submit(value)}
            pattern={REGEXP_ONLY_DIGITS}
            pasteTransformer={(text) => text.replace(/\D/g, '')}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'code-error' : undefined}
            containerClassName="gap-2 sm:gap-3"
          >
            <InputOTPGroup>
              {[0, 1, 2].map((index) => (
                <InputOTPSlot key={index} index={index} className={SLOT_CLASS} />
              ))}
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              {[3, 4, 5].map((index) => (
                <InputOTPSlot key={index} index={index} className={SLOT_CLASS} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <FieldError id="code-error">{error}</FieldError>
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={verify.isPending}>
          {verify.isPending ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden="true" />
              {t('verify.submitting')}
            </>
          ) : (
            t('verify.submit')
          )}
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="link" className="px-0" onClick={() => navigate('/login', { replace: true })}>
            <ArrowLeft aria-hidden="true" />
            {t('verify.otherAccount')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="tabular-nums"
            disabled={cooldown.secondsLeft > 0 || resendBlocked || resend.isPending}
            onClick={() => void onResend()}
          >
            <RotateCw aria-hidden="true" />
            {cooldown.secondsLeft > 0 ? t('verify.resendIn', { count: cooldown.secondsLeft }) : t('verify.resend')}
          </Button>
        </div>
        <div aria-live="polite">
          {info && (
            <Alert>
              <AlertDescription>{info}</AlertDescription>
            </Alert>
          )}
        </div>
      </form>
    </>
  )
}

export default VerifyCodePage
