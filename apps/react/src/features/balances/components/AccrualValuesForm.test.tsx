import { screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import AccrualValuesForm from '@/features/balances/components/AccrualValuesForm'
import { accrual, inheritingAccrual } from '@/test/balancesFixtures'
import { renderRoutes } from '@/test/render'

const renderForm = (props: Partial<ComponentProps<typeof AccrualValuesForm>> = {}) => {
  const onSubmit = vi.fn()
  const data = inheritingAccrual()
  const view = renderRoutes(
    [{ path: '/', element: <AccrualValuesForm values={data.values} effective={data.effective} inheritable onSubmit={onSubmit} pending={false} {...props} /> }],
    ['/'],
  )
  return { ...view, onSubmit }
}

describe('AccrualValuesForm', () => {
  it('rejects text that is not a number and does not submit', async () => {
    const data = accrual()
    const { user, onSubmit } = renderForm({ values: data.values, effective: data.effective, inheritable: false })

    const field = screen.getByLabelText('Ferie')
    await user.clear(field)
    await user.type(field, 'abc')
    await user.click(screen.getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Inserisci un numero di ore, per esempio 160 o 13,5.')).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects more than 1000 hours', async () => {
    const data = accrual()
    const { user, onSubmit } = renderForm({ values: data.values, effective: data.effective, inheritable: false })

    const field = screen.getByLabelText('ROL')
    await user.clear(field)
    await user.type(field, '1000,5')
    await user.click(screen.getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Il massimo è 1000 ore.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits minutes, with null for the balances that inherit', async () => {
    const { user, onSubmit } = renderForm()

    expect(screen.getAllByRole('radio', { name: 'Come l’azienda (160 h)', checked: true })).toHaveLength(1)
    await user.click(screen.getAllByRole('radio', { name: 'Valore della sede' })[0])
    await user.type(screen.getByLabelText('Ferie, ore all’anno'), '180')
    await user.click(screen.getByRole('button', { name: 'Salva' }))

    expect(onSubmit).toHaveBeenCalledWith({ vacation_minutes: 10800, rol_minutes: null, ex_holidays_minutes: null })
  })

  it('shows the monthly quota for a full time when there is no schedule (company and location)', () => {
    renderForm()

    expect(screen.getByText('13,33 h al mese')).toBeInTheDocument()
  })

  it('proportions the monthly quota to the schedule of a part-time person', async () => {
    // 20 ore in una sede da 40: metà quota, come la maturazione (round(annuo × 1200 ÷ 2400 ÷ 12))
    const { user } = renderForm({ inheritFrom: 'location', schedule: { weeklyMinutes: 1200, locationWeeklyMinutes: 2400 } })

    expect(screen.getByText('6,67 h al mese')).toBeInTheDocument()
    expect(screen.getByText('3 h al mese')).toBeInTheDocument()
    expect(screen.getByText('1,33 h al mese')).toBeInTheDocument()
    expect(screen.queryByText('13,33 h al mese')).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('radio', { name: 'Valore proprio' })[0])
    await user.type(screen.getByLabelText('Ferie, ore all’anno'), '180')

    expect(await screen.findByText('7,5 h al mese')).toBeInTheDocument()
  })

  it('names the own value after the person when the parent is the location', () => {
    renderForm({ inheritFrom: 'location' })

    expect(screen.getAllByRole('radio', { name: /^Come la sede \(/ })).toHaveLength(3)
    expect(screen.getAllByRole('radio', { name: 'Valore proprio' })).toHaveLength(3)
  })
})
