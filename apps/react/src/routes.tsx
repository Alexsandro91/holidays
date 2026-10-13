import { createBrowserRouter, type RouteObject } from 'react-router'
import AppShell from '@/components/layout/AppShell'
import AuthLayout from '@/components/layout/AuthLayout'
import RootLayout from '@/components/layout/RootLayout'
import AdminRoute from '@/features/auth/AdminRoute'
import GuestRoute from '@/features/auth/GuestRoute'
import ForgotPasswordPage from '@/features/auth/pages/ForgotPasswordPage'
import LoginPage from '@/features/auth/pages/LoginPage'
import ResetPasswordPage from '@/features/auth/pages/ResetPasswordPage'
import VerifyCodePage from '@/features/auth/pages/VerifyCodePage'
import ProtectedRoute from '@/features/auth/ProtectedRoute'
import UsersPage from '@/features/users/pages/UsersPage'
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
                children: [{ path: '/admin/users', element: <UsersPage />, handle: { titleKey: 'titles.users' } }],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage />, handle: { titleKey: 'titles.notFound' } },
    ],
  },
]

export const router = createBrowserRouter(routes)
