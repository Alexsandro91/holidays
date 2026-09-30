import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'next-themes'
import { describe, expect, it } from 'vitest'
import LanguageMenu from '@/components/preferences/LanguageMenu'
import ThemeMenu from '@/components/preferences/ThemeMenu'
import { expectNoA11yViolations } from '@/test/axe'

describe('preference menus', () => {
  it('switches the interface language', async () => {
    const user = userEvent.setup()
    render(<LanguageMenu />)

    await user.click(screen.getByRole('button', { name: 'Lingua: Italiano' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'English' }))

    expect(await screen.findByRole('button', { name: 'Language: English' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
  })

  it('applies the dark theme', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="holidays-theme">
        <ThemeMenu />
      </ThemeProvider>,
    )

    await expectNoA11yViolations(container)
    await user.click(screen.getByRole('button', { name: 'Tema: Chiaro' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Scuro' }))

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))
  })
})
