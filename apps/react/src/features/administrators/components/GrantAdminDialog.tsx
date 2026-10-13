import { LoaderCircle, Search, ShieldPlus } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import PasswordInput from '@/components/PasswordInput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useGrantAdmin } from '@/features/administrators/api'
import { useManagedUsers } from '@/features/users/api'
import { isApiError } from '@/lib/api'

const SEARCH_DEBOUNCE_MS = 300

interface GrantValues {
  userId: string
  currentPassword: string
}

interface GrantBodyProps {
  onDone: () => void
}

/** Il corpo si monta a ogni apertura: ricerca, scelta e password ripartono da zero. */
const GrantBody = ({ onDone }: GrantBodyProps) => {
  const { t } = useTranslation()
  const grant = useGrantAdmin()
  const form = useForm<GrantValues>({ defaultValues: { userId: '', currentPassword: '' } })
  const { errors } = form.formState
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [userId, setUserId] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  // Evita il doppio invio: letto solo nei gestori di evento
  const submitting = useRef(false)
  const candidates = useManagedUsers({ status: 'active', search, page: 1 })
  const people = (candidates.data?.data ?? []).filter((person) => person.role !== 'admin')

  // Ricerca aggiornata 300 ms dopo l'ultima battuta
  useEffect(() => {
    if (draft === search) return
    const id = window.setTimeout(() => setSearch(draft), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [draft, search])

  const submit = async ({ currentPassword }: GrantValues) => {
    if (submitting.current) return
    if (userId === '') {
      form.setError('userId', { message: t('administrators.grant.pickUser') })
      return
    }
    submitting.current = true
    setNotice(null)
    const person = people.find((item) => String(item.id) === userId)
    try {
      await grant.mutateAsync({ userId: Number(userId), currentPassword })
      toast.success(t('administrators.grant.done', { name: person?.name ?? '' }))
      onDone()
    } catch (error) {
      if (isApiError(error, 'validation')) {
        const passwordError = error.fieldErrors.current_password?.[0]
        const userError = error.fieldErrors.user_id?.[0]
        if (userError) form.setError('userId', { message: userError })
        if (passwordError) form.setError('currentPassword', { message: passwordError }, { shouldFocus: true })
        if (!userError && !passwordError) setNotice(error.message)
      } else if (isApiError(error, 'throttled')) {
        setNotice(error.message)
        setLocked(true)
      } else {
        toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
      }
    } finally {
      submitting.current = false
    }
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => form.handleSubmit(submit)(event)

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" aria-label={t('administrators.grant.search')} placeholder={t('administrators.grant.search')} value={draft} onChange={(event) => setDraft(event.target.value)} className="pl-9" />
        </div>
        <Field data-invalid={errors.userId ? true : undefined}>
          {candidates.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t('common.loading')}
            </p>
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
        {notice && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
      <DialogFooter className="mt-4">
        <Button type="submit" disabled={grant.isPending || locked}>
          {grant.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('administrators.grant.submit')}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Pulsante "Aggiungi admin" con il dialog di promozione. */
const GrantAdminDialog = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
        <GrantBody onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

export default GrantAdminDialog
