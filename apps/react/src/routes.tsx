import { lazy } from 'react'
import { createBrowserRouter, redirect, type RouteObject } from 'react-router'
import AppShell from '@/components/layout/AppShell'
import AuthLayout from '@/components/layout/AuthLayout'
import RootLayout from '@/components/layout/RootLayout'
import RouteErrorState from '@/components/layout/RouteErrorState'
import GuestRoute from '@/features/auth/GuestRoute'
import LoginPage from '@/features/auth/pages/LoginPage'
import VerifyCodePage from '@/features/auth/pages/VerifyCodePage'
import ProtectedRoute from '@/features/auth/ProtectedRoute'
import RoleRoute from '@/features/auth/RoleRoute'
import HomePage from '@/pages/HomePage'
import NotFoundPage from '@/pages/NotFoundPage'

// Caricate a richiesta: le pagine admin o poco usate restano fuori dal bundle iniziale. Layout dell'area riservata e
// home restano statici, così chi entra con una sessione valida non aspetta altri download in fila.
// Il fallback è il Suspense di RootLayout, AppShell e AuthLayout
const ForgotPasswordPage = lazy(() => import('@/features/auth/pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/features/auth/pages/ResetPasswordPage'))
const AcceptInvitationPage = lazy(() => import('@/features/invitations/pages/AcceptInvitationPage'))
const UsersAdminPage = lazy(() => import('@/features/users/pages/UsersAdminPage'))
const AdministratorsPage = lazy(() => import('@/features/administrators/pages/AdministratorsPage'))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage'))
const ProfilePage = lazy(() => import('@/features/profile/pages/ProfilePage'))

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
                  // Per tutti i ruoli: ognuno vede e modifica solo il proprio profilo
                  { path: '/profile', element: <ProfilePage />, handle: { titleKey: 'titles.profile' } },
                  {
                    element: <RoleRoute roles={['manager', 'admin']} />,
                    children: [{ path: '/users', element: <UsersAdminPage />, handle: { titleKey: 'titles.users' } }],
                  },
                  {
                    element: <RoleRoute roles={['admin']} />,
                    children: [{ path: '/admin/administrators', element: <AdministratorsPage />, handle: { titleKey: 'titles.administrators' } }],
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
      // Vecchio indirizzo della lista utenti (link salvati, email): stessa vista con la stessa query string
      { path: '/admin/users', loader: ({ request }) => redirect(`/users${new URL(request.url).search}`) },
      { path: '*', element: <NotFoundPage />, handle: { titleKey: 'titles.notFound' } },
    ],
  },
]

export const router = createBrowserRouter(routes)
