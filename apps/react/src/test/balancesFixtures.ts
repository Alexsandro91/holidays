import type { BalanceMovement, BalanceOverviewRow, BalanceSummary } from '@/features/balances/api'

export const balanceSummary = (overrides: Partial<BalanceSummary> = {}): BalanceSummary => ({
  applicable: true,
  year: 2026,
  weekly_minutes: 2400,
  location_weekly_minutes: 2400,
  average_day_minutes: 480,
  last_aligned_on: null,
  balances: [
    {
      balance: 'vacation',
      label: 'Ferie',
      current_minutes: 5250,
      summary: { opening: 0, accrued: 5250, used: 0, corrections: 0, closing: 5250 },
      annual: { minutes: 9600, source: 'company' },
      monthly_quota_minutes: 800,
    },
    {
      balance: 'rol',
      label: 'ROL',
      current_minutes: 0,
      summary: { opening: 0, accrued: 0, used: 0, corrections: 0, closing: 0 },
      annual: { minutes: 0, source: 'company' },
      monthly_quota_minutes: 0,
    },
    {
      balance: 'ex_holidays',
      label: 'Ex festività',
      current_minutes: 0,
      summary: { opening: 0, accrued: 0, used: 0, corrections: 0, closing: 0 },
      annual: { minutes: 0, source: 'company' },
      monthly_quota_minutes: 0,
    },
  ],
  can: { adjust: true, manage_accrual: true },
  ...overrides,
})

export const balanceMovement = (overrides: Partial<BalanceMovement> = {}): BalanceMovement => ({
  id: 1,
  balance: 'vacation',
  kind: 'accrual',
  minutes: 800,
  effective_on: '2026-10-01',
  period: '2026-10',
  target_minutes: null,
  note: null,
  actor_name: null,
  created_at: '2026-10-01T02:00:00+02:00',
  ...overrides,
})

export const balanceOverviewRow = (overrides: Partial<BalanceOverviewRow> = {}): BalanceOverviewRow => ({
  user: { id: 2, name: 'Sara Colombo', role: 'employee', role_label: 'Utente', location: { id: 1, name: 'Sede principale' } },
  weekly_minutes: 2400,
  location_weekly_minutes: 2400,
  average_day_minutes: 480,
  balances: {
    vacation: { current_minutes: 5250, annual_minutes: 9600 },
    rol: { current_minutes: 0, annual_minutes: 0 },
    ex_holidays: { current_minutes: 0, annual_minutes: 0 },
  },
  last_aligned_on: null,
  can: { adjust: true },
  ...overrides,
})

/** Risposta paginata di una lista: meta come Utenti. */
export const pageResponse = <T,>(data: T[], currentPage = 1, lastPage = 1) => ({
  data,
  links: {},
  meta: { current_page: currentPage, last_page: lastPage, per_page: 20, total: data.length },
})
