import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ThemeProvider } from 'next-themes'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import '@/index.css'
import '@/lib/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { reloadOnceForNewVersion } from '@/lib/chunkReload'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/routes'

// Chunk di una versione precedente sparito dopo un deploy: una ricarica scarica la versione nuova. Se anche dopo la
// ricarica il chunk manca, l'errore arriva all'errorElement delle route (pagina d'errore con "Ricarica la pagina")
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForNewVersion()) event.preventDefault()
})

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Elemento #root mancante in index.html')

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="holidays-theme" disableTransitionOnChange>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
)
