import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { LoaderCircle, UserPlus } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EMPLOYMENT_TYPES, isEmploymentType, useCurrentUser, useMultipleLocations } from '@/features/auth/api'
import { emailField } from '@/features/auth/validation'
import { useLocationOptions } from '@/features/locations/api'
import { useInviteUser } from '@/features/users/api'
import { isApiError } from '@/lib/api'

const createInviteSchema = (t: TFunction) =>
  z
    .object({
      firstName: z.string().trim().min(1, t('validation.firstNameRequired')),
      lastName: z.string().trim().min(1, t('validation.lastNameRequired')),
      email: emailField(t),
      employmentType: z.enum(['employee', 'contractor', 'intern']),
      role: z.enum(['employee', 'manager']),
      // Id della sede scelta come testo (valore della select); vuoto = la principale
      locationId: z.string(),
    })
    .refine(({ employmentType, role }) => employmentType !== 'intern' || role === 'employee', { path: ['role'], message: t('users.internRoleOnly') })

type InviteValues = z.infer<ReturnType<typeof createInviteSchema>>

const ROLES: InviteValues['role'][] = ['employee', 'manager']

const FIELDS: (keyof InviteValues)[] = ['firstName', 'lastName', 'email', 'employmentType', 'role', 'locationId']

const isRole = (value: string): value is InviteValues['role'] => value === 'employee' || value === 'manager'

/** Pulsante "Invita utente" con il dialog di invito: tipo di rapporto per tutti, sede solo per l'admin con più sedi. */
const InviteUserDialog = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const invite = useInviteUser()
  const { data: currentUser } = useCurrentUser()
  const multipleLocations = useMultipleLocations()
  // Il responsabile invita sempre nella sua sede: il campo c'è solo per l'admin (spec SP2 fase 1 §4.5)
  const showLocation = currentUser?.role === 'admin' && multipleLocations
  const locations = useLocationOptions(showLocation && open)
  const primaryId = locations.data?.find((location) => location.is_primary)?.id
  // Evita il doppio invio: letto solo nei gestori di evento. Dopo l'invito riuscito resta attivo finché il dialog
  // non si riapre: durante l'animazione di chiusura il form è ancora nel DOM
  const submitting = useRef(false)
  const schema = useMemo(() => createInviteSchema(t), [t])
  const form = useForm<InviteValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: '', lastName: '', email: '', employmentType: 'employee', role: 'employee', locationId: '' },
  })
  const { errors } = form.formState
  const employmentType = useWatch({ control: form.control, name: 'employmentType' })
  // Uno stagista può essere solo Utente (spec §7.3)
  const roles = employmentType === 'intern' ? ROLES.filter((role) => role === 'employee') : ROLES

  const submit = async (values: InviteValues) => {
    if (submitting.current) return
    submitting.current = true
    const chosen = Number(values.locationId === '' ? primaryId : values.locationId)
    try {
      await invite.mutateAsync({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        role: values.role,
        employmentType: values.employmentType,
        // Senza campo (o senza sedi caricate) il server usa la sua regola: sede di chi invita o principale
        locationId: showLocation && Number.isInteger(chosen) ? chosen : undefined,
      })
    } catch (error) {
      submitting.current = false
      if (isApiError(error, 'validation')) {
        const messages: Record<keyof InviteValues, string | undefined> = {
          firstName: error.fieldErrors.first_name?.[0],
          lastName: error.fieldErrors.last_name?.[0],
          email: error.fieldErrors.email?.[0],
          employmentType: error.fieldErrors.employment_type?.[0],
          role: error.fieldErrors.role?.[0],
          locationId: error.fieldErrors.location_id?.[0],
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
              <FieldLegend variant="label">{t('users.inviteDialog.employmentType')}</FieldLegend>
              <Controller
                control={form.control}
                name="employmentType"
                render={({ field }) => (
                  <RadioGroup
                    aria-invalid={errors.employmentType ? true : undefined}
                    aria-describedby={errors.employmentType ? 'invite-employment-type-error' : undefined}
                    value={field.value}
                    onValueChange={(value) => {
                      if (!isEmploymentType(value)) return
                      field.onChange(value)
                      // Stagista: il ruolo torna Utente, l'unico ammesso
                      if (value === 'intern') form.setValue('role', 'employee')
                    }}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  >
                    {EMPLOYMENT_TYPES.map((type) => (
                      <Field key={type} orientation="horizontal">
                        <RadioGroupItem value={type} id={`invite-employment-type-${type}`} />
                        <FieldLabel htmlFor={`invite-employment-type-${type}`}>{t(`users.employmentTypes.${type}`)}</FieldLabel>
                      </Field>
                    ))}
                  </RadioGroup>
                )}
              />
              <FieldError id="invite-employment-type-error">{errors.employmentType?.message}</FieldError>
            </FieldSet>
            <FieldSet>
              <FieldLegend variant="label">{t('users.inviteDialog.role')}</FieldLegend>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <RadioGroup
                    aria-invalid={errors.role ? true : undefined}
                    aria-describedby={[employmentType === 'intern' ? 'invite-role-note' : '', errors.role ? 'invite-role-error' : ''].filter(Boolean).join(' ') || undefined}
                    value={field.value}
                    onValueChange={(value) => isRole(value) && field.onChange(value)}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  >
                    {roles.map((item) => (
                      <Field key={item} orientation="horizontal">
                        <RadioGroupItem value={item} id={`invite-role-${item}`} />
                        <FieldLabel htmlFor={`invite-role-${item}`}>{t(`users.roles.${item}`)}</FieldLabel>
                      </Field>
                    ))}
                  </RadioGroup>
                )}
              />
              {employmentType === 'intern' && <FieldDescription id="invite-role-note">{t('users.internRoleOnly')}</FieldDescription>}
              <FieldError id="invite-role-error">{errors.role?.message}</FieldError>
            </FieldSet>
            {showLocation && (
              <Field data-invalid={errors.locationId ? true : undefined}>
                <Label id="invite-location-label" htmlFor="invite-location">
                  {t('users.inviteDialog.location')}
                </Label>
                <Controller
                  control={form.control}
                  name="locationId"
                  render={({ field }) => (
                    <Select value={field.value === '' ? (primaryId === undefined ? '' : String(primaryId)) : field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        id="invite-location"
                        aria-labelledby="invite-location-label"
                        aria-invalid={errors.locationId ? true : undefined}
                        aria-describedby={errors.locationId ? 'invite-location-error' : undefined}
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {(locations.data ?? []).map((location) => (
                          <SelectItem key={location.id} value={String(location.id)}>
                            {location.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError id="invite-location-error">{errors.locationId?.message}</FieldError>
              </Field>
            )}
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
