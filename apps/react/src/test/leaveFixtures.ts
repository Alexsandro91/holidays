import type { LeavePreview, LeaveRequest, ProfileCalendar } from '@/features/leave/api'

export const leaveRequest = (overrides: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id: 1,
  user: { id: 2, name: 'Sara Colombo' },
  absence_type: { id: 1, name: 'Ferie', balance: 'vacation' },
  unit: 'days',
  starts_on: '2026-10-26',
  ends_on: '2026-10-30',
  half: null,
  starts_at: null,
  ends_at: null,
  minutes: 2400,
  working_days: 5,
  status: 'pending',
  status_label: 'In attesa',
  note: null,
  decision_note: null,
  decided_by_name: null,
  decided_at: null,
  cancellation_requested_at: null,
  cancelled_by_name: null,
  cancelled_at: null,
  source: 'request',
  can: { withdraw: true, request_cancellation: false, approve: false, reject: false, approve_cancellation: false, reject_cancellation: false, cancel: false },
  ...overrides,
})

export const leavePreview = (overrides: Partial<LeavePreview> = {}): LeavePreview => ({
  days: [
    { date: '2026-10-26', minutes: 480 },
    { date: '2026-10-27', minutes: 480 },
  ],
  minutes: 960,
  working_days: 2,
  balance: { balance: 'vacation', current_minutes: 5250, available_minutes: 5250, after_minutes: 4290 },
  warnings: [],
  ...overrides,
})

export const profileCalendar = (overrides: Partial<ProfileCalendar> = {}): ProfileCalendar => ({
  days: [
    { date: '2026-10-24', minutes: 0, reasons: [{ type: 'weekend', label: 'Riposo settimanale' }] },
    { date: '2026-10-26', minutes: 480, reasons: [] },
  ],
  requests: [leaveRequest()],
  ...overrides,
})
