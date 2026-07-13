import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ActivityTable, type ActivityRow } from './activity-table'

const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

const updateTaskMock = vi.fn().mockResolvedValue({ data: {} })
const updateSeriesMock = vi.fn().mockResolvedValue({ data: {} })
const deleteSeriesMock = vi.fn().mockResolvedValue({ data: { success: true } })
const toastErrorMock = vi.fn()

vi.mock('@/server/actions/tasks', () => ({
  updateTask: (input: unknown) => updateTaskMock(input),
  deleteTask: vi.fn().mockResolvedValue({ data: { success: true } }),
}))

vi.mock('@/server/actions/series-mutations', () => ({
  updateSeries: (input: unknown) => updateSeriesMock(input),
  deleteSeries: (input: unknown) => deleteSeriesMock(input),
}))

vi.mock('@/server/actions/consistency', () => ({
  recordCompletion: vi.fn().mockResolvedValue({ data: {} }),
}))

// Keep the real @/lib/ui (DataTable, AlertDialog, ActivityFormDialog) but stub
// toast so the S14 error path is observable.
vi.mock('@/lib/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ui')>()),
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}))

function makeRow(over: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: 'r1',
    title: 'Row title',
    type: 'task',
    status: 'pending',
    dateIso: '2026-06-20T09:00:00.000Z',
    dateLabel: 'Jun 20, 5:00 AM',
    recurrence: null,
    recurrenceCount: null,
    recurrenceDays: null,
    recurrenceGroupId: null,
    location: null,
    description: null,
    color: null,
    allDay: false,
    streak: 0,
    startAt: '2026-06-20T09:00:00.000Z',
    endAt: null,
    targetDate: null,
    activityType: 'solo',
    visibility: 'only_me',
    joinability: null,
    maxParticipants: null,
    ...over,
  }
}

describe('ActivityTable', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    updateTaskMock.mockClear()
    updateSeriesMock.mockClear()
    deleteSeriesMock.mockClear()
    deleteSeriesMock.mockResolvedValue({ data: { success: true } })
    toastErrorMock.mockClear()
  })

  // Prop chain (wave 2.6 S5): page toActivityRow → ActivityRow → ActivityRowActions
  // → useActivityActions. A grouped row (recurrenceGroupId set) must route its
  // edit through updateSeries, proving recurrenceGroupId reached the hook.
  it('threads recurrenceGroupId through ActivityRowActions so a grouped row edit routes through updateSeries', async () => {
    const user = userEvent.setup()
    render(
      <ActivityTable
        items={[
          makeRow({
            id: 'grouped-row',
            type: 'task',
            recurrenceGroupId: 'group-42',
            startAt: '2026-07-01T09:00:00.000Z',
          }),
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Edit task' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(updateSeriesMock).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'grouped-row' }),
      ),
    )
    expect(updateTaskMock).not.toHaveBeenCalled()
  })

  it('an ungrouped row (recurrenceGroupId null) edit keeps routing through updateTask', async () => {
    const user = userEvent.setup()
    render(
      <ActivityTable
        items={[
          makeRow({
            id: 'ungrouped-row',
            type: 'task',
            recurrenceGroupId: null,
            startAt: '2026-07-01T09:00:00.000Z',
          }),
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Edit task' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'ungrouped-row' })),
    )
    expect(updateSeriesMock).not.toHaveBeenCalled()
  })

  // S9 / 0.18.0: the row query carries recurrenceCount + recurrenceDays; the
  // table must thread both into the edit dialog so the seeded recurrence UI
  // (repeat count + weekday picker) opens pre-filled from the persisted series.
  it('threads a weekly series row recurrenceCount and recurrenceDays into the edit dialog', async () => {
    const user = userEvent.setup()
    render(
      <ActivityTable
        items={[
          makeRow({
            id: 'sd',
            type: 'task',
            recurrence: 'weekly',
            recurrenceCount: 4,
            recurrenceDays: ['Mon', 'Wed'],
          }),
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Edit task' }))
    // Repeat count seeded from the row (the dialog defaults to 2 when unseeded).
    expect((screen.getByLabelText('Repeat count') as HTMLInputElement).value).toBe('4')
    // The persisted weekday set seeds the picker: Mon and Wed pressed, an
    // unselected day (Fri) stays unpressed.
    expect(screen.getByRole('button', { name: 'Day: Mon' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Day: Wed' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Day: Fri' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('renders one data row per item with visible field data', () => {
    render(
      <ActivityTable
        items={[
          makeRow({
            id: 'g1',
            title: 'My goal',
            type: 'goal',
            status: 'in_progress',
            dateLabel: 'Target: 2026-07-15',
            dateIso: '2026-07-15',
            recurrence: null,
            location: 'Park',
            activityType: 'solo',
            visibility: 'friends',
          }),
          makeRow({
            id: 't1',
            title: 'My task',
            type: 'task',
            status: 'pending',
            dateLabel: 'Jun 20, 5:00 AM',
            recurrence: 'weekly',
            location: 'Gym',
            activityType: 'group',
            visibility: 'everyone',
          }),
        ]}
      />,
    )

    // one header row + two data rows
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByText('My goal')).toBeInTheDocument()
    expect(screen.getByText('My task')).toBeInTheDocument()
    expect(screen.getByText('goal')).toBeInTheDocument()
    expect(screen.getByText('in_progress')).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
    expect(screen.getByText('Target: 2026-07-15')).toBeInTheDocument()
    expect(screen.getByText('Jun 20, 5:00 AM')).toBeInTheDocument()
    expect(screen.getByText('· weekly', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('solo')).toBeInTheDocument()
    expect(screen.getByText('friends')).toBeInTheDocument()
    expect(screen.getByText('group')).toBeInTheDocument()
    expect(screen.getByText('everyone')).toBeInTheDocument()
  })

  it('no longer renders standalone Location/Color/Recurrence/Type columns', () => {
    render(
      <ActivityTable items={[makeRow({ location: 'Gym', color: 'blue', recurrence: 'daily' })]} />,
    )
    const headerRow = screen.getAllByRole('row')[0]!
    expect(within(headerRow).queryByText('Location')).not.toBeInTheDocument()
    expect(within(headerRow).queryByText('Color')).not.toBeInTheDocument()
    expect(within(headerRow).queryByText('Recurrence')).not.toBeInTheDocument()
    expect(within(headerRow).queryByText('Type')).not.toBeInTheDocument()
    expect(within(headerRow).queryByText('Date')).not.toBeInTheDocument()
    expect(screen.queryByText('Gym')).not.toBeInTheDocument()
    expect(within(headerRow).getByText('Title')).toBeInTheDocument()
    expect(within(headerRow).getByText('When')).toBeInTheDocument()
    expect(within(headerRow).getByText('Status')).toBeInTheDocument()
    expect(within(headerRow).getByText('Social')).toBeInTheDocument()
    expect(within(headerRow).getByText('Actions')).toBeInTheDocument()
  })

  it('renders the color as a swatch dot carrying data-color, aria-hidden', () => {
    const { container } = render(<ActivityTable items={[makeRow({ color: 'blue' })]} />)
    const swatch = container.querySelector('[data-color="blue"]')
    expect(swatch).not.toBeNull()
    expect(swatch).toHaveAttribute('aria-hidden')
    expect(swatch).toHaveStyle({ backgroundColor: 'blue' })
  })

  it('skips the swatch dot entirely when color is null', () => {
    const { container } = render(<ActivityTable items={[makeRow({ color: null })]} />)
    expect(container.querySelector('[aria-hidden][data-color]')).toBeNull()
  })

  it('appends a 🔥 streak suffix in the status column for recurring rows', () => {
    render(<ActivityTable items={[makeRow({ type: 'task', recurrence: 'daily', streak: 3 })]} />)
    expect(screen.getByText('🔥 3')).toBeInTheDocument()
  })

  it('does not show a streak suffix for non-recurring rows', () => {
    render(<ActivityTable items={[makeRow({ recurrence: null, streak: 5 })]} />)
    expect(screen.queryByText(/🔥/)).not.toBeInTheDocument()
  })

  it('does not show a flame for a recurring row with a 0 streak (not completed, wave 2.6 S13)', () => {
    render(<ActivityTable items={[makeRow({ type: 'task', recurrence: 'daily', streak: 0 })]} />)
    expect(screen.queryByText(/🔥/)).not.toBeInTheDocument()
  })

  it('shows a muted recurrence suffix in the When column for recurring rows', () => {
    render(
      <ActivityTable items={[makeRow({ dateLabel: 'Jul 3, 5:00 AM', recurrence: 'daily' })]} />,
    )
    expect(screen.getByText('Jul 3, 5:00 AM')).toBeInTheDocument()
    const suffix = screen.getByText('· daily', { exact: false })
    expect(suffix).toHaveClass('text-muted-foreground')
  })

  it('does not show a recurrence suffix in the When column for non-recurring rows', () => {
    render(<ActivityTable items={[makeRow({ dateLabel: 'Jul 3, 5:00 AM', recurrence: null })]} />)
    expect(screen.getByText('Jul 3, 5:00 AM')).toBeInTheDocument()
    expect(screen.queryByText('·', { exact: false })).not.toBeInTheDocument()
  })

  it('truncates the title text instead of wrapping', () => {
    render(<ActivityTable items={[makeRow({ title: 'A very long activity title' })]} />)
    const titleEl = screen.getByText('A very long activity title')
    expect(titleEl).toHaveClass('truncate')
  })

  it('sorts rows when the Title header is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ActivityTable
        items={[makeRow({ id: 'b', title: 'B task' }), makeRow({ id: 'a', title: 'A task' })]}
      />,
    )
    expect(within(screen.getAllByRole('row')[1]!).getByText('B task')).toBeInTheDocument()
    await user.click(screen.getByText('Title'))
    expect(within(screen.getAllByRole('row')[1]!).getByText('A task')).toBeInTheDocument()
  })

  it('sorts rows when the Social header is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ActivityTable
        items={[
          makeRow({ id: 'z', title: 'Z row', activityType: 'solo', visibility: 'friends' }),
          makeRow({ id: 'a', title: 'A row', activityType: 'group', visibility: 'everyone' }),
        ]}
      />,
    )
    await user.click(screen.getByText('Social'))
    expect(within(screen.getAllByRole('row')[1]!).getByText('A row')).toBeInTheDocument()
  })

  it('sorts the When column with null dates last', async () => {
    const user = userEvent.setup()
    render(
      <ActivityTable
        items={[
          makeRow({ id: 'early', title: 'Early', dateIso: '2026-01-01', dateLabel: 'Early label' }),
          makeRow({ id: 'none', title: 'No date', dateIso: null, dateLabel: 'No date label' }),
          makeRow({ id: 'late', title: 'Late', dateIso: '2026-12-01', dateLabel: 'Late label' }),
        ]}
      />,
    )
    await user.click(screen.getByText('When'))
    const rows = screen.getAllByRole('row')
    // header + 3 data rows; null-date row must be last
    expect(within(rows[rows.length - 1]!).getByText('No date label')).toBeInTheDocument()
  })

  it('exposes edit/delete/complete controls in the actions cell', () => {
    render(
      <ActivityTable
        items={[
          makeRow({
            type: 'task',
            status: 'pending',
            recurrence: null,
            joinability: 'open',
            maxParticipants: 5,
          }),
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: 'Edit task' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete task' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mark complete/i })).toBeInTheDocument()
  })

  it('hides the complete control when the row is already completed', () => {
    render(<ActivityTable items={[makeRow({ status: 'completed' })]} />)
    expect(screen.queryByRole('button', { name: /mark complete/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit task' })).toBeInTheDocument()
  })

  it('renders the complete action as an icon-only button carrying the accessible name', () => {
    render(<ActivityTable items={[makeRow({ status: 'pending', recurrence: null })]} />)
    const completeButton = screen.getByRole('button', { name: /mark complete/i })
    expect(completeButton).toHaveTextContent('')
    expect(completeButton.querySelector('svg')).not.toBeNull()
  })

  it('renders the status cell as a colored Badge per status value', () => {
    render(
      <ActivityTable
        items={[
          makeRow({ id: 'p', title: 'Pending row', status: 'pending' }),
          makeRow({ id: 'i', title: 'In-progress row', status: 'in_progress' }),
          makeRow({ id: 'c', title: 'Completed row', status: 'completed' }),
        ]}
      />,
    )
    const pendingBadge = screen.getByText('pending')
    expect(pendingBadge).toHaveClass('text-foreground')

    const inProgressBadge = screen.getByText('in_progress')
    expect(inProgressBadge).toHaveClass('bg-secondary')
    expect(inProgressBadge).toHaveClass('text-secondary-foreground')

    const completedBadge = screen.getByText('completed')
    expect(completedBadge).toHaveClass('border-transparent')
    expect(completedBadge).toHaveClass('bg-emerald-500/15')
    expect(completedBadge).toHaveClass('text-emerald-400')
  })

  it('renders the type badge inline in the title cell per type value', () => {
    render(
      <ActivityTable
        items={[
          makeRow({ id: 't', title: 'Task row', type: 'task' }),
          makeRow({ id: 'g', title: 'Goal row', type: 'goal' }),
        ]}
      />,
    )
    const taskBadge = screen.getByText('task')
    expect(taskBadge).toHaveClass('bg-secondary')
    expect(taskBadge).toHaveClass('text-secondary-foreground')

    const goalBadge = screen.getByText('goal')
    expect(goalBadge).toHaveClass('text-foreground')
  })

  it('renders the social cell as two Badges (activityType outline, visibility secondary)', () => {
    render(<ActivityTable items={[makeRow({ activityType: 'group', visibility: 'everyone' })]} />)
    const activityTypeBadge = screen.getByText('group')
    expect(activityTypeBadge).toHaveClass('text-foreground')

    const visibilityBadge = screen.getByText('everyone')
    expect(visibilityBadge).toHaveClass('bg-secondary')
    expect(visibilityBadge).toHaveClass('text-secondary-foreground')
  })

  // S14: confirming "Entire series" hides every row of the group instantly via a
  // table-level hidden-group overlay (the items are filtered before DataTable),
  // fires deleteSeries in the background, and reconciles on settle. Two rows share
  // group 'grp-9'; a solo row must stay visible throughout.
  describe('optimistic "Entire series" delete (S14)', () => {
    const groupedItems = (): ActivityRow[] => [
      makeRow({
        id: 'grp-a',
        title: 'Group member A',
        recurrence: 'weekly',
        recurrenceGroupId: 'grp-9',
      }),
      makeRow({
        id: 'grp-b',
        title: 'Group member B',
        recurrence: 'weekly',
        recurrenceGroupId: 'grp-9',
      }),
      makeRow({ id: 'solo', title: 'Solo row', recurrenceGroupId: null }),
    ]

    it('hides every row of the group synchronously on confirm, before deleteSeries resolves', async () => {
      let resolveDelete!: (value: unknown) => void
      deleteSeriesMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveDelete = resolve
        }),
      )
      const user = userEvent.setup()
      render(<ActivityTable items={groupedItems()} />)

      expect(screen.getByText('Group member A')).toBeInTheDocument()
      expect(screen.getByText('Group member B')).toBeInTheDocument()

      await user.click(screen.getAllByRole('button', { name: 'Delete task' })[0]!)
      await user.click(screen.getByRole('button', { name: /entire series/i }))

      await waitFor(() => expect(screen.queryByText('Group member A')).not.toBeInTheDocument())
      expect(screen.queryByText('Group member B')).not.toBeInTheDocument()
      // The ungrouped row is untouched by the group overlay.
      expect(screen.getByText('Solo row')).toBeInTheDocument()
      expect(deleteSeriesMock).toHaveBeenCalledWith({ groupId: 'grp-9' })

      resolveDelete({ data: { success: true } })
    })

    it('refreshes on a successful "Entire series" delete, then clears the overlay once it settles', async () => {
      const user = userEvent.setup()
      render(<ActivityTable items={groupedItems()} />)

      await user.click(screen.getAllByRole('button', { name: 'Delete task' })[0]!)
      await user.click(screen.getByRole('button', { name: /entire series/i }))

      await waitFor(() => expect(deleteSeriesMock).toHaveBeenCalledWith({ groupId: 'grp-9' }))
      await waitFor(() => expect(refreshMock).toHaveBeenCalled())
      // The overlay drops only after the refresh transition settles. With static
      // test items the group rows return (in production the refreshed items omit
      // the deleted group), proving the clear fires post-refresh, not mid-flight.
      await waitFor(() => expect(screen.getByText('Group member A')).toBeInTheDocument())
      expect(screen.getByText('Group member B')).toBeInTheDocument()
    })

    it('reveals the whole group again when "Entire series" fails to persist', async () => {
      deleteSeriesMock.mockResolvedValueOnce({ error: 'Not found' })
      const user = userEvent.setup()
      render(<ActivityTable items={groupedItems()} />)

      await user.click(screen.getAllByRole('button', { name: 'Delete task' })[0]!)
      await user.click(screen.getByRole('button', { name: /entire series/i }))

      await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not delete series'))
      expect(screen.getByText('Group member A')).toBeInTheDocument()
      expect(screen.getByText('Group member B')).toBeInTheDocument()
      expect(refreshMock).not.toHaveBeenCalled()
    })
  })
})
