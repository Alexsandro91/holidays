import type { HistoryEntry } from '@/features/history/api'

export const historyEntry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: 1,
  event: 'role_changed',
  summary: 'Ruolo: Utente → Responsabile',
  actor_name: null,
  occurred_at: '2026-03-03T10:00:00+01:00',
  ...overrides,
})

export const historyPage = (entries: HistoryEntry[], { page = 1, lastPage = 1 } = {}) => ({
  data: entries,
  links: {},
  meta: { current_page: page, last_page: lastPage, per_page: 20, total: entries.length },
})
