import { Suspense } from 'react'
import { Outlet } from 'react-router'
import FullPageLoader from '@/components/layout/FullPageLoader'
import RouteAnnouncer from '@/components/layout/RouteAnnouncer'
import { Toaster } from '@/components/ui/sonner'

const RootLayout = () => (
  <>
    <RouteAnnouncer />
    {/* Layout dell'area riservata caricato a richiesta (vedi routes.tsx) */}
    <Suspense fallback={<FullPageLoader />}>
      <Outlet />
    </Suspense>
    <Toaster />
  </>
)

export default RootLayout
