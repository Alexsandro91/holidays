import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import AdjustBalanceDialog from '@/features/balances/components/AdjustBalanceDialog'
import { balanceSummary } from '@/test/balancesFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const renderDialog = () =>
  renderRoutes([{ path: '/', element: <AdjustBalanceDialog userId={7} userName="Marco Bianchi" summary={balanceSummary()} open onClose={() => undefined} /> }])

const findDialog = () => screen.findByRole('dialog', { name: 'Rettifica i saldi di Marco Bianchi' })

describe('AdjustBalanceDialog', () => {
  it('previews the resulting balance', async () => {
    const { user } = renderDialog()
    const dialog = await findDialog()

    await user.click(within(dialog).getByRole('radio', { name: 'Togli' }))
    await user.type(within(dialog).getByLabelText('Ore'), '4')

    expect(within(dialog).getByText('Ferie dopo la rettifica: 83,5 h')).toBeInTheDocument()
  })

  it('sends the minutes with the right sign', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post('/api/users/7/balance-adjustments', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ data: { id: 9 } }, { status: 201 })
      }),
    )
    const { user } = renderDialog()
    const dialog = await findDialog()

    await user.click(within(dialog).getByRole('radio', { name: 'ROL' }))
    await user.click(within(dialog).getByRole('radio', { name: 'Togli' }))
    await user.type(within(dialog).getByLabelText('Ore'), '4')
    await user.type(within(dialog).getByLabelText('Motivo'), 'ore di agosto non scalate')
    await user.click(within(dialog).getByRole('button', { name: 'Rettifica' }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ balance: 'rol', minutes: -240, note: 'ore di agosto non scalate' })
  })

  it('sends a positive value when adding', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post('/api/users/7/balance-adjustments', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ data: { id: 9 } }, { status: 201 })
      }),
    )
    const { user } = renderDialog()
    const dialog = await findDialog()

    await user.type(within(dialog).getByLabelText('Ore'), '7,5')
    await user.type(within(dialog).getByLabelText('Motivo'), 'recupero')
    await user.click(within(dialog).getByRole('button', { name: 'Rettifica' }))

    await waitFor(() => expect(bodies).toEqual([{ balance: 'vacation', minutes: 450, note: 'recupero' }]))
  })

  it('requires a reason and sends nothing without it', async () => {
    let sent = false
    server.use(http.post('/api/users/7/balance-adjustments', () => ((sent = true), HttpResponse.json({}, { status: 500 }))))
    const { user } = renderDialog()
    const dialog = await findDialog()

    await user.type(within(dialog).getByLabelText('Ore'), '4')
    await user.click(within(dialog).getByRole('button', { name: 'Rettifica' }))

    expect(await within(dialog).findByText('Indica il motivo della rettifica.')).toBeInTheDocument()
    expect(sent).toBe(false)
  })
})
