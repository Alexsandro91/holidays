import { Outlet } from 'react-router'
import RouteAnnouncer from '@/components/layout/RouteAnnouncer'
import { Toaster } from '@/components/ui/sonner'

const RootLayout = () => (
  <>
    <RouteAnnouncer />
    <Outlet />
    <Toaster position="bottom-right" />
  </>
)

export default RootLayout
