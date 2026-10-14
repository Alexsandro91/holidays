import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { ArrowLeft, CircleCheck, LoaderCircle, MailOpen, RotateCw } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import PageHeading from '@/components/layout/PageHeading'
import { Alert, AlertDescription, alertVariants } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'
import { codeErrorMetaSchema, useResendCode, useVerifyCode } from '@/features/auth/api'
import { useResumeSession } from '@/features/auth/useResumeSession'
import { useCountdown } from '@/hooks/useCountdown'
import { isAlreadyAuthenticated, isApiError } from '@/lib/api'
import { safeRedirect } from '@/lib/safeRedirect'

const RESEND_COOLDOWN_SECONDS = 60
const CODE_PATTERN = /^\d{6}$/
const SLOT_CLASS = 'h-14 w-11 sm:h-15 sm:w-12'

// passwordReset / invitationAccepted: si arriva dalla nuova password o dall'attivazione, non dal login
const locationStateSchema = z.object({ email: z.string(), passwordReset: z.boolean().optional(), invitationAccepted: z.boolean().optional() })

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
  const resumeSession = useResumeSession()
  const cooldown = useCountdown(RESEND_COOLDOWN_SECONDS)
  // Secondi iniziali dell'attesa: nome costante del pulsante per gli screen reader, che non va riannunciato a ogni tick
  const [cooldownFor, setCooldownFor] = useState(RESEND_COOLDOWN_SECONDS)
  // Blocco dopo un 429 sulla verifica: niente invii finché non passano i secondi di Retry-After
  const lock = useCountdown()
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
  const afterPasswordReset = parsedState.success && parsedState.data.passwordReset === true
  const afterInvitation = parsedState.success && parsedState.data.invitationAccepted === true
  const redirect = searchParams.get('redirect')

  const restartLogin = () => {
    const params = new URLSearchParams({ reason: 'restart' })
    if (redirect) params.set('redirect', redirect)
    navigate(`/login?${params.toString()}`, { replace: true })
  }

  const submit = async (value: string) => {
    if (submitting.current || lock.secondsLeft > 0) return
    if (!CODE_PATTERN.test(value)) {
      setError(t('verify.incomplete'))
      return
    }
    submitting.current = true
    setError(null)
    setInfo(null)
    try {
      await verify.mutateAsync(value)
    } catch (caught) {
      const meta = metaOf(caught)
      if (meta.success && meta.data.restart) {
        // Si torna all'accesso: da questa pagina non parte più nulla
        restartLogin()
        return
      }
      // Sessione già aperta (es. codice inserito in un'altra scheda): si va alla destinazione
      if (isAlreadyAuthenticated(caught) && (await resumeSession(redirect))) return
      submitting.current = false
      if (isApiError(caught, 'throttled')) {
        const seconds = caught.retryAfter ?? RESEND_COOLDOWN_SECONDS
        lock.start(seconds)
        setError(t('verify.throttled', { count: seconds }))
      } else if (isApiError(caught, 'network')) setError(t('errors.network'))
      else if (meta.success && meta.data.attempts_left !== undefined) setError(t('verify.invalid', { count: meta.data.attempts_left }))
      else setError(t('errors.generic'))
      setCode('')
      codeInput.current?.focus()
      return
    }
    // Codice accettato: submitting resta true fino allo smontaggio della pagina. La navigazione non è immediata
    // e un Invio arrivato nel frattempo rimanderebbe lo stesso codice (secondo POST)
    navigate(safeRedirect(redirect), { replace: true })
  }

  // Invio in corso, conto alla rovescia o limite raggiunto: i pulsanti restano focalizzabili (aria-disabled), così il
  // focus non finisce sul body quando un 429 li blocca
  const submitBlocked = verify.isPending || lock.secondsLeft > 0
  const resendDisabled = cooldown.secondsLeft > 0 || resendBlocked || resend.isPending

  const onResend = async () => {
    if (resendDisabled) return
    setError(null)
    // Svuota la regione di stato: lo stesso messaggio ripetuto viene annunciato di nuovo
    setInfo(null)
    try {
      await resend.mutateAsync()
      setCode('')
      setInfo(t('verify.resent'))
      setCooldownFor(RESEND_COOLDOWN_SECONDS)
      cooldown.start(RESEND_COOLDOWN_SECONDS)
      codeInput.current?.focus()
    } catch (caught) {
      const meta = metaOf(caught)
      if (meta.success && meta.data.restart) {
        restartLogin()
        return
      }
      if (isAlreadyAuthenticated(caught) && (await resumeSession(redirect))) return
      if (meta.success && meta.data.limit_reached) {
        setResendBlocked(true)
        setInfo(t('verify.resendLimit'))
        return
      }
      if (isApiError(caught, 'throttled')) {
        const seconds = caught.retryAfter ?? RESEND_COOLDOWN_SECONDS
        setCooldownFor(seconds)
        cooldown.start(seconds)
        return
      }
      // Errore del nuovo invio, non del codice: va nella regione di stato e il campo resta valido
      setInfo(isApiError(caught, 'network') ? t('errors.network') : t('errors.generic'))
    }
  }

  return (
    <>
      <PageHeading
        icon={<MailOpen className="size-5" aria-hidden="true" />}
        title={t('verify.title')}
        descriptionId="verify-description"
        description={email ? t('verify.subtitle', { email: maskEmail(email) }) : t('verify.subtitleUnknown')}
      />
      {afterPasswordReset && (
        <Alert className="mb-5">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>{t('verify.passwordReset')}</AlertDescription>
        </Alert>
      )}
      {afterInvitation && (
        <Alert className="mb-5">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>{t('verify.invitationAccepted')}</AlertDescription>
        </Alert>
      )}
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
              // Durante il blocco il messaggio con l'attesa resta visibile
              if (lock.secondsLeft === 0) setError(null)
            }}
            onComplete={(value) => void submit(value)}
            pattern={REGEXP_ONLY_DIGITS}
            pasteTransformer={(text) => text.replace(/\D/g, '')}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'verify-description code-error' : 'verify-description'}
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
        <Button type="submit" size="lg" className="w-full" aria-disabled={submitBlocked || undefined}>
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
            aria-disabled={resendDisabled || undefined}
            onClick={() => void onResend()}
          >
            <RotateCw aria-hidden="true" />
            {cooldown.secondsLeft > 0 ? (
              <>
                <span className="sr-only">{t('verify.resendWait', { count: cooldownFor })}</span>
                <span aria-hidden="true">{t('verify.resendIn', { count: cooldown.secondsLeft })}</span>
              </>
            ) : (
              t('verify.resend')
            )}
          </Button>
        </div>
        {/* Unica live region: il messaggio è un elemento semplice con lo stile di Alert, senza role="alert" */}
        <div aria-live="polite">
          {info && (
            <div data-slot="alert" className={alertVariants()}>
              <AlertDescription>{info}</AlertDescription>
            </div>
          )}
        </div>
      </form>
    </>
  )
}

export default VerifyCodePage
