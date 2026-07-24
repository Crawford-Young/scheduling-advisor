import { render, screen, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest'
import { SettingsForm } from './settings-form'
import * as calendarActions from '@/server/actions/calendar-prefs'

vi.mock('@/server/actions/calendar-prefs', () => ({
  setCalendarWindow: vi.fn(),
}))

// Radix Select relies on pointer-capture + scrollIntoView DOM APIs happy-dom
// does not implement; stub them so the Default visibility select can be driven
// in tests (mirrors src/components/forms/event-form-dialog.test.tsx).
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
})

// 540 = 09:00, 1020 = 17:00 (minutes since midnight).
const CALENDAR_DEFAULTS = {
  initialWakeMinutes: 540,
  initialSleepMinutes: 1020,
  initialUse24h: false,
  initialDayOverrides: {},
  initialTtlDays: null,
  initialDefaultVisibility: 'private',
} as const

function timeInputRoot(hourInput: HTMLElement): HTMLElement {
  // hour input → spinner div → TimeInput root div
  return hourInput.closest('div')?.parentElement as HTMLElement
}

/** Opens a Radix Select combobox and clicks the option with the given text. */
async function selectComboboxOption(
  user: ReturnType<typeof userEvent.setup>,
  comboboxName: string,
  optionText: string,
): Promise<void> {
  await user.click(screen.getByRole('combobox', { name: comboboxName }))
  const listbox = await screen.findByRole('listbox')
  await user.click(within(listbox).getByText(optionText))
}

describe('SettingsForm', () => {
  beforeEach(() => {
    vi.mocked(calendarActions.setCalendarWindow).mockReset()
  })

  describe('Calendar section', () => {
    it('renders Wake as hour:minute seeded from 540 (09:00) in 12-hour mode', () => {
      render(<SettingsForm {...CALENDAR_DEFAULTS} />)
      expect(screen.getByLabelText('Wake hour')).toHaveValue('9')
      expect(screen.getByLabelText('Wake minute')).toHaveValue('00')
    })

    it('renders Sleep as hour:minute seeded from 1020 (17:00) with PM pressed in 12-hour mode', () => {
      render(<SettingsForm {...CALENDAR_DEFAULTS} />)
      const sleepHour = screen.getByLabelText('Sleep hour')
      expect(sleepHour).toHaveValue('5')
      expect(screen.getByLabelText('Sleep minute')).toHaveValue('00')
      const root = timeInputRoot(sleepHour)
      expect(within(root).getByRole('button', { name: 'PM' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })

    it('uses the label "Wake" (not "Wake up")', () => {
      render(<SettingsForm {...CALENDAR_DEFAULTS} />)
      expect(screen.getByText('Wake')).toBeInTheDocument()
      expect(screen.queryByText('Wake up')).not.toBeInTheDocument()
    })

    it('renders a sleep seed of 1439 minutes as 23:59 (the display cap boundary)', () => {
      render(
        <SettingsForm
          initialWakeMinutes={540}
          initialSleepMinutes={1439}
          initialUse24h={true}
          initialDayOverrides={{}}
          initialTtlDays={null}
          initialDefaultVisibility="private"
        />,
      )
      expect(screen.getByLabelText('Sleep hour')).toHaveValue('23')
      expect(screen.getByLabelText('Sleep minute')).toHaveValue('59')
    })

    it('clamps a migrated 1440-minute day-override sleep seed to 23:59', () => {
      // 1440 = midnight-exclusive-end rows from before the display cap; displaying as
      // 24:00/00:00 would be wrong, so the seed clamps to 23:59 (1439) like the global value.
      render(
        <SettingsForm
          initialWakeMinutes={540}
          initialSleepMinutes={1020}
          initialUse24h={true}
          initialDayOverrides={{ '1': { wake: 360, sleep: 1440 } }}
          initialTtlDays={null}
          initialDefaultVisibility="private"
        />,
      )
      expect(screen.getByLabelText('Mon sleep hour')).toHaveValue('23')
      expect(screen.getByLabelText('Mon sleep minute')).toHaveValue('59')
    })

    it('toggling the 24-hour switch flips the wake/sleep display to military time', async () => {
      const user = userEvent.setup()
      render(<SettingsForm {...CALENDAR_DEFAULTS} />)
      expect(screen.getByLabelText('Wake hour')).toHaveValue('9')
      expect(screen.getByLabelText('Sleep hour')).toHaveValue('5')
      await user.click(screen.getByLabelText('24-hour time'))
      expect(screen.getByLabelText('Wake hour')).toHaveValue('09')
      expect(screen.getByLabelText('Sleep hour')).toHaveValue('17')
    })

    it('editing wake to 06:30 and saving sends workingHoursStart 390', async () => {
      const user = userEvent.setup()
      vi.mocked(calendarActions.setCalendarWindow).mockResolvedValueOnce({ data: null } as never)
      render(<SettingsForm {...CALENDAR_DEFAULTS} />)
      const wakeHour = screen.getByLabelText('Wake hour')
      await user.clear(wakeHour)
      await user.type(wakeHour, '6{Enter}')
      const wakeMinute = screen.getByLabelText('Wake minute')
      await user.clear(wakeMinute)
      await user.type(wakeMinute, '30{Enter}')
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Save calendar settings' }))
      })
      expect(calendarActions.setCalendarWindow).toHaveBeenCalledWith({
        workingHoursStart: 390,
        workingHoursEnd: 1020,
        use24h: false,
        dayOverrides: {},
        ttlDays: null,
        defaultVisibility: 'private',
      })
    })

    it('error result from setCalendarWindow shows the error message', async () => {
      const user = userEvent.setup()
      vi.mocked(calendarActions.setCalendarWindow).mockResolvedValueOnce({
        error: 'boom',
      } as never)
      render(<SettingsForm {...CALENDAR_DEFAULTS} />)
      await user.click(screen.getByLabelText('24-hour time'))
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Save calendar settings' }))
      })
      expect(
        await screen.findByText('Could not save calendar settings — try again.'),
      ).toBeInTheDocument()
    })

    it('renders the 24-hour time switch unchecked from initialUse24h=false', () => {
      render(<SettingsForm {...CALENDAR_DEFAULTS} />)
      expect(screen.getByLabelText('24-hour time')).not.toBeChecked()
    })

    it('toggling the 24-hour switch and saving calls setCalendarWindow with use24h true', async () => {
      const user = userEvent.setup()
      vi.mocked(calendarActions.setCalendarWindow).mockResolvedValueOnce({ data: null } as never)
      render(<SettingsForm {...CALENDAR_DEFAULTS} />)
      await user.click(screen.getByLabelText('24-hour time'))
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Save calendar settings' }))
      })
      expect(calendarActions.setCalendarWindow).toHaveBeenCalledWith({
        workingHoursStart: 540,
        workingHoursEnd: 1020,
        use24h: true,
        dayOverrides: {},
        ttlDays: null,
        defaultVisibility: 'private',
      })
    })

    it('save button is disabled when pristine and enabled after toggling use24h', async () => {
      const user = userEvent.setup()
      render(<SettingsForm {...CALENDAR_DEFAULTS} />)
      expect(screen.getByRole('button', { name: 'Save calendar settings' })).toBeDisabled()
      await user.click(screen.getByLabelText('24-hour time'))
      expect(screen.getByRole('button', { name: 'Save calendar settings' })).toBeEnabled()
    })

    it('enabling Override Mon reveals wake/sleep TimeInputs seeded from global values', async () => {
      const user = userEvent.setup()
      render(<SettingsForm {...CALENDAR_DEFAULTS} />)
      await user.click(screen.getByLabelText('Override Mon'))
      expect(screen.getByLabelText('Mon wake hour')).toHaveValue('9')
      expect(screen.getByLabelText('Mon sleep hour')).toHaveValue('5')
    })

    it('saves dayOverrides with only the enabled day, using its edited values', async () => {
      const user = userEvent.setup()
      vi.mocked(calendarActions.setCalendarWindow).mockResolvedValueOnce({ data: null } as never)
      render(<SettingsForm {...CALENDAR_DEFAULTS} />)
      await user.click(screen.getByLabelText('Override Mon'))
      const monWake = screen.getByLabelText('Mon wake hour')
      await user.clear(monWake)
      await user.type(monWake, '6{Enter}')
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Save calendar settings' }))
      })
      expect(calendarActions.setCalendarWindow).toHaveBeenCalledWith({
        workingHoursStart: 540,
        workingHoursEnd: 1020,
        use24h: false,
        dayOverrides: { '1': { wake: 360, sleep: 1020 } },
        ttlDays: null,
        defaultVisibility: 'private',
      })
    })

    it('disabling an initially-present override omits its key from the save payload', async () => {
      const user = userEvent.setup()
      vi.mocked(calendarActions.setCalendarWindow).mockResolvedValueOnce({ data: null } as never)
      render(
        <SettingsForm
          initialWakeMinutes={540}
          initialSleepMinutes={1020}
          initialUse24h={false}
          initialDayOverrides={{ '2': { wake: 420, sleep: 960 } }}
          initialTtlDays={null}
          initialDefaultVisibility="private"
        />,
      )
      // 420 = 07:00 → 7 AM
      expect(screen.getByLabelText('Tue wake hour')).toHaveValue('7')
      await user.click(screen.getByLabelText('Override Tue'))
      expect(screen.queryByLabelText('Tue wake hour')).not.toBeInTheDocument()
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Save calendar settings' }))
      })
      expect(calendarActions.setCalendarWindow).toHaveBeenCalledWith({
        workingHoursStart: 540,
        workingHoursEnd: 1020,
        use24h: false,
        dayOverrides: {},
        ttlDays: null,
        defaultVisibility: 'private',
      })
    })
  })

  describe('Event auto-delete (TTL) section', () => {
    it('is disabled when initialTtlDays is null and hides the days input', () => {
      render(<SettingsForm {...CALENDAR_DEFAULTS} />)
      expect(screen.getByLabelText('Auto-delete events')).not.toBeChecked()
      expect(screen.queryByLabelText('Delete after (days)')).not.toBeInTheDocument()
    })

    it('is enabled and seeds the days input when initialTtlDays is set', () => {
      render(
        <SettingsForm
          initialWakeMinutes={540}
          initialSleepMinutes={1020}
          initialUse24h={false}
          initialDayOverrides={{}}
          initialTtlDays={45}
          initialDefaultVisibility="private"
        />,
      )
      expect(screen.getByLabelText('Auto-delete events')).toBeChecked()
      expect(screen.getByLabelText('Delete after (days)')).toHaveValue(45)
    })

    it('enabling auto-delete and saving sends the default ttlDays', async () => {
      const user = userEvent.setup()
      vi.mocked(calendarActions.setCalendarWindow).mockResolvedValueOnce({ data: null } as never)
      render(<SettingsForm {...CALENDAR_DEFAULTS} />)
      await user.click(screen.getByLabelText('Auto-delete events'))
      expect(screen.getByLabelText('Delete after (days)')).toHaveValue(30)
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Save calendar settings' }))
      })
      expect(calendarActions.setCalendarWindow).toHaveBeenCalledWith({
        workingHoursStart: 540,
        workingHoursEnd: 1020,
        use24h: false,
        dayOverrides: {},
        ttlDays: 30,
        defaultVisibility: 'private',
      })
    })

    it('editing the days input and saving sends that ttlDays', async () => {
      const user = userEvent.setup()
      vi.mocked(calendarActions.setCalendarWindow).mockResolvedValueOnce({ data: null } as never)
      render(<SettingsForm {...CALENDAR_DEFAULTS} />)
      await user.click(screen.getByLabelText('Auto-delete events'))
      const daysInput = screen.getByLabelText('Delete after (days)')
      const daysGroup = daysInput.closest('div') as HTMLElement
      await user.click(within(daysGroup).getByRole('button', { name: 'Increment' }))
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Save calendar settings' }))
      })
      expect(calendarActions.setCalendarWindow).toHaveBeenCalledWith({
        workingHoursStart: 540,
        workingHoursEnd: 1020,
        use24h: false,
        dayOverrides: {},
        ttlDays: 31,
        defaultVisibility: 'private',
      })
    })

    it('disabling auto-delete (from an initial value) and saving sends ttlDays null', async () => {
      const user = userEvent.setup()
      vi.mocked(calendarActions.setCalendarWindow).mockResolvedValueOnce({ data: null } as never)
      render(
        <SettingsForm
          initialWakeMinutes={540}
          initialSleepMinutes={1020}
          initialUse24h={false}
          initialDayOverrides={{}}
          initialTtlDays={45}
          initialDefaultVisibility="private"
        />,
      )
      await user.click(screen.getByLabelText('Auto-delete events'))
      expect(screen.queryByLabelText('Delete after (days)')).not.toBeInTheDocument()
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Save calendar settings' }))
      })
      expect(calendarActions.setCalendarWindow).toHaveBeenCalledWith({
        workingHoursStart: 540,
        workingHoursEnd: 1020,
        use24h: false,
        dayOverrides: {},
        ttlDays: null,
        defaultVisibility: 'private',
      })
    })
  })

  describe('Default visibility section', () => {
    it('renders the select seeded from initialDefaultVisibility="private"', () => {
      render(<SettingsForm {...CALENDAR_DEFAULTS} />)
      expect(screen.getByRole('combobox', { name: 'Default visibility' })).toHaveTextContent(
        'Private',
      )
    })

    it('renders the select seeded from initialDefaultVisibility="busy"', () => {
      render(<SettingsForm {...CALENDAR_DEFAULTS} initialDefaultVisibility="busy" />)
      expect(screen.getByRole('combobox', { name: 'Default visibility' })).toHaveTextContent(
        'Busy (time only)',
      )
    })

    it('renders the helper text', () => {
      render(<SettingsForm {...CALENDAR_DEFAULTS} />)
      expect(screen.getByText('New events start with this visibility')).toBeInTheDocument()
    })

    it('changing the selection and saving sends the new defaultVisibility', async () => {
      const user = userEvent.setup()
      vi.mocked(calendarActions.setCalendarWindow).mockResolvedValueOnce({ data: null } as never)
      render(<SettingsForm {...CALENDAR_DEFAULTS} />)
      await selectComboboxOption(user, 'Default visibility', 'Public')
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Save calendar settings' }))
      })
      expect(calendarActions.setCalendarWindow).toHaveBeenCalledWith({
        workingHoursStart: 540,
        workingHoursEnd: 1020,
        use24h: false,
        dayOverrides: {},
        ttlDays: null,
        defaultVisibility: 'public',
      })
    })

    it('save button is disabled when pristine and enabled after changing visibility', async () => {
      const user = userEvent.setup()
      render(<SettingsForm {...CALENDAR_DEFAULTS} />)
      expect(screen.getByRole('button', { name: 'Save calendar settings' })).toBeDisabled()
      await selectComboboxOption(user, 'Default visibility', 'Busy (time only)')
      expect(screen.getByRole('button', { name: 'Save calendar settings' })).toBeEnabled()
    })
  })
})
