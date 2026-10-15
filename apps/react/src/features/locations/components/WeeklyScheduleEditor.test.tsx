import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import WeeklyScheduleEditor from '@/features/locations/components/WeeklyScheduleEditor'
import { expectNoA11yViolations } from '@/test/axe'

/** Editor con lo stato in un genitore, come nei dialog: `last` è l'ultimo valore emesso. */
const renderEditor = (initial = [480, 480, 480, 480, 480, 0, 0]) => {
  const emitted: number[][] = []
  const Host = () => {
    const [value, setValue] = useState(initial)
    return (
      <WeeklyScheduleEditor
        value={value}
        onChange={(next) => {
          emitted.push(next)
          setValue(next)
        }}
      />
    )
  }
  const view = render(<Host />)
  return { ...view, user: userEvent.setup(), last: () => emitted.at(-1) }
}

describe('WeeklyScheduleEditor', () => {
  it('shows working days with their hours and the others as non-working', () => {
    renderEditor([480, 480, 480, 480, 270, 0, 0])

    expect(screen.getByRole('checkbox', { name: 'Lunedì' })).toBeChecked()
    expect(screen.getByLabelText('Ore di venerdì')).toHaveValue('4:30')
    expect(screen.getByRole('checkbox', { name: 'Sabato' })).not.toBeChecked()
    expect(screen.queryByLabelText('Ore di sabato')).not.toBeInTheDocument()
    expect(screen.getAllByText('Non lavorativo')).toHaveLength(2)
  })

  it('turns a day on with 8 hours and off again', async () => {
    const { user, last } = renderEditor()

    await user.click(screen.getByRole('checkbox', { name: 'Sabato' }))
    expect(screen.getByLabelText('Ore di sabato')).toHaveValue('8')
    expect(last()).toEqual([480, 480, 480, 480, 480, 480, 0])

    await user.click(screen.getByRole('checkbox', { name: 'Lunedì' }))
    expect(last()).toEqual([0, 480, 480, 480, 480, 480, 0])
  })

  it('emits the minutes of valid hours and NaN with an error for invalid ones', async () => {
    const { user, last } = renderEditor()

    const friday = screen.getByLabelText('Ore di venerdì')
    await user.clear(friday)
    await user.type(friday, '4,5')
    expect(last()?.[4]).toBe(270)

    await user.clear(friday)
    await user.type(friday, '4:10')
    expect(Number.isNaN(last()?.[4])).toBe(true)
    // L'errore compare lasciando il campo, non a ogni battuta
    expect(screen.queryByText(/Usa quarti d’ora/)).not.toBeInTheDocument()
    await user.tab()
    expect(screen.getByText('Usa quarti d’ora fino a 12 ore (es. 8 o 4:30).')).toBeInTheDocument()
    expect(friday).toHaveAttribute('aria-invalid', 'true')
  })

  it('treats zero hours on a working day as invalid: the day is turned off with the checkbox', async () => {
    const { user, last } = renderEditor()

    const monday = screen.getByLabelText('Ore di lunedì')
    await user.clear(monday)
    await user.type(monday, '0')

    expect(Number.isNaN(last()?.[0])).toBe(true)
  })

  it('has no accessibility violations', async () => {
    const { container } = renderEditor()
    await expectNoA11yViolations(container)
  })
})
