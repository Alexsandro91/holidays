import { lazy } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router'
import AppShell from '@/components/layout/AppShell'
import AuthLayout from '@/components/layout/AuthLayout'
import RootLayout from '@/components/layout/RootLayout'
import AdminRoute from '@/features/auth/AdminRoute'
import GuestRoute from '@/features/auth/GuestRoute'
import LoginPage from '@/features/auth/pages/LoginPage'
import VerifyCodePage from '@/features/auth/pages/VerifyCodePage'
import ProtectedRoute from '@/features/auth/ProtectedRoute'
import HomePage from '@/pages/HomePage'
import NotFoundPage from '@/pages/NotFoundPage'

// Caricate a richiesta (pagine admin e pagine poco usate): restano fuori dal bundle iniziale. Il fallback è il
// Suspense di AppShell e AuthLayout
const ForgotPasswordPage = lazy(() => import('@/features/auth/pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/features/auth/pages/ResetPasswordPage'))
const AcceptInvitationPage = lazy(() => import('@/features/invitations/pages/AcceptInvitationPage'))
const UsersAdminPage = lazy(() => import('@/features/users/pages/UsersAdminPage'))
const AdministratorsPage = lazy(() => import('@/features/administrators/pages/AdministratorsPage'))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage'))

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
              { path: '/forgot-password', element: <ForgotPasswordPage />, handle: { titleKey: 'titles.forgotPassword' } },
              { path: '/reset-password/:token', element: <ResetPasswordPage />, handle: { titleKey: 'titles.resetPassword' } },
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
            children: [
              { path: '/', element: <HomePage />, handle: { titleKey: 'titles.home' } },
              {
                element: <AdminRoute />,
                children: [
                  { path: '/admin/users', element: <UsersAdminPage />, handle: { titleKey: 'titles.users' } },
                  { path: '/admin/administrators', element: <AdministratorsPage />, handle: { titleKey: 'titles.administrators' } },
                ],
              },
            ],
          },
        ],
      },
      {
        element: <AuthLayout />,
        children: [
          // Fuori da GuestRoute: con una sessione aperta la pagina chiede di uscire invece di reindirizzare in silenzio
          { path: '/invitation/:token', element: <AcceptInvitationPage />, handle: { titleKey: 'titles.invitation' } },
          { path: '/privacy', element: <PrivacyPage />, handle: { titleKey: 'titles.privacy' } },
        ],
      },
      { path: '*', element: <NotFoundPage />, handle: { titleKey: 'titles.notFound' } },
    ],
  },
]

export const router = createBrowserRouter(routes)
