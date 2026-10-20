import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import AbsenceTypeFormDialog from '@/features/absenceTypes/components/AbsenceTypeFormDialog'
import type { AbsenceType } from '@/features/absenceTypes/api'
import { absenceType } from '@/test/absenceTypesFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const renderDialog = (type: AbsenceType | null = null) => {
  const onClose = vi.fn()
  const view = renderRoutes([{ path: '/', element: <AbsenceTypeFormDialog open absenceType={type} onClose={onClose} /> }], ['/'])
  return { ...view, onClose }
}

const saved = (overrides: Partial<AbsenceType> = {}) => HttpResponse.json({ data: absenceType({ id: 9, code: null, name: 'Banca ore', is_system: false, ...overrides }) }, { status: 201 })

describe('AbsenceTypeFormDialog', () => {
  it('does not send a type without any way to request it and shows the error', async () => {
    let body: unknown = null
    server.use(
      http.post('/api/absence-types', async ({ request }) => {
        body = await request.json()
        return saved()
      }),
    )
    const { user } = renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Nuovo tipo di assenza' })
    await user.type(within(dialog).getByLabelText('Nome'), 'Banca ore')
    await user.click(within(dialog).getByRole('button', { name: 'Crea tipo' }))

    expect(await within(dialog).findByText('Scegli almeno un modo di chiedere l’assenza.')).toBeInTheDocument()
    expect(body).toBeNull()
  })

  it('creates a type with the chosen fields and a limit', async () => {
    let body: unknown = null
    server.use(
      http.post('/api/absence-types', async ({ request }) => {
        body = await request.json()
        return saved()
      }),
    )
    const { user, onClose } = renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Nuovo tipo di assenza' })
    await user.type(within(dialog).getByLabelText('Nome'), '  Banca ore ')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Ore' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Collaboratori' }))
    await user.type(within(dialog).getByLabelText('Quantità'), '12')
    await user.click(within(dialog).getByRole('button', { name: 'Crea tipo' }))

    expect(await screen.findByText('Tipo Banca ore creato.')).toBeInTheDocument()
    expect(body).toEqual({
      name: 'Banca ore',
      allows_days: false,
      allows_half_days: false,
      allows_hours: true,
      balance: null,
      requires_approval: true,
      employment_types: ['employee', 'intern'],
      requires_enablement: false,
      day_count: 'working',
      requires_certificate: false,
      limit: { amount: 12, unit: 'days', period: 'month' },
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('needs days for the half days', async () => {
    const { user } = renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Nuovo tipo di assenza' })
    await user.type(within(dialog).getByLabelText('Nome'), 'Banca ore')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Mezze giornate' }))
    await user.click(within(dialog).getByRole('button', { name: 'Crea tipo' }))

    expect(await within(dialog).findByText('Le mezze giornate richiedono i giorni.')).toBeInTheDocument()
  })

  it('locks the employment on Employees with a note when a balance is chosen', async () => {
    const { user } = renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Nuovo tipo di assenza' })
    expect(within(dialog).getByRole('checkbox', { name: 'Collaboratori' })).toBeEnabled()
    await user.click(within(dialog).getByRole('combobox', { name: 'Saldo' }))
    await user.click(await screen.findByRole('option', { name: 'ROL' }))

    expect(within(dialog).getByRole('checkbox', { name: 'Dipendenti' })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: 'Dipendenti' })).toBeDisabled()
    expect(within(dialog).getByRole('checkbox', { name: 'Collaboratori' })).not.toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: 'Collaboratori' })).toBeDisabled()
    expect(within(dialog).getByRole('checkbox', { name: 'Stagisti' })).toBeDisabled()
    expect(within(dialog).getByText(/solo per i dipendenti/)).toBeInTheDocument()
  })

  it('sends only employees when the balance is set', async () => {
    let body: unknown = null
    server.use(
      http.post('/api/absence-types', async ({ request }) => {
        body = await request.json()
        return saved()
      }),
    )
    const { user } = renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Nuovo tipo di assenza' })
    await user.type(within(dialog).getByLabelText('Nome'), 'Banca ore')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Ore' }))
    await user.click(within(dialog).getByRole('combobox', { name: 'Saldo' }))
    await user.click(await screen.findByRole('option', { name: 'ROL' }))
    await user.click(within(dialog).getByRole('button', { name: 'Crea tipo' }))

    await waitFor(() => expect(body).toMatchObject({ employment_types: ['employee'], balance: 'rol' }))
  })

  it('shows the server error on the name field', async () => {
    server.use(http.post('/api/absence-types', () => HttpResponse.json({ message: 'x', errors: { name: ['Esiste già un tipo con questo nome.'] } }, { status: 422 })))
    const { user } = renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Nuovo tipo di assenza' })
    await user.type(within(dialog).getByLabelText('Nome'), 'Ferie')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Giorni' }))
    await user.click(within(dialog).getByRole('button', { name: 'Crea tipo' }))

    expect(await within(dialog).findByText('Esiste già un tipo con questo nome.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Nome')).toHaveFocus()
  })

  it('edits a type sending the name only when it changed', async () => {
    let body: unknown = null
    server.use(
      http.patch('/api/absence-types/1', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: absenceType() })
      }),
    )
    const { user } = renderDialog(absenceType())

    const dialog = await screen.findByRole('dialog', { name: 'Modifica Ferie' })
    expect(within(dialog).getByLabelText('Nome')).toHaveValue('Ferie')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Ore' }))
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Tipo Ferie aggiornato.')).toBeInTheDocument()
    expect(body).toEqual({
      allows_days: true,
      allows_half_days: true,
      allows_hours: true,
      balance: 'vacation',
      requires_approval: true,
      employment_types: ['employee'],
      requires_enablement: false,
      day_count: 'working',
      requires_certificate: false,
      limit: null,
    })
  })
})
