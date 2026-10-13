import { screen } from '@testing-library/react'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import PrivacyPage from '@/pages/PrivacyPage'
import { renderRoutes } from '@/test/render'

const routes: RouteObject[] = [{ path: '/privacy', element: <PrivacyPage /> }]

describe('PrivacyPage', () => {
  it('links back to the app home, not to the sign-in page', () => {
    renderRoutes(routes, ['/privacy'])

    // Chi non è entrato viene comunque mandato all'accesso da ProtectedRoute
    expect(screen.getByRole('link', { name: 'Torna a Holidays' })).toHaveAttribute('href', '/')
  })
})
