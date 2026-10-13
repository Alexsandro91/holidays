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
    name: z.string().trim().min(1, t('validation.nameRequired')),
    email: emailField(t),
    role: z.enum(['employee', 'manager']),
  })

type InviteValues = z.infer<ReturnType<typeof createInviteSchema>>

const ROLES: InviteValues['role'][] = ['employee', 'manager']

const isRole = (value: string): value is InviteValues['role'] => value === 'employee' || value === 'manager'

/** Pulsante "Invita utente" con il dialog di invito. */
const InviteUserDialog = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const invite = useInviteUser()
  // Evita il doppio invio: letto solo nei gestori di evento
  const submitting = useRef(false)
  const schema = useMemo(() => createInviteSchema(t), [t])
  const form = useForm<InviteValues>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', role: 'employee' } })
  const { errors } = form.formState

  const submit = async (values: InviteValues) => {
    if (submitting.current) return
    submitting.current = true
    try {
      await invite.mutateAsync(values)
      toast.success(t('users.inviteDialog.done', { email: values.email }))
      setOpen(false)
      form.reset()
    } catch (error) {
      if (isApiError(error, 'validation')) {
        const name = error.fieldErrors.name?.[0]
        const email = error.fieldErrors.email?.[0]
        const role = error.fieldErrors.role?.[0]
        if (name) form.setError('name', { message: name })
        if (email) form.setError('email', { message: email })
        if (role) form.setError('role', { message: role })
        // Il focus va al primo campo con errore, nell'ordine in cui compaiono
        const first = name ? 'name' : email ? 'email' : role ? 'role' : null
        if (first) form.setFocus(first)
        else toast.error(error.message)
        return
      }
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error, 'throttled') ? error.message : t('errors.generic'))
    } finally {
      submitting.current = false
    }
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => form.handleSubmit(submit)(event)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
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
            <Field data-invalid={errors.name ? true : undefined}>
              <FieldLabel htmlFor="invite-name">{t('users.inviteDialog.name')}</FieldLabel>
              <Input
                id="invite-name"
                autoComplete="name"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? 'invite-name-error' : undefined}
                {...form.register('name')}
              />
              <FieldError id="invite-name-error">{errors.name?.message}</FieldError>
            </Field>
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
                    value={field.value} onValueChange={(value) => isRole(value) && field.onChange(value)} onBlur={field.onBlur} ref={field.ref}>
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
