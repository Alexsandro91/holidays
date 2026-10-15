import type { Closure, Location, LocationDetail, WorkSchedule } from '@/features/locations/api'

export const schedule = (overrides: Partial<WorkSchedule> = {}): WorkSchedule => ({
  id: 1,
  valid_from: '2026-01-01',
  follows_location: false,
  minutes: [480, 480, 480, 480, 480, 0, 0],
  is_started: true,
  ...overrides,
})

export const location = (overrides: Partial<Location> = {}): Location => ({
  id: 1,
  name: 'Sede principale',
  city: 'Milano',
  country: 'IT',
  timezone: 'Europe/Rome',
  patron_day: 7,
  patron_month: 12,
  is_primary: true,
  archived_at: null,
  users_count: 12,
  managers_count: 2,
  ...overrides,
})

export const locationDetail = (overrides: Partial<LocationDetail> = {}): LocationDetail => ({
  ...location(),
  current_schedule: schedule(),
  ...overrides,
})

export const closure = (overrides: Partial<Closure> = {}): Closure => ({
  id: 1,
  location_id: null,
  location_name: null,
  starts_on: '2026-08-10',
  ends_on: '2026-08-21',
  description: 'Chiusura estiva',
  ...overrides,
})

export const locationListResponse = (locations: Location[], counts = { active: locations.length, archived: 0 }) => ({
  data: locations,
  links: {},
  meta: { current_page: 1, last_page: 1, per_page: 25, total: locations.length, counts },
})
