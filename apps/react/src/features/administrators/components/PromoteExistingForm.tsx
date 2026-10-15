import { LoaderCircle, Search } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import PasswordInput from '@/components/PasswordInput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useGrantAdmin } from '@/features/administrators/api'
import { DEFAULT_USER_LIST_PARAMS, useManagedUsers } from '@/features/users/api'
import { MAX_TEXT_FILTER } from '@/features/users/useUserListParams'
import { isApiError } from '@/lib/api'

const SEARCH_DEBOUNCE_MS = 300

interface GrantValues {
  userId: string
  currentPassword: string
}

interface PromoteExistingFormProps {
  onDone: () => void
  onBusyChange: (busy: boolean) => void
  /** Blocco dopo un 429, condiviso dalle due modalità del dialog (cambiare modalità non lo aggira) */
  lockNotice: string | null
  onLock: (message: string) => void
}

/** Promozione di un utente attivo. Si monta a ogni apertura del dialog: ricerca, scelta e password ripartono da zero. */
const PromoteExistingForm = ({ onDone, onBusyChange, lockNotice, onLock }: PromoteExistingFormProps) => {
  const { t } = useTranslation()
  const grant = useGrantAdmin()
  const form = useForm<GrantValues>({ defaultValues: { userId: '', currentPassword: '' } })
  const { errors } = form.formState
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [userId, setUserId] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const locked = lockNotice !== null
  // Evita il doppio invio: letto solo nei gestori di evento. Dopo la promozione riuscita resta attivo fino allo
  // smontaggio: durante l'animazione di chiusura il form è ancora nel DOM (il corpo si rimonta a ogni apertura)
  const submitting = useRef(false)
  // Ricerca generale: nome, cognome o email, anche "nome cognome" o "cognome nome" (spec §7.2)
  const candidates = useManagedUsers({ ...DEFAULT_USER_LIST_PARAMS, status: 'active', search, perPage: 50 })
  // Un admin non può essere stagista (spec SP2 fase 1 §7.3): gli stagisti non sono tra i candidati
  const people = (candidates.data?.data ?? []).filter((person) => person.role !== 'admin' && person.employment_type !== 'intern')

  // Se la scelta non è più tra i candidati (nuova ricerca) si azzera, così il nome non va perso
  if (userId !== '' && candidates.data !== undefined && !people.some((person) => String(person.id) === userId)) setUserId('')

  // Ricerca aggiornata 300 ms dopo l'ultima battuta
  useEffect(() => {
    if (draft === search) return
    const id = window.setTimeout(() => setSearch(draft), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [draft, search])

  const submit = async ({ currentPassword }: GrantValues) => {
    if (submitting.current) return
    submitting.current = true
    setNotice(null)
    onBusyChange(true)
    const person = people.find((item) => String(item.id) === userId)
    try {
      await grant.mutateAsync({ userId: Number(userId), currentPassword })
    } catch (error) {
      submitting.current = false
      if (isApiError(error, 'validation')) {
        const passwordError = error.fieldErrors.current_password?.[0]
        const userError = error.fieldErrors.user_id?.[0]
        if (userError) form.setError('userId', { message: userError })
        if (passwordError) form.setError('currentPassword', { message: passwordError }, { shouldFocus: true })
        if (!userError && !passwordError) setNotice(error.message)
      } else if (isApiError(error, 'throttled')) {
        onLock(error.message)
      } else {
        toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
      }
      return
    } finally {
      onBusyChange(false)
    }
    toast.success(t('administrators.grant.done', { name: person?.name ?? '' }))
    onDone()
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (submitting.current || locked) {
      event.preventDefault()
      return
    }
    // La scelta dell'utente non è nel form: l'errore compare insieme a quello della password
    const missingUser = userId === ''
    if (missingUser) form.setError('userId', { message: t('administrators.grant.pickUser') })
    return form.handleSubmit(
      (values) => (missingUser ? undefined : submit(values)),
      () => undefined,
    )(event)
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            maxLength={MAX_TEXT_FILTER}
            aria-label={t('administrators.grant.search')}
            placeholder={t('administrators.grant.search')}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            // Invio nella ricerca non promuove nessuno: il form si invia solo dal pulsante o dalla password
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault()
            }}
            className="pl-9"
          />
        </div>
        <Field data-invalid={errors.userId ? true : undefined}>
          {candidates.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t('common.loading')}
            </p>
          ) : candidates.isError ? (
            // Un errore non è "nessun risultato": si dice e si offre di riprovare
            <div role="alert" className="grid justify-items-start gap-2 text-sm">
              <p>{t('users.loadError')}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void candidates.refetch()}>
                {t('common.retry')}
              </Button>
            </div>
          ) : people.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('administrators.grant.noResults')}</p>
          ) : (
            <RadioGroup
              aria-label={t('administrators.grant.candidates')}
              aria-invalid={errors.userId ? true : undefined}
              aria-describedby={errors.userId ? 'grant-user-error' : undefined}
              value={userId}
              onValueChange={(value) => {
                setUserId(value)
                form.clearErrors('userId')
              }}
              className="max-h-60 overflow-y-auto"
            >
              {people.map((person) => (
                <Field key={person.id} orientation="horizontal">
                  <RadioGroupItem value={String(person.id)} id={`grant-user-${person.id}`} aria-label={`${person.name} (${person.email})`} />
                  <FieldLabel htmlFor={`grant-user-${person.id}`} className="min-w-0 flex-col items-start gap-0 font-normal">
                    <span className="font-medium">{person.name}</span>
                    <span className="break-all text-sm text-muted-foreground">{person.email}</span>
                  </FieldLabel>
                </Field>
              ))}
            </RadioGroup>
          )}
          <FieldError id="grant-user-error">{errors.userId?.message}</FieldError>
        </Field>
        <Field data-invalid={errors.currentPassword ? true : undefined}>
          <FieldLabel htmlFor="grant-password">{t('administrators.grant.password')}</FieldLabel>
          <PasswordInput
            id="grant-password"
            autoComplete="current-password"
            aria-invalid={errors.currentPassword ? true : undefined}
            aria-describedby={errors.currentPassword ? 'grant-password-error' : undefined}
            {...form.register('currentPassword', { required: t('validation.passwordRequired') })}
          />
          <FieldError id="grant-password-error">{errors.currentPassword?.message}</FieldError>
        </Field>
        {(lockNotice ?? notice) && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{lockNotice ?? notice}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
      <DialogFooter className="mt-4">
        {/* aria-disabled: dopo un 429 il pulsante resta focalizzabile (il blocco è nel gestore dell'invio) */}
        <Button type="submit" aria-disabled={grant.isPending || locked || undefined}>
          {grant.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('administrators.grant.submit')}
        </Button>
      </DialogFooter>
    </form>
  )
}

export default PromoteExistingForm
