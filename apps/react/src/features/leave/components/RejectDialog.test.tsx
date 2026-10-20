import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RejectDialog from '@/features/leave/components/RejectDialog'
import { leaveRequest } from '@/test/leaveFixtures'
import { renderRoutes } from '@/test/render'

const renderDialog = (onConfirm = vi.fn()) => {
  const onClose = vi.fn()
  const view = renderRoutes([
    { path: '/', element: <RejectDialog open request={leaveRequest({ id: 11 })} pending={false} returnFocusTo={null} onConfirm={onConfirm} onClose={onClose} /> },
  ])
  return { ...view, onConfirm, onClose }
}

describe('RejectDialog', () => {
  it('names the person and the period and sends an empty reason when none is written', async () => {
    const { user, onConfirm } = renderDialog()
    const dialog = await screen.findByRole('dialog', { name: 'Rifiuta la richiesta' })

    expect(within(dialog).getByText('Richiesta di Sara Colombo: 26–30 ottobre 2026.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Rifiuta' }))

    expect(onConfirm).toHaveBeenCalledWith('')
  })

  it('limits the reason to 500 characters and counts them', async () => {
    const { user, onConfirm } = renderDialog()
    const dialog = await screen.findByRole('dialog', { name: 'Rifiuta la richiesta' })
    const field = within(dialog).getByRole('textbox', { name: 'Motivo (facoltativo)' })

    await user.click(field)
    await user.paste('a'.repeat(520))

    expect(field).toHaveValue('a'.repeat(500))
    expect(within(dialog).getByText('500 / 500')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Rifiuta' }))
    expect(onConfirm).toHaveBeenCalledWith('a'.repeat(500))
  })

  it('closes with Annulla', async () => {
    const { user, onClose } = renderDialog()
    const dialog = await screen.findByRole('dialog', { name: 'Rifiuta la richiesta' })

    await user.click(within(dialog).getByRole('button', { name: 'Annulla' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
