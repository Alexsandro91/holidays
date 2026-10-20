import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import UserAbsenceTypesDialog from '@/features/absenceTypes/components/UserAbsenceTypesDialog'
import { absenceTypeOption } from '@/test/absenceTypesFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'
import { managedUser } from '@/test/usersFixtures'

const options = [
  absenceTypeOption({ enabled: false }),
  absenceTypeOption({ id: 5, name: 'Legge 104', requires_enablement: true }),
  absenceTypeOption({ id: 6, name: 'Donazione sangue', requires_enablement: true, enabled: false }),
]

describe('UserAbsenceTypesDialog', () => {
  it('lists the types of the person, with checkboxes only for those that need an enablement, and saves the selected ids', async () => {
    let body: unknown = null
    server.use(
      http.get('/api/users/2/absence-types', () => HttpResponse.json({ data: options })),
      http.put('/api/users/2/absence-type-enablements', async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const onClose = vi.fn()
    const { user } = renderRoutes([{ path: '/', element: <UserAbsenceTypesDialog user={managedUser({ id: 2, name: 'Marco Bianchi' })} onClose={onClose} /> }], ['/'])

    const dialog = await screen.findByRole('dialog', { name: 'Tipi di assenza di Marco Bianchi' })
    expect(await within(dialog).findByText('Ferie')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(2)
    expect(within(dialog).getByRole('checkbox', { name: 'Legge 104' })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: 'Donazione sangue' })).not.toBeChecked()

    await user.click(within(dialog).getByRole('checkbox', { name: 'Donazione sangue' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Legge 104' }))
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(body).toEqual({ absence_type_ids: [6] })
  })
})
