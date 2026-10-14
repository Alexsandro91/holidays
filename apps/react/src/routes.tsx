import { lazy } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router'
import AuthLayout from '@/components/layout/AuthLayout'
import RootLayout from '@/components/layout/RootLayout'
import RouteErrorState from '@/components/layout/RouteErrorState'
import AdminRoute from '@/features/auth/AdminRoute'
import GuestRoute from '@/features/auth/GuestRoute'
import LoginPage from '@/features/auth/pages/LoginPage'
import VerifyCodePage from '@/features/auth/pages/VerifyCodePage'
import ProtectedRoute from '@/features/auth/ProtectedRoute'
import NotFoundPage from '@/pages/NotFoundPage'

// Caricate a richiesta: l'area riservata (layout con sidebar e home) e le pagine admin o poco usate restano fuori dal
// bundle iniziale, che serve all'accesso. Il fallback è il Suspense di RootLayout, AppShell e AuthLayout
const AppShell = lazy(() => import('@/components/layout/AppShell'))
const HomePage = lazy(() => import('@/pages/HomePage'))
const ForgotPasswordPage = lazy(() => import('@/features/auth/pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/features/auth/pages/ResetPasswordPage'))
const AcceptInvitationPage = lazy(() => import('@/features/invitations/pages/AcceptInvitationPage'))
const UsersAdminPage = lazy(() => import('@/features/users/pages/UsersAdminPage'))
const AdministratorsPage = lazy(() => import('@/features/administrators/pages/AdministratorsPage'))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage'))

// Errore di una pagina (es. chunk non scaricato dopo un deploy) mostrato dentro il layout, con la ricarica
const pageErrorElement = <RouteErrorState />

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    // Ultima difesa: errore di un layout o di una guardia, a pagina intera
    errorElement: <RouteErrorState fullPage />,
    children: [
      {
        element: <GuestRoute />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              {
                errorElement: pageErrorElement,
                children: [
                  { path: '/login', element: <LoginPage />, handle: { titleKey: 'titles.login' } },
                  { path: '/forgot-password', element: <ForgotPasswordPage />, handle: { titleKey: 'titles.forgotPassword' } },
                  { path: '/reset-password/:token', element: <ResetPasswordPage />, handle: { titleKey: 'titles.resetPassword' } },
                  { path: '/login/verify', element: <VerifyCodePage />, handle: { titleKey: 'titles.verify' } },
                ],
              },
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
              {
                errorElement: pageErrorElement,
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
        ],
      },
      {
        element: <AuthLayout />,
        children: [
          {
            errorElement: pageErrorElement,
            children: [
              // Fuori da GuestRoute: con una sessione aperta la pagina chiede di uscire invece di reindirizzare in silenzio
              { path: '/invitation/:token', element: <AcceptInvitationPage />, handle: { titleKey: 'titles.invitation' } },
              { path: '/privacy', element: <PrivacyPage />, handle: { titleKey: 'titles.privacy' } },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage />, handle: { titleKey: 'titles.notFound' } },
    ],
  },
]

export const router = createBrowserRouter(routes)
