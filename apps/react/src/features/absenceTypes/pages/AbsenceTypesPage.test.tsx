import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import AbsenceTypesPage from '@/features/absenceTypes/pages/AbsenceTypesPage'
import { absenceType, absenceTypeListResponse } from '@/test/absenceTypesFixtures'
import { expectNoA11yViolations } from '@/test/axe'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [{ path: '/admin/absence-types', element: <AbsenceTypesPage /> }]

const vacation = absenceType()
const law104 = absenceType({
  id: 2,
  code: 'law_104',
  name: 'Legge 104',
  allows_half_days: false,
  allows_hours: true,
  balance: null,
  employment_types: ['employee', 'contractor', 'intern'],
  requires_enablement: true,
  enabled_users_count: 2,
  limit: { amount: 3, unit: 'days', period: 'month' },
  position: 2,
})
const custom = absenceType({
  id: 3,
  code: null,
  name: 'Banca ore',
  is_system: false,
  allows_days: false,
  allows_half_days: false,
  allows_hours: true,
  balance: null,
  requires_approval: false,
  employment_types: ['employee', 'intern'],
  position: 3,
})
const renamed = absenceType({ id: 4, code: 'rol', name: 'Permessi', custom_name: 'Permessi', balance: 'rol', position: 4 })
const old = absenceType({ id: 5, code: null, name: 'Vecchio tipo', is_system: false, archived_at: '2026-09-01T10:00:00+02:00', position: 5 })

const listing = (onRequest: (url: URL) => void = () => undefined, active = [vacation, law104, custom, renamed], archived = [old]) =>
  server.use(
    http.get('/api/absence-types', ({ request }) => {
      const url = new URL(request.url)
      onRequest(url)
      const list = url.searchParams.get('filter[status]') === 'archived' ? archived : active
      return HttpResponse.json(absenceTypeListResponse(list, { active: active.length, archived: archived.length }))
    }),
  )

const row = async (name: string): Promise<HTMLElement> => {
  const table = await screen.findByRole('table')
  const found = within(table)
    .getAllByRole('row')
    .find((item) => within(item).queryAllByText(name, { exact: true }).length > 0)
  if (!found) throw new Error(`Riga ${name} mancante`)
  return found
}

describe('AbsenceTypesPage', () => {
  it('lists the types with how they are requested, balance, approval, who they apply to and the limit', async () => {
    listing()
    renderRoutes(routes, ['/admin/absence-types'])

    const vacationRow = await row('Ferie')
    expect(within(vacationRow).getByText('Predefinito')).toBeInTheDocument()
    expect(within(vacationRow).getByText('Giorni, Mezze giornate')).toBeInTheDocument()
    // Nome e saldo si chiamano entrambi Ferie
    expect(within(vacationRow).getAllByText('Ferie')).toHaveLength(2)
    expect(within(vacationRow).getByText('Richiesta')).toBeInTheDocument()
    expect(within(vacationRow).getByText('Dipendenti')).toBeInTheDocument()

    const lawRow = await row('Legge 104')
    expect(within(lawRow).getByText('Giorni, Ore')).toBeInTheDocument()
    expect(within(lawRow).getByText('3 giorni al mese')).toBeInTheDocument()
    expect(within(lawRow).getByText('Tutti')).toBeInTheDocument()
    expect(within(lawRow).getByText('2 persone abilitate')).toBeInTheDocument()

    const customRow = await row('Banca ore')
    expect(within(customRow).queryByText('Predefinito')).not.toBeInTheDocument()
    expect(within(customRow).getByText('Non richiesta')).toBeInTheDocument()
    expect(within(customRow).getByText('Dipendenti, Stagisti')).toBeInTheDocument()
  })

  it('shows the counts on the Active and Archived tabs and the archived list', async () => {
    const urls: URL[] = []
    listing((url) => urls.push(url))
    const { user, router } = renderRoutes(routes, ['/admin/absence-types'])

    await row('Ferie')
    expect(screen.getByRole('tab', { name: /Attivi/ })).toHaveTextContent('4')
    expect(screen.getByRole('tab', { name: /Archiviati/ })).toHaveTextContent('1')

    await user.click(screen.getByRole('tab', { name: /Archiviati/ }))
    expect(await row('Vecchio tipo')).toBeInTheDocument()
    expect(urls.at(-1)?.searchParams.get('filter[status]')).toBe('archived')
    expect(router.state.location.search).toBe('?status=archived')
  })

  it('moves a type down from the menu sending the new order of all the active ids', async () => {
    listing()
    let body: unknown = null
    server.use(
      http.put('/api/absence-types/order', async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/absence-types'])

    await user.click(within(await row('Ferie')).getByRole('button', { name: 'Azioni per Ferie' }))
    expect(screen.queryByRole('menuitem', { name: 'Sposta su' })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('menuitem', { name: 'Sposta giù' }))

    await waitFor(() => expect(body).toEqual({ ids: [2, 1, 3, 4] }))
  })

  it('has no move-down on the last row and move-up on the others', async () => {
    listing()
    const { user } = renderRoutes(routes, ['/admin/absence-types'])

    await user.click(within(await row('Permessi')).getByRole('button', { name: 'Azioni per Permessi' }))
    expect(await screen.findByRole('menuitem', { name: 'Sposta su' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Sposta giù' })).not.toBeInTheDocument()
  })

  it('reorders by dragging a row onto another and goes back when the server refuses', async () => {
    listing()
    let body: unknown = null
    server.use(
      http.put('/api/absence-types/order', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ message: 'Ordine non valido.' }, { status: 422 })
      }),
    )
    renderRoutes(routes, ['/admin/absence-types'])

    const dataTransfer = { setData: () => undefined, effectAllowed: '', dropEffect: '' }
    const dragged = await row('Banca ore')
    fireEvent.dragStart(dragged, { dataTransfer })
    fireEvent.dragOver(await row('Ferie'), { dataTransfer })
    fireEvent.drop(await row('Ferie'), { dataTransfer })

    await waitFor(() => expect(body).toEqual({ ids: [3, 1, 2, 4] }))
    expect(await screen.findByText('Ordine non valido.')).toBeInTheDocument()
    await waitFor(() => {
      const names = within(screen.getByRole('table')).getAllByRole('row').slice(1).map((item) => item.textContent ?? '')
      expect(names[0]).toContain('Ferie')
    })
  })

  it('does not offer reordering in the archived tab', async () => {
    listing()
    const { user } = renderRoutes(routes, ['/admin/absence-types'])

    await row('Ferie')
    await user.click(screen.getByRole('tab', { name: /Archiviati/ }))
    await user.click(within(await row('Vecchio tipo')).getByRole('button', { name: 'Azioni per Vecchio tipo' }))
    expect(await screen.findByRole('menuitem', { name: 'Ripristina' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Sposta giù' })).not.toBeInTheDocument()
  })

  it('offers the default name only for a renamed starting type and sends name null', async () => {
    listing()
    let body: unknown = null
    server.use(
      http.patch('/api/absence-types/4', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: { ...renamed, name: 'ROL', custom_name: null } })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/absence-types'])

    await user.click(within(await row('Ferie')).getByRole('button', { name: 'Azioni per Ferie' }))
    expect(screen.queryByRole('menuitem', { name: 'Ripristina nome predefinito' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(within(await row('Banca ore')).getByRole('button', { name: 'Azioni per Banca ore' }))
    expect(screen.queryByRole('menuitem', { name: 'Ripristina nome predefinito' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(within(await row('Permessi')).getByRole('button', { name: 'Azioni per Permessi' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Ripristina nome predefinito' }))

    await waitFor(() => expect(body).toEqual({ name: null }))
  })

  it('asks for a confirmation before archiving', async () => {
    listing()
    let calls = 0
    server.use(
      http.post('/api/absence-types/3/archive', () => {
        calls += 1
        return HttpResponse.json({ data: { ...custom, archived_at: '2026-10-20T10:00:00+02:00' } })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/absence-types'])

    await user.click(within(await row('Banca ore')).getByRole('button', { name: 'Azioni per Banca ore' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Archivia' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Archiviare Banca ore?' })
    expect(calls).toBe(0)
    await user.click(within(dialog).getByRole('button', { name: 'Archivia' }))

    expect(await screen.findByText('Banca ore archiviato.')).toBeInTheDocument()
    expect(calls).toBe(1)
  })

  it('restores an archived type after a confirmation', async () => {
    listing()
    let calls = 0
    server.use(
      http.post('/api/absence-types/5/restore', () => {
        calls += 1
        return HttpResponse.json({ data: { ...old, archived_at: null } })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/absence-types'])

    await row('Ferie')
    await user.click(screen.getByRole('tab', { name: /Archiviati/ }))
    await user.click(within(await row('Vecchio tipo')).getByRole('button', { name: 'Azioni per Vecchio tipo' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Ripristina' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Ripristinare Vecchio tipo?' })).getByRole('button', { name: 'Ripristina' }))

    expect(await screen.findByText('Vecchio tipo ripristinato.')).toBeInTheDocument()
    expect(calls).toBe(1)
  })

  it('opens the new type dialog from the button', async () => {
    listing()
    const { user } = renderRoutes(routes, ['/admin/absence-types'])

    await user.click(await screen.findByRole('button', { name: 'Nuovo tipo' }))

    expect(await screen.findByRole('dialog', { name: 'Nuovo tipo di assenza' })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    listing()
    const { container } = renderRoutes(routes, ['/admin/absence-types'])

    await row('Ferie')
    await expectNoA11yViolations(container)
  })
})
