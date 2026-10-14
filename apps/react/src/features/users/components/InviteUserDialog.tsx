import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { LoaderCircle, UserPlus } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { emailField } from '@/features/auth/validation'
import { useInviteUser } from '@/features/users/api'
import { isApiError } from '@/lib/api'

const createInviteSchema = (t: TFunction) =>
  z.object({
    firstName: z.string().trim().min(1, t('validation.firstNameRequired')),
    lastName: z.string().trim().min(1, t('validation.lastNameRequired')),
    email: emailField(t),
    role: z.enum(['employee', 'manager']),
  })

type InviteValues = z.infer<ReturnType<typeof createInviteSchema>>

const ROLES: InviteValues['role'][] = ['employee', 'manager']

const FIELDS: (keyof InviteValues)[] = ['firstName', 'lastName', 'email', 'role']

const isRole = (value: string): value is InviteValues['role'] => value === 'employee' || value === 'manager'

/** Pulsante "Invita utente" con il dialog di invito. */
const InviteUserDialog = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const invite = useInviteUser()
  // Evita il doppio invio: letto solo nei gestori di evento. Dopo l'invito riuscito resta attivo finché il dialog
  // non si riapre: durante l'animazione di chiusura il form è ancora nel DOM
  const submitting = useRef(false)
  const schema = useMemo(() => createInviteSchema(t), [t])
  const form = useForm<InviteValues>({ resolver: zodResolver(schema), defaultValues: { firstName: '', lastName: '', email: '', role: 'employee' } })
  const { errors } = form.formState

  const submit = async (values: InviteValues) => {
    if (submitting.current) return
    submitting.current = true
    try {
      await invite.mutateAsync(values)
    } catch (error) {
      submitting.current = false
      if (isApiError(error, 'validation')) {
        const messages: Record<keyof InviteValues, string | undefined> = {
          firstName: error.fieldErrors.first_name?.[0],
          lastName: error.fieldErrors.last_name?.[0],
          email: error.fieldErrors.email?.[0],
          role: error.fieldErrors.role?.[0],
        }
        FIELDS.forEach((field) => {
          const message = messages[field]
          if (message) form.setError(field, { message })
        })
        // Il focus va al primo campo con errore, nell'ordine in cui compaiono
        const first = FIELDS.find((field) => messages[field] !== undefined)
        if (first) form.setFocus(first)
        else toast.error(error.message)
        return
      }
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error, 'throttled') ? error.message : t('errors.generic'))
      return
    }
    toast.success(t('users.inviteDialog.done', { email: values.email }))
    setOpen(false)
    form.reset()
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => form.handleSubmit(submit)(event)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Durante l'invio il dialog non si chiude (Escape, clic fuori): l'esito non va perso
        if (!next && invite.isPending) return
        // Nuova apertura: si può inviare un nuovo invito
        if (next) submitting.current = false
        setOpen(next)
        // Chiudendo si scarta quanto scritto, errori compresi
        if (!next) form.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden="true" />
          {t('users.invite')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('users.inviteDialog.title')}</DialogTitle>
          <DialogDescription>{t('users.inviteDialog.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {/* Nome e cognome affiancati da sm in su: sono i dati di un'altra persona, niente autocompletamento */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={errors.firstName ? true : undefined}>
                <FieldLabel htmlFor="invite-first-name">{t('users.inviteDialog.firstName')}</FieldLabel>
                <Input
                  id="invite-first-name"
                  autoComplete="off"
                  aria-invalid={errors.firstName ? true : undefined}
                  aria-describedby={errors.firstName ? 'invite-first-name-error' : undefined}
                  {...form.register('firstName')}
                />
                <FieldError id="invite-first-name-error">{errors.firstName?.message}</FieldError>
              </Field>
              <Field data-invalid={errors.lastName ? true : undefined}>
                <FieldLabel htmlFor="invite-last-name">{t('users.inviteDialog.lastName')}</FieldLabel>
                <Input
                  id="invite-last-name"
                  autoComplete="off"
                  aria-invalid={errors.lastName ? true : undefined}
                  aria-describedby={errors.lastName ? 'invite-last-name-error' : undefined}
                  {...form.register('lastName')}
                />
                <FieldError id="invite-last-name-error">{errors.lastName?.message}</FieldError>
              </Field>
            </div>
            <Field data-invalid={errors.email ? true : undefined}>
              <FieldLabel htmlFor="invite-email">{t('users.inviteDialog.email')}</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'invite-email-error' : undefined}
                {...form.register('email')}
              />
              <FieldError id="invite-email-error">{errors.email?.message}</FieldError>
            </Field>
            <FieldSet>
              <FieldLegend variant="label">{t('users.inviteDialog.role')}</FieldLegend>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <RadioGroup
                    aria-invalid={errors.role ? true : undefined}
                    aria-describedby={errors.role ? 'invite-role-error' : undefined}
                    value={field.value}
                    onValueChange={(value) => isRole(value) && field.onChange(value)}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  >
                    {ROLES.map((item) => (
                      <Field key={item} orientation="horizontal">
                        <RadioGroupItem value={item} id={`invite-role-${item}`} />
                        <FieldLabel htmlFor={`invite-role-${item}`}>{t(`users.roles.${item}`)}</FieldLabel>
                      </Field>
                    ))}
                  </RadioGroup>
                )}
              />
              <FieldError id="invite-role-error">{errors.role?.message}</FieldError>
            </FieldSet>
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  {t('users.inviteDialog.submitting')}
                </>
              ) : (
                t('users.inviteDialog.submit')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default InviteUserDialog
