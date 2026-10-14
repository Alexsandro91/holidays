import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { reloadPage } from '@/lib/reload'
import { routes } from '@/routes'
import { expectNoA11yViolations } from '@/test/axe'
import { renderRoutes } from '@/test/render'

// Il chunk della pagina non si scarica (deploy nel frattempo o rete assente): import() rifiutato
vi.mock('@/pages/PrivacyPage', () => {
  throw new TypeError('Failed to fetch dynamically imported module: /assets/PrivacyPage-old.js')
})
vi.mock('@/lib/reload', () => ({ reloadPage: vi.fn() }))

describe('routes', () => {
  it('shows a translated error with a reload button inside the layout when a page fails to load', async () => {
    const { user } = renderRoutes(routes, ['/privacy'], { toaster: false })

    const heading = await screen.findByRole('heading', { level: 1, name: 'Pagina non disponibile' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(screen.getByText(/Ricarica per riprovare/)).toBeInTheDocument()
    // Dentro il layout: restano lingua e tema dell'intestazione
    expect(screen.getByRole('button', { name: /Lingua/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ricarica la pagina' }))
    expect(reloadPage).toHaveBeenCalledTimes(1)
  })

  it('has no accessibility violations on the error', async () => {
    const { container } = renderRoutes(routes, ['/privacy'], { toaster: false })

    await screen.findByRole('heading', { level: 1, name: 'Pagina non disponibile' })
    await expectNoA11yViolations(container)
  })
})
