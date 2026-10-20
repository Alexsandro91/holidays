import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BalanceCards from '@/features/balances/components/BalanceCards'
import { balanceSummary } from '@/test/balancesFixtures'

describe('BalanceCards', () => {
  it('shows planned, pending and available hours of each balance', () => {
    const base = balanceSummary()
    const vacation = base.balances[0]
    if (!vacation) throw new Error('fixture senza ferie')
    const summary = balanceSummary({
      balances: [{ ...vacation, planned_minutes: 960, pending_minutes: 480, available_minutes: 3810 }, ...base.balances.slice(1)],
    })

    render(<BalanceCards summary={summary} />)

    const card = screen.getByRole('region', { name: 'Ferie' })
    expect(within(card).getByText('Pianificate').nextElementSibling).toHaveTextContent('16 h')
    expect(within(card).getByText('In attesa').nextElementSibling).toHaveTextContent('8 h')
    expect(within(card).getByText('Disponibili').nextElementSibling).toHaveTextContent('63,5 h')
  })
})
