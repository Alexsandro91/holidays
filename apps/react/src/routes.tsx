import { createBrowserRouter, type RouteObject } from 'react-router'
import AppShell from '@/components/layout/AppShell'
import AuthLayout from '@/components/layout/AuthLayout'
import RootLayout from '@/components/layout/RootLayout'
import GuestRoute from '@/features/auth/GuestRoute'
import LoginPage from '@/features/auth/pages/LoginPage'
import VerifyCodePage from '@/features/auth/pages/VerifyCodePage'
import ProtectedRoute from '@/features/auth/ProtectedRoute'
import HomePage from '@/pages/HomePage'
import NotFoundPage from '@/pages/NotFoundPage'

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      {
        element: <GuestRoute />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: '/login', element: <LoginPage />, handle: { titleKey: 'titles.login' } },
              { path: '/login/verify', element: <VerifyCodePage />, handle: { titleKey: 'titles.verify' } },
            ],
          },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [{ path: '/', element: <HomePage />, handle: { titleKey: 'titles.home' } }],
          },
        ],
      },
      { path: '*', element: <NotFoundPage />, handle: { titleKey: 'titles.notFound' } },
    ],
  },
]

export const router = createBrowserRouter(routes)
