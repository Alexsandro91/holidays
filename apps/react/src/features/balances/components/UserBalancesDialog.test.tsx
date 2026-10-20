import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import UserBalancesDialog from '@/features/balances/components/UserBalancesDialog'
import { accrual, balanceMovement, balanceSummary, inheritingAccrual, pageResponse } from '@/test/balancesFixtures'
import { renderRoutes } from '@/test/render'
import { expectNoA11yViolations } from '@/test/axe'
import { server } from '@/test/server'

const renderDialog = (locationId: number | undefined = 1) =>
  renderRoutes([{ path: '/', element: <UserBalancesDialog userId={7} userName="Marco Bianchi" locationId={locationId} onClose={() => undefined} /> }])

const respond = (summary = balanceSummary(), movements = [balanceMovement()]) =>
  server.use(
    http.get('/api/users/7/balances', () => HttpResponse.json({ data: summary })),
    http.get('/api/users/7/balance-movements', () => HttpResponse.json(pageResponse(movements))),
    http.get('/api/users/7/accrual', () => HttpResponse.json({ data: inheritingAccrual() })),
    http.get('/api/locations/1/accrual', () => HttpResponse.json({ data: accrual() })),
  )

const findDialog = () => screen.findByRole('dialog', { name: 'Saldi di Marco Bianchi' })

describe('UserBalancesDialog', () => {
  it('shows a card for each balance with days for the vacation', async () => {
    const summary = balanceSummary()
    // Residuo e maturato diversi dal saldo, per distinguere i numeri
    summary.balances[0] = { ...summary.balances[0], summary: { opening: 600, accrued: 4650, used: 0, corrections: 0, closing: 5250 } }
    respond(summary)
    renderDialog()
    const dialog = await findDialog()

    const vacation = await within(dialog).findByRole('region', { name: 'Ferie' })
    expect(within(vacation).getByText('87,5 h')).toBeInTheDocument()
    expect(within(vacation).getByText('10 h')).toBeInTheDocument()
    expect(within(vacation).getByText('77,5 h')).toBeInTheDocument()
    expect(within(vacation).getByText('≈ 10,9 gg')).toBeInTheDocument()
    expect(within(vacation).getByText('Residuo al 1° gennaio')).toBeInTheDocument()
    expect(within(vacation).getByText('Maturato')).toBeInTheDocument()
    expect(within(vacation).getByText('Usato')).toBeInTheDocument()
    expect(within(vacation).getByText('Correzioni')).toBeInTheDocument()
    // Solo le ferie hanno i giorni
    expect(within(dialog).getByRole('region', { name: 'ROL' })).not.toHaveTextContent('gg')
    expect(within(dialog).getByRole('region', { name: 'Ex festività' })).toBeInTheDocument()
  })

  it('shows a negative balance with the error color', async () => {
    const summary = balanceSummary()
    summary.balances[1] = { ...summary.balances[1], current_minutes: -120 }
    respond(summary)
    renderDialog()
    const dialog = await findDialog()

    const rol = await within(dialog).findByRole('region', { name: 'ROL' })
    expect(within(rol).getByText('−2 h')).toHaveClass('text-destructive')
  })

  it('reloads the summary and the movements for another year', async () => {
    const years: string[] = []
    respond()
    server.use(
      http.get('/api/users/7/balances', ({ request }) => {
        years.push(new URL(request.url).searchParams.get('year') ?? '')
        return HttpResponse.json({ data: balanceSummary() })
      }),
    )
    const { user } = renderDialog()
    const dialog = await findDialog()
    await within(dialog).findByRole('region', { name: 'Ferie' })

    const previous = String(new Date().getFullYear() - 1)
    await user.click(within(dialog).getByRole('combobox', { name: 'Anno' }))
    await user.click(await screen.findByRole('option', { name: previous }))

    await waitFor(() => expect(years).toContain(previous))
  })

  it('lists the movements with author and signed hours, and loads more', async () => {
    const pages: string[] = []
    respond()
    server.use(
      http.get('/api/users/7/balance-movements', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1')
        pages.push(String(page))
        return HttpResponse.json(
          pageResponse(
            page === 1
              ? [balanceMovement({ id: 2, kind: 'adjustment', period: null, note: 'bonus', minutes: 480, actor_name: 'Giulia Rossi' })]
              : [balanceMovement({ id: 1, kind: 'accrual', period: '2026-09', minutes: -90 })],
            page,
            2,
          ),
        )
      }),
    )
    const { user } = renderDialog()
    const dialog = await findDialog()

    const list = await within(dialog).findByRole('list', { name: 'Movimenti' })
    expect(within(list).getByText('Rettifica: bonus')).toBeInTheDocument()
    expect(within(list).getByText('+8 h')).toBeInTheDocument()
    expect(within(list).getByText('da Giulia Rossi')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Carica altre' }))
    expect(await within(dialog).findByText('Maturazione settembre 2026')).toBeInTheDocument()
    expect(within(dialog).getByText('−1,5 h')).toBeInTheDocument()
    expect(pages).toEqual(['1', '2'])
  })

  it('offers Align and Adjust only with the adjust permission', async () => {
    respond(balanceSummary({ can: { adjust: false, manage_accrual: false } }))
    renderDialog()
    const dialog = await findDialog()
    await within(dialog).findByRole('region', { name: 'Ferie' })

    expect(within(dialog).queryByRole('button', { name: 'Allinea alla busta paga' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Rettifica' })).not.toBeInTheDocument()
  })

  it('opens Align and Adjust from the buttons', async () => {
    respond()
    const { user } = renderDialog()
    const dialog = await findDialog()

    await user.click(await within(dialog).findByRole('button', { name: 'Rettifica' }))
    expect(await screen.findByRole('dialog', { name: 'Rettifica i saldi di Marco Bianchi' })).toBeInTheDocument()
  })

  it('lets an admin edit the annual values', async () => {
    respond()
    renderDialog()
    const dialog = await findDialog()

    const section = await within(dialog).findByRole('region', { name: 'Valori annui' })
    expect(await within(section).findByRole('radio', { name: 'Come la sede (160 h)' })).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Salva' })).toBeInTheDocument()
  })

  it('shows the annual values read-only with where they come from', async () => {
    const summary = balanceSummary({ can: { adjust: true, manage_accrual: false } })
    summary.balances[0] = { ...summary.balances[0], annual: { minutes: 9600, source: 'location' }, monthly_quota_minutes: 800 }
    summary.balances[1] = { ...summary.balances[1], annual: { minutes: 12000, source: 'user' } }
    respond(summary)
    renderDialog()
    const dialog = await findDialog()

    const section = await within(dialog).findByRole('region', { name: 'Valori annui' })
    expect(within(section).getByText('Come la sede: 160 h')).toBeInTheDocument()
    expect(within(section).getByText('Valore personale: 200 h')).toBeInTheDocument()
    expect(within(section).getByText('Come l’azienda: 0 h')).toBeInTheDocument()
    expect(within(section).queryByRole('button', { name: 'Salva' })).not.toBeInTheDocument()
    // Chi oggi non matura ha quota 0: nessuna quota mensile, nessun errore
    expect(within(section).getAllByText(/h al mese/)).toHaveLength(1)
  })

  it('says so when the person does not accrue balances', async () => {
    respond(balanceSummary({ applicable: false }))
    renderDialog()
    const dialog = await findDialog()

    expect(await within(dialog).findByText('Questa persona non matura saldi.')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    respond()
    renderDialog()
    const dialog = await findDialog()
    await within(dialog).findByText('Rettifica: bonus').catch(() => undefined)
    await within(dialog).findByRole('region', { name: 'Valori annui' })
    await within(dialog).findByRole('radio', { name: 'Come la sede (160 h)' })
    await expectNoA11yViolations(document.body)
  })
})
