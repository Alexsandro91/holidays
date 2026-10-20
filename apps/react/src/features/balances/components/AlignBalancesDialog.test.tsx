import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AlignBalancesDialog from '@/features/balances/components/AlignBalancesDialog'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const atResponse = (date: string) => ({
  data: {
    date,
    balances: { vacation: 4920, rol: 0, ex_holidays: 0 },
    last_alignment: { vacation: null, rol: null, ex_holidays: null },
  },
})

const renderDialog = () => renderRoutes([{ path: '/', element: <AlignBalancesDialog userId={7} userName="Marco Bianchi" open onClose={() => undefined} /> }])

const findDialog = () => screen.findByRole('dialog', { name: 'Allinea alla busta paga di Marco Bianchi' })

describe('AlignBalancesDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T10:00:00'))
    server.use(http.get('/api/users/7/balances/at', ({ request }) => HttpResponse.json(atResponse(new URL(request.url).searchParams.get('date') ?? ''))))
  })
  afterEach(() => vi.useRealTimers())

  it('starts from the last day of the previous month and shows the value in the app', async () => {
    renderDialog()
    const dialog = await findDialog()

    expect(within(dialog).getByLabelText('Data della busta paga')).toHaveValue('2026-09-30')
    expect(await within(dialog).findByText('Nell’app al 30/09/2026: 82 h')).toBeInTheDocument()
  })

  it('previews the movement that will be recorded', async () => {
    const { user } = renderDialog()
    const dialog = await findDialog()
    await within(dialog).findByText('Nell’app al 30/09/2026: 82 h')

    await user.type(within(dialog).getByLabelText('Ferie, in busta paga'), '74,2')

    expect(await within(dialog).findByText('verrà registrato un movimento di −7,8 h')).toBeInTheDocument()
  })

  it('sends only the filled balances and shows the updated balances', async () => {
    let body: unknown = null
    server.use(
      http.post('/api/users/7/balance-alignments', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: { aligned_on: '2026-09-30', deltas: { vacation: -468 } } }, { status: 201 })
      }),
    )
    const { user } = renderDialog()
    const dialog = await findDialog()
    await user.type(within(dialog).getByLabelText('Ferie, in busta paga'), '74,2')
    await user.click(within(dialog).getByRole('button', { name: 'Allinea' }))

    await waitFor(() => expect(body).toEqual({ aligned_on: '2026-09-30', values: { vacation: 4452 }, note: null }))
    expect(await screen.findByText('Saldo allineato al 30/09/2026')).toBeInTheDocument()
    expect(screen.getByText('Ferie 74,2 h')).toBeInTheDocument()
  })

  it('sends nothing when no balance is filled in', async () => {
    let sent = false
    server.use(http.post('/api/users/7/balance-alignments', () => ((sent = true), HttpResponse.json({}, { status: 500 }))))
    const { user } = renderDialog()
    const dialog = await findDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Allinea' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Compila almeno un saldo.')
    expect(sent).toBe(false)
  })

  it('shows the server error on the date field', async () => {
    server.use(
      http.post('/api/users/7/balance-alignments', () =>
        HttpResponse.json({ message: 'Errore', errors: { aligned_on: ['C’è già un allineamento al 15/10/2026.'] } }, { status: 422 }),
      ),
    )
    const { user } = renderDialog()
    const dialog = await findDialog()
    await user.type(within(dialog).getByLabelText('Ferie, in busta paga'), '74,2')
    await user.click(within(dialog).getByRole('button', { name: 'Allinea' }))

    expect(await within(dialog).findByText('C’è già un allineamento al 15/10/2026.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Data della busta paga')).toHaveAttribute('aria-invalid', 'true')
  })
})
