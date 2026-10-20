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
const AbsenceTypesPage = lazy(() => import('@/features/absenceTypes/pages/AbsenceTypesPage'))
const SettingsPage = lazy(() => import('@/features/settings/pages/SettingsPage'))
const BalancesPage = lazy(() => import('@/features/balances/pages/BalancesPage'))
const LocationsPage = lazy(() => import('@/features/locations/pages/LocationsPage'))
const LocationDetailPage = lazy(() => import('@/features/locations/pages/LocationDetailPage'))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage'))
const LeavePage = lazy(() => import('@/features/balances/pages/LeavePage'))
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
                  // Per tutti i ruoli: i propri saldi e i tipi di assenza che valgono per sé (spec SP2 fase 2 §7.6)
                  { path: '/leave', element: <LeavePage />, handle: { titleKey: 'titles.leave' } },
                  {
                    element: <RoleRoute roles={['manager', 'admin']} />,
                    children: [
                      { path: '/users', element: <UsersAdminPage />, handle: { titleKey: 'titles.users' } },
                      // Saldi di ferie, ROL ed ex festività: responsabili (della loro sede) e admin (spec SP2 fase 2 §7.2)
                      { path: '/balances', element: <BalancesPage />, handle: { titleKey: 'titles.balances' } },
                    ],
                  },
                  {
                    element: <RoleRoute roles={['admin']} />,
                    children: [
                      { path: '/admin/administrators', element: <AdministratorsPage />, handle: { titleKey: 'titles.administrators' } },
                      // Tipi di assenza: solo l'admin li configura (spec SP2 fase 2 §7.7)
                      { path: '/admin/absence-types', element: <AbsenceTypesPage />, handle: { titleKey: 'titles.absenceTypes' } },
                      // Impostazioni dell'azienda: valori annui di maturazione (spec SP2 fase 2 §7.8)
                      { path: '/admin/settings', element: <SettingsPage />, handle: { titleKey: 'titles.settings' } },
                      // Sezione Sedi: solo l'admin le gestisce (spec SP2 fase 1 §5.1)
                      { path: '/admin/locations', element: <LocationsPage />, handle: { titleKey: 'titles.locations' } },
                      { path: '/admin/locations/:id', element: <LocationDetailPage />, handle: { titleKey: 'titles.location' } },
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
      // Vecchio indirizzo della lista utenti (link salvati, email): stessa vista con la stessa query string
      { path: '/admin/users', loader: ({ request }) => redirect(`/users${new URL(request.url).search}`) },
      { path: '*', element: <NotFoundPage />, handle: { titleKey: 'titles.notFound' } },
    ],
  },
]

export const router = createBrowserRouter(routes)
