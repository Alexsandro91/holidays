import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import SettingsPage from '@/features/settings/pages/SettingsPage'
import { accrual } from '@/test/balancesFixtures'
import { expectNoA11yViolations } from '@/test/axe'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

describe('SettingsPage', () => {
  it('shows the company values in hours with the monthly quota and the inheritance text', async () => {
    server.use(http.get('/api/settings/accrual', () => HttpResponse.json({ data: accrual() })))
    const { container } = renderRoutes([{ path: '/', element: <SettingsPage /> }], ['/'])

    expect(await screen.findByRole('heading', { level: 2, name: 'Maturazione annua' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Ferie')).toHaveValue('160')
    expect(screen.getByLabelText('ROL')).toHaveValue('72')
    expect(screen.getByLabelText('Ex festività')).toHaveValue('32')
    expect(screen.getByText('13,33 h al mese')).toBeInTheDocument()
    expect(screen.getByText(/sedi e persone ereditano/i)).toBeInTheDocument()
    expect(screen.getByText(/dalla prossima maturazione/i)).toBeInTheDocument()
    await expectNoA11yViolations(container)
  })

  it('saves the values in minutes', async () => {
    let body: unknown = null
    server.use(
      http.get('/api/settings/accrual', () => HttpResponse.json({ data: accrual({ values: { vacation_minutes: 9000, rol_minutes: 0, ex_holidays_minutes: 0 } }) })),
      http.patch('/api/settings/accrual', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: accrual() })
      }),
    )
    const { user } = renderRoutes([{ path: '/', element: <SettingsPage /> }], ['/'])

    const vacation = await screen.findByLabelText('Ferie')
    await user.clear(vacation)
    await user.type(vacation, '160')
    const rol = screen.getByLabelText('ROL')
    await user.clear(rol)
    await user.type(rol, '72')
    const exHolidays = screen.getByLabelText('Ex festività')
    await user.clear(exHolidays)
    await user.type(exHolidays, '32')
    await user.click(screen.getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Valori salvati.')).toBeInTheDocument()
    expect(body).toEqual({ vacation_minutes: 9600, rol_minutes: 4320, ex_holidays_minutes: 1920 })
  })
})
