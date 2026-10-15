import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { Toaster } from '@/components/ui/sonner'
import { todayIn } from '@/features/locations/scheduleFormat'
import UserScheduleDialog from '@/features/users/components/UserScheduleDialog'
import { createQueryClient } from '@/lib/queryClient'
import { expectNoA11yViolations } from '@/test/axe'
import { schedule } from '@/test/locationsFixtures'
import { server } from '@/test/server'
import { managedUser } from '@/test/usersFixtures'

const marco = managedUser({ id: 7, name: 'Marco Bianchi', location: { id: 2, name: 'Bergamo' } })

const renderDialog = () => {
  const client = createQueryClient({ retry: false })
  const view = render(
    <QueryClientProvider client={client}>
      <UserScheduleDialog user={marco} onClose={() => undefined} />
      <Toaster />
    </QueryClientProvider>,
  )
  return { ...view, user: userEvent.setup() }
}

const schedules = (personal = [schedule({ id: 5, valid_from: '2026-02-01', minutes: [240, 240, 240, 240, 240, 0, 0] })]) =>
  server.use(http.get('/api/users/7/schedules', () => HttpResponse.json({ data: { schedules: personal, location_schedule: schedule() } })))

describe('UserScheduleDialog', () => {
  it('starts from the personal schedule in effect and saves a new one from a future day', async () => {
    schedules()
    let body: unknown = null
    server.use(
      http.post('/api/users/7/schedules', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: schedule({ id: 9, valid_from: '2099-03-01', is_started: false }) }, { status: 201 })
      }),
    )
    const { user } = renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Orario di lavoro di Marco Bianchi' })
    expect(await within(dialog).findByRole('radio', { name: 'Orario personale' })).toBeChecked()
    expect(within(dialog).getByLabelText('Ore di lunedì')).toHaveValue('4')
    fireEvent.change(within(dialog).getByLabelText('Vale dal'), { target: { value: '2099-03-01' } })
    await user.clear(within(dialog).getByLabelText('Ore di venerdì'))
    await user.type(within(dialog).getByLabelText('Ore di venerdì'), '2')
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Orario di Marco Bianchi salvato: vale dal 1 marzo 2099.')).toBeInTheDocument()
    expect(body).toEqual({ valid_from: '2099-03-01', minutes: [240, 240, 240, 240, 120, 0, 0] })
  })

  it('proposes tomorrow when the personal schedule in force starts today, which cannot be replaced', async () => {
    const today = todayIn('Europe/Rome')
    schedules([schedule({ id: 5, valid_from: today, minutes: [240, 240, 240, 240, 240, 0, 0] })])
    renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Orario di lavoro di Marco Bianchi' })
    await within(dialog).findByRole('radio', { name: 'Orario personale' })
    expect(within(dialog).getByLabelText('Vale dal')).toHaveValue(new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10))
    expect(within(dialog).getByLabelText('Vale dal')).toHaveAttribute('min', today)
  })

  it('proposes today when the personal schedule in force started earlier', async () => {
    schedules()
    renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Orario di lavoro di Marco Bianchi' })
    await within(dialog).findByRole('radio', { name: 'Orario personale' })
    expect(within(dialog).getByLabelText('Vale dal')).toHaveValue(todayIn('Europe/Rome'))
  })

  it('goes back to the schedule of the location', async () => {
    schedules()
    let body: unknown = null
    server.use(
      http.post('/api/users/7/schedules', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: schedule({ id: 9, follows_location: true, is_started: false }) }, { status: 201 })
      }),
    )
    const { user } = renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Orario di lavoro di Marco Bianchi' })
    await user.click(await within(dialog).findByRole('radio', { name: 'Usa l’orario della sede (Bergamo)' }))
    fireEvent.change(within(dialog).getByLabelText('Vale dal'), { target: { value: '2099-03-01' } })
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    await screen.findByText('Orario di Marco Bianchi salvato: vale dal 1 marzo 2099.')
    expect(body).toEqual({ valid_from: '2099-03-01', follows_location: true })
  })

  it('does not save the schedule of the location again when the person already follows it', async () => {
    schedules([])
    renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Orario di lavoro di Marco Bianchi' })
    expect(await within(dialog).findByRole('radio', { name: 'Usa l’orario della sede (Bergamo)' })).toBeChecked()
    expect(within(dialog).getByText('Segue già l’orario della sede.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Salva' })).toBeDisabled()
  })

  it('has no accessibility violations', async () => {
    schedules()
    renderDialog()

    const dialog = await screen.findByRole('dialog', { name: 'Orario di lavoro di Marco Bianchi' })
    await within(dialog).findByRole('radio', { name: 'Orario personale' })
    await expectNoA11yViolations(document.body)
  })
})
