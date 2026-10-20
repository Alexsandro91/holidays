import type { AbsenceType, AbsenceTypeList } from '@/features/absenceTypes/api'

export const absenceType = (overrides: Partial<AbsenceType> = {}): AbsenceType => ({
  id: 1,
  code: 'vacation',
  name: 'Ferie',
  custom_name: null,
  is_system: true,
  allows_days: true,
  allows_half_days: true,
  allows_hours: false,
  balance: 'vacation',
  requires_approval: true,
  employment_types: ['employee'],
  requires_enablement: false,
  day_count: 'working',
  requires_certificate: false,
  limit: null,
  position: 1,
  archived_at: null,
  enabled_users_count: null,
  ...overrides,
})

export const absenceTypeListResponse = (data: AbsenceType[], counts = { active: data.length, archived: 0 }): AbsenceTypeList => ({ data, meta: { counts } })
