import { render, screen, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SettingsForm } from './settings-form'
import * as profileActions from '@/server/actions/profile'
import * as calendarActions from '@/server/actions/calendar-prefs'

vi.mock('@/server/actions/profile', () => ({
  setUsername: vi.fn(),
}))

vi.mock('@/server/actions/calendar-prefs', () => ({
  setCalendarWindow: vi.fn(),
}))

const CALENDAR_DEFAULTS = {
  initialWakeHour: 9,
  initialSleepHour: 17,
  initialUse24h: false,
  initialDayOverrides: {},
} as const

describe('SettingsForm', () => {
  beforeEach(() => {
    vi.mocked(profileActions.setUsername).mockReset()
    vi.mocked(calendarActions.setCalendarWindow).mockReset()
  })

  it('renders the initial username value', () => {
    render(<SettingsForm initialUsername="crawford_young" {...CALENDAR_DEFAULTS} />)
    expect(screen.getByDisplayValue('crawford_young')).toBeInTheDocument()
  })

  it('renders empty input when initialUsername is empty', () => {
    render(<SettingsForm initialUsername="" {...CALENDAR_DEFAULTS} />)
    const input = screen.getByPlaceholderText('your_username')
    expect(input).toHaveValue('')
  })

  it('save button is disabled when value equals initialUsername', () => {
    render(<SettingsForm initialUsername="same_name" {...CALENDAR_DEFAULTS} />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('save button becomes enabled after typing a new value', async () => {
    const user = userEvent.setup()
    render(<SettingsForm initialUsername="old_name" {...CALENDAR_DEFAULTS} />)
    const input = screen.getByDisplayValue('old_name')
    await user.clear(input)
    await user.type(input, 'new_name')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('calls setUsername with the current input value when save is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(profileActions.setUsername).mockResolvedValueOnce(undefined)
    render(<SettingsForm initialUsername="old_name" {...CALENDAR_DEFAULTS} />)
    const input = screen.getByDisplayValue('old_name')
    await user.clear(input)
    await user.type(input, 'new_name')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(profileActions.setUsername).toHaveBeenCalledWith('new_name')
  })

  it('shows success message after successful save', async () => {
    const user = userEvent.setup()
    vi.mocked(profileActions.setUsername).mockResolvedValueOnce(undefined)
    render(<SettingsForm initialUsername="old_name" {...CALENDAR_DEFAULTS} />)
    const input = screen.getByDisplayValue('old_name')
    await user.clear(input)
    await user.type(input, 'new_name')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(await screen.findByText('Username saved.')).toBeInTheDocument()
  })

  it('shows error message when setUsername rejects', async () => {
    const user = userEvent.setup()
    vi.mocked(profileActions.setUsername).mockRejectedValueOnce(new Error('taken'))
    render(<SettingsForm initialUsername="old_name" {...CALENDAR_DEFAULTS} />)
    const input = screen.getByDisplayValue('old_name')
    await user.clear(input)
    await user.type(input, 'bad_name')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(await screen.findByText('Invalid or taken username — try another.')).toBeInTheDocument()
  })

  describe('Calendar section', () => {
    it('renders Wake up field seeded with initialWakeHour', () => {
      render(
        <SettingsForm
          initialUsername="user"
          initialWakeHour={7}
          initialSleepHour={22}
          initialUse24h={false}
          initialDayOverrides={{}}
        />,
      )
      expect(screen.getByLabelText('Wake up')).toHaveValue(7)
    })

    it('renders Sleep field seeded with initialSleepHour', () => {
      render(
        <SettingsForm
          initialUsername="user"
          initialWakeHour={7}
          initialSleepHour={22}
          initialUse24h={false}
          initialDayOverrides={{}}
        />,
      )
      expect(screen.getByLabelText('Sleep')).toHaveValue(22)
    })

    it('calls setCalendarWindow with numbers when calendar Save is clicked', async () => {
      const user = userEvent.setup()
      vi.mocked(calendarActions.setCalendarWindow).mockResolvedValueOnce({ data: null } as never)
      render(
        <SettingsForm
          initialUsername="user"
          initialWakeHour={9}
          initialSleepHour={17}
          initialUse24h={false}
          initialDayOverrides={{}}
        />,
      )
      const wakeInput = screen.getByLabelText('Wake up')
      const wakeGroup = wakeInput.closest('div') as HTMLElement
      await user.click(within(wakeGroup).getByRole('button', { name: 'Decrement' }))
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Save calendar settings' }))
      })
      expect(calendarActions.setCalendarWindow).toHaveBeenCalledWith({
        workingHoursStart: 8,
        workingHoursEnd: 17,
        use24h: false,
        dayOverrides: {},
      })
    })

    it('error result from setCalendarWindow shows the error message', async () => {
      const user = userEvent.setup()
      vi.mocked(calendarActions.setCalendarWindow).mockResolvedValueOnce({
        error: 'boom',
      } as never)
      render(
        <SettingsForm
          initialUsername="user"
          initialWakeHour={9}
          initialSleepHour={17}
          initialUse24h={false}
          initialDayOverrides={{}}
        />,
      )
      const wakeInput = screen.getByLabelText('Wake up')
      const wakeGroup = wakeInput.closest('div') as HTMLElement
      await user.click(within(wakeGroup).getByRole('button', { name: 'Decrement' }))
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Save calendar settings' }))
      })
      expect(
        await screen.findByText('Could not save calendar settings — try again.'),
      ).toBeInTheDocument()
    })

    it('renders the 24-hour time switch unchecked from initialUse24h=false', () => {
      render(
        <SettingsForm
          initialUsername="user"
          initialWakeHour={9}
          initialSleepHour={17}
          initialUse24h={false}
          initialDayOverrides={{}}
        />,
      )
      expect(screen.getByLabelText('24-hour time')).not.toBeChecked()
    })

    it('toggling the 24-hour switch and saving calls setCalendarWindow with use24h true', async () => {
      const user = userEvent.setup()
      vi.mocked(calendarActions.setCalendarWindow).mockResolvedValueOnce({ data: null } as never)
      render(
        <SettingsForm
          initialUsername="user"
          initialWakeHour={9}
          initialSleepHour={17}
          initialUse24h={false}
          initialDayOverrides={{}}
        />,
      )
      await user.click(screen.getByLabelText('24-hour time'))
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Save calendar settings' }))
      })
      expect(calendarActions.setCalendarWindow).toHaveBeenCalledWith({
        workingHoursStart: 9,
        workingHoursEnd: 17,
        use24h: true,
        dayOverrides: {},
      })
    })

    it('save button is disabled when pristine and enabled after toggling use24h', async () => {
      const user = userEvent.setup()
      render(
        <SettingsForm
          initialUsername="user"
          initialWakeHour={9}
          initialSleepHour={17}
          initialUse24h={false}
          initialDayOverrides={{}}
        />,
      )
      expect(screen.getByRole('button', { name: 'Save calendar settings' })).toBeDisabled()
      await user.click(screen.getByLabelText('24-hour time'))
      expect(screen.getByRole('button', { name: 'Save calendar settings' })).toBeEnabled()
    })

    it('enabling Override Mon reveals wake/sleep inputs seeded from global wake/sleep', async () => {
      const user = userEvent.setup()
      render(
        <SettingsForm
          initialUsername="user"
          initialWakeHour={9}
          initialSleepHour={17}
          initialUse24h={false}
          initialDayOverrides={{}}
        />,
      )
      await user.click(screen.getByLabelText('Override Mon'))
      expect(screen.getByLabelText('Mon wake hour')).toHaveValue(9)
      expect(screen.getByLabelText('Mon sleep hour')).toHaveValue(17)
    })

    it('saves dayOverrides with only the enabled day, using its edited values', async () => {
      const user = userEvent.setup()
      vi.mocked(calendarActions.setCalendarWindow).mockResolvedValueOnce({ data: null } as never)
      render(
        <SettingsForm
          initialUsername="user"
          initialWakeHour={9}
          initialSleepHour={17}
          initialUse24h={false}
          initialDayOverrides={{}}
        />,
      )
      await user.click(screen.getByLabelText('Override Mon'))
      const monWakeInput = screen.getByLabelText('Mon wake hour')
      const monWakeGroup = monWakeInput.closest('div') as HTMLElement
      await user.click(within(monWakeGroup).getByRole('button', { name: 'Decrement' }))
      await user.click(within(monWakeGroup).getByRole('button', { name: 'Decrement' }))
      await user.click(within(monWakeGroup).getByRole('button', { name: 'Decrement' }))
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Save calendar settings' }))
      })
      expect(calendarActions.setCalendarWindow).toHaveBeenCalledWith({
        workingHoursStart: 9,
        workingHoursEnd: 17,
        use24h: false,
        dayOverrides: { '1': { wake: 6, sleep: 17 } },
      })
    })

    it('disabling an initially-present override omits its key from the save payload', async () => {
      const user = userEvent.setup()
      vi.mocked(calendarActions.setCalendarWindow).mockResolvedValueOnce({ data: null } as never)
      render(
        <SettingsForm
          initialUsername="user"
          initialWakeHour={9}
          initialSleepHour={17}
          initialUse24h={false}
          initialDayOverrides={{ '2': { wake: 7, sleep: 16 } }}
        />,
      )
      expect(screen.getByLabelText('Tue wake hour')).toHaveValue(7)
      await user.click(screen.getByLabelText('Override Tue'))
      expect(screen.queryByLabelText('Tue wake hour')).not.toBeInTheDocument()
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Save calendar settings' }))
      })
      expect(calendarActions.setCalendarWindow).toHaveBeenCalledWith({
        workingHoursStart: 9,
        workingHoursEnd: 17,
        use24h: false,
        dayOverrides: {},
      })
    })
  })
})
