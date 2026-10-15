import { render, screen, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import UserHistoryDialog from '@/features/history/components/UserHistoryDialog'
import { createQueryClient } from '@/lib/queryClient'
import { expectNoA11yViolations } from '@/test/axe'
import { historyEntry, historyPage } from '@/test/historyFixtures'
import { server } from '@/test/server'
import { managedUser } from '@/test/usersFixtures'

const renderDialog = () => {
  const client = createQueryClient({ retry: false })
  const view = render(
    <QueryClientProvider client={client}>
      <UserHistoryDialog user={managedUser({ id: 7, name: 'Marco Bianchi' })} onClose={() => undefined} />
    </QueryClientProvider>,
  )
  return { ...view, user: userEvent.setup() }
}

describe('UserHistoryDialog', () => {
  it('lists the steps of the account with who made them', async () => {
    server.use(
      http.get('/api/users/7/history', () =>
        HttpResponse.json(
          historyPage([
            historyEntry({ id: 2, summary: 'Sede: Sede principale → Bergamo', actor_name: 'Giulia Rossi' }),
            historyEntry({ id: 1, event: 'invited', summary: 'Invitato come Dipendente, Utente, sede Sede principale', actor_name: null }),
          ]),
        ),
      ),
    )
    renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Storico di Marco Bianchi' })
    expect(await within(dialog).findByText('Sede: Sede principale → Bergamo')).toBeInTheDocument()
    expect(within(dialog).getByText('da Giulia Rossi')).toBeInTheDocument()
    // Azione di sistema (es. comando del primo admin): nessun autore
    expect(within(dialog).getAllByText(/^da /)).toHaveLength(1)
  })

  it('loads the next page', async () => {
    const pages: string[] = []
    server.use(
      http.get('/api/users/7/history', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1'
        pages.push(page)
        return HttpResponse.json(historyPage([historyEntry({ id: Number(page), summary: `Tappa ${page}` })], { page: Number(page), lastPage: 2 }))
      }),
    )
    const { user } = renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Storico di Marco Bianchi' })
    await within(dialog).findByText('Tappa 1')
    await user.click(within(dialog).getByRole('button', { name: 'Carica altre' }))

    expect(await within(dialog).findByText('Tappa 2')).toBeInTheDocument()
    expect(pages).toEqual(['1', '2'])
  })

  it('keeps the loaded steps when the next page fails and retries it', async () => {
    let failNext = true
    server.use(
      http.get('/api/users/7/history', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1'
        if (page === '2' && failNext) {
          failNext = false
          return HttpResponse.json({ message: 'Errore' }, { status: 500 })
        }
        return HttpResponse.json(historyPage([historyEntry({ id: Number(page), summary: `Tappa ${page}` })], { page: Number(page), lastPage: 2 }))
      }),
    )
    const { user } = renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Storico di Marco Bianchi' })
    await within(dialog).findByText('Tappa 1')
    await user.click(within(dialog).getByRole('button', { name: 'Carica altre' }))

    // Le tappe già caricate restano: l'errore compare accanto al pulsante, con Riprova
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Non è stato possibile caricare altre tappe.')
    expect(within(dialog).getByText('Tappa 1')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Riprova' }))

    expect(await within(dialog).findByText('Tappa 2')).toBeInTheDocument()
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('offers a retry when the history cannot be loaded', async () => {
    let fail = true
    server.use(
      http.get('/api/users/7/history', () => {
        if (fail) {
          fail = false
          return HttpResponse.json({ message: 'Errore' }, { status: 500 })
        }
        return HttpResponse.json(historyPage([historyEntry({ summary: 'Tappa 1' })]))
      }),
    )
    const { user } = renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Storico di Marco Bianchi' })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Non è stato possibile caricare lo storico.')
    await user.click(within(dialog).getByRole('button', { name: 'Riprova' }))

    expect(await within(dialog).findByText('Tappa 1')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    server.use(http.get('/api/users/7/history', () => HttpResponse.json(historyPage([historyEntry()]))))
    renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Storico di Marco Bianchi' })
    await within(dialog).findByText('Ruolo: Utente → Responsabile')
    await expectNoA11yViolations(document.body)
  })
})
