import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import LeavePage from '@/features/balances/pages/LeavePage'
import { expectNoA11yViolations } from '@/test/axe'
import { balanceMovement, balanceSummary, pageResponse } from '@/test/balancesFixtures'
import { absenceTypeOption } from '@/test/absenceTypesFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [{ path: '/leave', element: <LeavePage /> }]

const ownSummary = (applicable = true) => balanceSummary({ applicable, can: { adjust: false, manage_accrual: false } })

const types = [
  absenceTypeOption(),
  absenceTypeOption({ id: 2, name: 'Permesso studio', requires_enablement: true }),
]

const respond = (summary = ownSummary(), movements = [balanceMovement()]) =>
  server.use(
    http.get('/api/profile/balances', () => HttpResponse.json({ data: summary })),
    http.get('/api/profile/balance-movements', () => HttpResponse.json(pageResponse(movements))),
    http.get('/api/profile/absence-types', () => HttpResponse.json({ data: types })),
  )

describe('LeavePage', () => {
  it('shows the own cards and movements without actor, buttons or annual values, plus the usable types', async () => {
    respond()
    renderRoutes(routes, ['/leave'])

    expect(await screen.findByRole('heading', { level: 1, name: 'Ferie e permessi' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Ferie' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'ROL' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Ex festività' })).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Movimenti' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Rettifica' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Allinea alla busta paga' })).not.toBeInTheDocument()
    expect(screen.queryByText('Valori annui')).not.toBeInTheDocument()
    const typesList = await screen.findByRole('list', { name: 'Tipi di assenza che puoi usare' })
    expect(within(typesList).getByText('Ferie')).toBeInTheDocument()
    expect(within(typesList).getByText('Permesso studio')).toBeInTheDocument()
    await expectNoA11yViolations(document.body)
  })

  it('explains that a person without balances has none and still lists the types', async () => {
    respond(ownSummary(false))
    renderRoutes(routes, ['/leave'])

    expect(await screen.findByText(/Non hai saldi/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Ferie' })).not.toBeInTheDocument()
    const typesList = await screen.findByRole('list', { name: 'Tipi di assenza che puoi usare' })
    expect(within(typesList).getByText('Permesso studio')).toBeInTheDocument()
  })

  it('offers a retry when the balances do not load', async () => {
    server.use(
      http.get('/api/profile/balances', () => HttpResponse.json({ message: 'x' }, { status: 500 })),
      http.get('/api/profile/absence-types', () => HttpResponse.json({ data: types })),
    )
    const { user } = renderRoutes(routes, ['/leave'])

    const alert = await screen.findByRole('alert')
    respond()
    await user.click(within(alert).getByRole('button', { name: 'Riprova' }))
    expect(await screen.findByRole('region', { name: 'Ferie' })).toBeInTheDocument()
  })

  it('shows an empty state when there are no usable types', async () => {
    respond()
    server.use(http.get('/api/profile/absence-types', () => HttpResponse.json({ data: [] })))
    renderRoutes(routes, ['/leave'])

    expect(await screen.findByText('Nessun tipo di assenza disponibile per ora.')).toBeInTheDocument()
  })
})
