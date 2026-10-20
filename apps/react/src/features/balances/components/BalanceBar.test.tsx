import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BalanceBar from '@/features/balances/components/BalanceBar'

describe('BalanceBar', () => {
  it('has an accessible name with the hours and fills the share of the annual value', () => {
    render(<BalanceBar label="Ferie" currentMinutes={5250} annualMinutes={9600} />)
    const bar = screen.getByRole('progressbar', { name: 'Ferie: 87,5 h su 160 h' })
    expect(bar).toHaveAttribute('aria-valuenow', '55')
  })

  it('caps at 100', () => {
    render(<BalanceBar label="ROL" currentMinutes={9000} annualMinutes={4320} />)
    expect(screen.getByRole('progressbar', { name: 'ROL: 150 h su 72 h' })).toHaveAttribute('aria-valuenow', '100')
  })

  it('uses the error variant and an empty bar when negative', () => {
    render(<BalanceBar label="Ferie" currentMinutes={-480} annualMinutes={9600} />)
    const bar = screen.getByRole('progressbar', { name: 'Ferie: −8 h su 160 h' })
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    expect(bar).toHaveAttribute('data-variant', 'error')
  })

  it('renders nothing when the annual value is zero', () => {
    render(<BalanceBar label="ROL" currentMinutes={0} annualMinutes={0} />)
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
