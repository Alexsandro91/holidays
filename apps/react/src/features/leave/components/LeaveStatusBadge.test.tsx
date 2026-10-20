import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LEAVE_REQUEST_STATUSES, type LeaveRequestStatus } from '@/features/leave/api'
import LeaveStatusBadge from '@/features/leave/components/LeaveStatusBadge'

const LABELS: Record<LeaveRequestStatus, string> = {
  pending: 'In attesa',
  approved: 'Approvata',
  rejected: 'Non approvata',
  withdrawn: 'Ritirata',
  cancellation_requested: 'Annullamento richiesto',
  cancelled: 'Annullata',
}

describe('LeaveStatusBadge', () => {
  it.each(LEAVE_REQUEST_STATUSES)('writes the label of the %s status', (status) => {
    render(<LeaveStatusBadge status={status} />)
    expect(screen.getByText(LABELS[status])).toBeInTheDocument()
  })
})
