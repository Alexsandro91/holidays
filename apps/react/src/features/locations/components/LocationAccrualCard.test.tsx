import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import LocationAccrualCard from '@/features/locations/components/LocationAccrualCard'
import { accrual, inheritingAccrual } from '@/test/balancesFixtures'
import { locationDetail } from '@/test/locationsFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

describe('LocationAccrualCard', () => {
  it('inherits from the company by default and saves only the chosen value', async () => {
    let body: unknown = null
    server.use(
      http.get('/api/settings/accrual', () => HttpResponse.json({ data: accrual() })),
      http.get('/api/locations/1/accrual', () => HttpResponse.json({ data: inheritingAccrual() })),
      http.put('/api/locations/1/accrual', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: inheritingAccrual() })
      }),
    )
    const { user } = renderRoutes([{ path: '/', element: <LocationAccrualCard location={locationDetail({ id: 1 })} /> }], ['/'])

    const card = (await screen.findByRole('heading', { level: 2, name: 'Maturazione annua' })).closest('section')
    if (!card) throw new Error('Card mancante')
    expect(await within(card).findByRole('radio', { name: 'Come l’azienda (160 h)', checked: true })).toBeInTheDocument()

    await user.click(within(card).getAllByRole('radio', { name: 'Valore della sede' })[0])
    await user.type(within(card).getByLabelText('Ferie, ore all’anno'), '180')
    await user.click(within(card).getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Valori salvati.')).toBeInTheDocument()
    expect(body).toEqual({ vacation_minutes: 10800, rol_minutes: null, ex_holidays_minutes: null })
  })
})
