import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalendarClient } from '@/components/calendar/calendar-client'

// ── Contract tests against the REAL @/lib/ui WeekCalendarView ────────────────
//
// These tests deliberately do NOT mock WeekCalendarView. They exercise the
// actual library chip popover (details + inline edit form) to prove the app is
// wired to the component's REAL event contract:
//   • clicking a chip opens the library popover (details visible);
//   • the popover's own Edit form → Save calls onEventEdit with the FINISHED
//     edit, which the app persists via updateTask (bug #1: editing through the
//     calendar previously handed off to a second app dialog and never persisted).
//
// Only the server actions and the router are mocked.

const updateTaskMock = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'e1' } }))
const createTaskMock = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'e1' } }))
const deleteTaskMock = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { success: true } }))
const rescheduleTaskMock = vi.hoisted(() => vi.fn().mockResolvedValue({ data: {} }))
const refreshMock = vi.hoisted(() => vi.fn())
const recordCompletionMock = vi.hoisted(() => vi.fn().mockResolvedValue({ data: {} }))

// Full-day per-day windows (fractional hours) so the 9am event stays in view.
const DAY_WINDOWS = Array.from({ length: 7 }, () => ({ wake: 0, sleep: 24 }))

vi.mock('@/server/actions/consistency', () => ({
  rescheduleTask: rescheduleTaskMock,
  recordCompletion: recordCompletionMock,
}))
vi.mock('@/server/actions/tasks', () => ({
  createTask: createTaskMock,
  updateTask: updateTaskMock,
  deleteTask: deleteTaskMock,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

const events = [
  {
    id: 'e1',
    title: 'Morning run',
    start: '2026-01-05T09:00:00.000Z',
    end: '2026-01-05T10:00:00.000Z',
    type: 'task' as const,
    status: 'pending' as const,
    streak: 0,
    activityType: 'solo',
    visibility: 'only_me',
    recurrence: 'weekly',
  },
]

describe('CalendarClient — library contract (real WeekCalendarView)', () => {
  beforeEach(() => {
    updateTaskMock.mockClear()
    updateTaskMock.mockResolvedValue({ data: { id: 'e1' } })
    createTaskMock.mockClear()
    deleteTaskMock.mockClear()
    rescheduleTaskMock.mockClear()
    refreshMock.mockClear()
  })

  it('clicking a chip opens the library popover with event details', async () => {
    const user = userEvent.setup()
    // Full-day window so the 9am event is always in view regardless of defaults.
    render(
      <CalendarClient
        weekStart="2026-01-04"
        events={events}
        wakeHour={0}
        sleepHour={24}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    const chip = screen.getByRole('button', { name: /Morning run/i })
    await user.click(chip)

    // The popover exposes its own Edit and Delete affordances — proof the real
    // library popover (not an app dialog) opened.
    expect(await screen.findByRole('button', { name: /^Edit$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Delete$/i })).toBeInTheDocument()
  })

  it('editing via the chip popover Save persists the finished edit through updateTask', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart="2026-01-04"
        events={events}
        wakeHour={0}
        sleepHour={24}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Morning run/i }))
    await user.click(await screen.findByRole('button', { name: /^Edit$/i }))

    // The popover's own edit form: change the title, then Save.
    const titleInput = await screen.findByLabelText('Title')
    await user.clear(titleInput)
    await user.type(titleInput, 'Evening run')

    // Ignore any drag-artifact reschedule from the opening pointer sequence.
    rescheduleTaskMock.mockClear()

    await user.click(screen.getByRole('button', { name: /^Save$/i }))

    await waitFor(() => expect(updateTaskMock).toHaveBeenCalledTimes(1))
    const arg = updateTaskMock.mock.calls[0]![0] as Record<string, unknown>
    // The FINISHED edit is persisted — not the original event, not via a dialog.
    expect(arg.id).toBe('e1')
    expect(arg.title).toBe('Evening run')
    // recurrence round-trips out of the popover's Repeat select (seeded 'weekly').
    expect(arg.recurrence).toBe('weekly')
    expect(refreshMock).toHaveBeenCalled()
  })

  it('the chip popover carries no app-owned activity dialog', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart="2026-01-04"
        events={events}
        wakeHour={0}
        sleepHour={24}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Morning run/i }))
    await user.click(await screen.findByRole('button', { name: /^Edit$/i }))

    // No second, app-owned dialog stacks on top of the library popover.
    expect(screen.queryByTestId('activity-form-dialog')).not.toBeInTheDocument()
    // And there is no app "+ New" button on the calendar toolbar.
    expect(screen.queryByRole('button', { name: '+ New' })).not.toBeInTheDocument()
  })

  it('deleting via the chip popover opens the app confirm dialog and calls deleteTask', async () => {
    const user = userEvent.setup()
    render(
      <CalendarClient
        weekStart="2026-01-04"
        events={events}
        wakeHour={0}
        sleepHour={24}
        dayWindows={DAY_WINDOWS}
        use24h={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Morning run/i }))
    await user.click(await screen.findByRole('button', { name: /^Delete$/i }))

    // App-owned confirm step (the library popover Delete has no confirm of its own).
    const confirm = await screen.findByRole('alertdialog')
    await user.click(within(confirm).getByRole('button', { name: /^Delete$/i }))

    await waitFor(() => expect(deleteTaskMock).toHaveBeenCalledWith({ id: 'e1' }))
  })
})
