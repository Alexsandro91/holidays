import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import i18n from '@/lib/i18n'

const renderOpenDialog = () =>
  render(
    <Dialog open>
      <DialogContent>
        <DialogTitle>Titolo</DialogTitle>
        <DialogDescription>Descrizione</DialogDescription>
      </DialogContent>
    </Dialog>,
  )

describe('DialogContent', () => {
  it('dà alla X di chiusura il nome accessibile nella lingua dell’interfaccia', async () => {
    renderOpenDialog()

    expect(screen.getByRole('button', { name: 'Chiudi' })).toBeInTheDocument()

    await i18n.changeLanguage('en')
    expect(await screen.findByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})
