import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'next-themes'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createQueryClient } from '@/lib/queryClient'

type Entry = string | { pathname: string; search?: string; state?: unknown }

interface RenderRoutesOptions {
  advanceTimers?: (delay: number) => void
}

/** Monta le route indicate con tutti i provider dell'app (query senza retry). */
export const renderRoutes = (routes: RouteObject[], initialEntries: Entry[] = ['/'], options: RenderRoutesOptions = {}) => {
  const queryClient = createQueryClient({ retry: false })
  const router = createMemoryRouter(routes, { initialEntries })
  // con advanceTimers: undefined esplicito user-event sovrascrive il default e fallisce
  const user = userEvent.setup(options.advanceTimers ? { advanceTimers: options.advanceTimers } : {})
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="holidays-theme">
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
  return { ...view, router, queryClient, user }
}
