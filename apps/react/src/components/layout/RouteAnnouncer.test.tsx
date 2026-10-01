import { act, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import i18n from '@/lib/i18n'
import { routes } from '@/routes'
import { renderRoutes } from '@/test/render'

describe('RouteAnnouncer', () => {
  it('announces a page only when the address changes, not on a language switch', async () => {
    const { router } = renderRoutes(routes, ['/login'])
    await screen.findByRole('heading', { level: 1, name: 'Accedi' })
    expect(screen.getByText('Pagina: Accedi')).toBeInTheDocument()

    await act(async () => {
      await i18n.changeLanguage('en')
    })

    // Il titolo del documento segue la lingua, l'annuncio resta quello della navigazione
    await waitFor(() => expect(document.title).toBe('Sign in · Holidays'))
    expect(screen.getByText('Pagina: Accedi')).toBeInTheDocument()
    expect(screen.queryByText('Page: Sign in')).not.toBeInTheDocument()

    await act(async () => {
      await router.navigate('/non-esiste')
    })

    expect(await screen.findByText('Page: Page not found')).toBeInTheDocument()
  })
})
