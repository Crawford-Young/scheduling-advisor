import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DayProposalPreview } from './day-proposal-preview'

const getEventsForDayMock = vi.fn()
const getEventsForWeekMock = vi.fn()
vi.mock('@/server/actions/day-events', () => ({
  getEventsForDay: (date: string) => getEventsForDayMock(date),
  getEventsForWeek: (weekStartDate: string) => getEventsForWeekMock(weekStartDate),
}))

function isoAt(year: number, month: number, day: number, hour: number, minute: number): string {
  return new Date(year, month - 1, day, hour, minute).toISOString()
}

const proposal = { title: 'Standup', start: '09:00', end: '10:00' } as const

function renderPreview(state: 'ghost' | 'confirmed' | 'removed' = 'ghost') {
  return render(<DayProposalPreview date="2026-06-02" proposal={proposal} state={state} />)
}

describe('DayProposalPreview', () => {
  beforeEach(() => {
    getEventsForDayMock.mockReset()
    getEventsForWeekMock.mockReset()
  })

  it('fetches events for the given date on mount', async () => {
    getEventsForDayMock.mockResolvedValue([])
    renderPreview()
    await waitFor(() => expect(getEventsForDayMock).toHaveBeenCalledWith('2026-06-02'))
  })

  it('renders existing events and the proposal as a ghost block', async () => {
    getEventsForDayMock.mockResolvedValue([
      {
        id: 'e1',
        title: 'Existing meeting',
        start: new Date(2026, 5, 2, 8, 0).toISOString(),
        end: new Date(2026, 5, 2, 9, 0).toISOString(),
      },
    ])
    renderPreview('ghost')
    expect(await screen.findByText('Existing meeting')).toBeInTheDocument()
    const ghost = await screen.findByText('Standup')
    expect(ghost.closest('[data-testid="day-block"]')).toHaveAttribute('data-variant', 'ghost')
  })

  it('does not mark an overlapping proposal as a conflict in single-day mode (spec §A.5 — strip only)', async () => {
    getEventsForDayMock.mockResolvedValue([
      {
        id: 'e1',
        title: 'Existing meeting',
        start: new Date(2026, 5, 2, 9, 30).toISOString(),
        end: new Date(2026, 5, 2, 10, 30).toISOString(),
      },
    ])
    renderPreview('ghost')
    const block = await screen.findByText('Standup')
    expect(block.closest('[data-testid="day-block"]')).toHaveAttribute('data-variant', 'ghost')
    expect(screen.queryByTestId('conflict-footer')).not.toBeInTheDocument()
  })

  it('shows a recurrence badge for a recurring proposal', async () => {
    getEventsForDayMock.mockResolvedValue([])
    render(
      <DayProposalPreview
        date="2026-06-02"
        proposal={proposal}
        state="ghost"
        recurrence="weekly"
      />,
    )
    expect(await screen.findByTestId('recurrence-badge')).toHaveTextContent('repeats weekly')
  })

  it('shows no recurrence badge for a single proposal', async () => {
    getEventsForDayMock.mockResolvedValue([])
    renderPreview('ghost')
    await waitFor(() => expect(getEventsForDayMock).toHaveBeenCalled())
    expect(screen.queryByTestId('recurrence-badge')).not.toBeInTheDocument()
  })

  it('hides the recurrence badge once the proposal is removed', async () => {
    getEventsForDayMock.mockResolvedValue([
      {
        id: 'e1',
        title: 'Existing meeting',
        start: new Date(2026, 5, 2, 8, 0).toISOString(),
        end: new Date(2026, 5, 2, 9, 0).toISOString(),
      },
    ])
    render(
      <DayProposalPreview
        date="2026-06-02"
        proposal={proposal}
        state="removed"
        recurrence="weekly"
      />,
    )
    expect(await screen.findByText('Existing meeting')).toBeInTheDocument()
    expect(screen.queryByTestId('recurrence-badge')).not.toBeInTheDocument()
  })

  it('renders the proposal as a confirmed block when state is confirmed', async () => {
    getEventsForDayMock.mockResolvedValue([])
    renderPreview('confirmed')
    const block = await screen.findByText('Standup')
    expect(block.closest('[data-testid="day-block"]')).toHaveAttribute('data-variant', 'confirmed')
  })

  it('hides the proposal but keeps existing events when state is removed', async () => {
    getEventsForDayMock.mockResolvedValue([
      {
        id: 'e1',
        title: 'Existing meeting',
        start: new Date(2026, 5, 2, 8, 0).toISOString(),
        end: new Date(2026, 5, 2, 9, 0).toISOString(),
      },
    ])
    renderPreview('removed')
    expect(await screen.findByText('Existing meeting')).toBeInTheDocument()
    expect(screen.queryByText('Standup')).not.toBeInTheDocument()
  })

  it('renders nothing while the fetch is pending', () => {
    getEventsForDayMock.mockReturnValue(new Promise(() => {}))
    const { container } = renderPreview()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the fetch fails (approval never blocked)', async () => {
    getEventsForDayMock.mockRejectedValue(new Error('offline'))
    const { container } = renderPreview()
    await waitFor(() => expect(getEventsForDayMock).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when there are no events and the proposal is removed', async () => {
    getEventsForDayMock.mockResolvedValue([])
    const { container } = renderPreview('removed')
    await waitFor(() => expect(getEventsForDayMock).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('ignores a resolved fetch that lands after unmount', async () => {
    let resolveFetch: (events: readonly unknown[]) => void = () => {}
    getEventsForDayMock.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve
      }),
    )
    const { unmount } = renderPreview()
    unmount()
    resolveFetch([])
    await Promise.resolve()
  })

  it('ignores a rejected fetch that lands after unmount', async () => {
    let rejectFetch: (reason: Error) => void = () => {}
    getEventsForDayMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectFetch = reject
      }),
    )
    const { unmount } = renderPreview()
    unmount()
    rejectFetch(new Error('late'))
    await Promise.resolve()
  })

  describe('week-strip mode', () => {
    it('renders a 7-column week strip with one ghost per in-week occurrence, fetching via getEventsForWeek', async () => {
      getEventsForWeekMock.mockResolvedValue([])
      render(
        <DayProposalPreview
          date="2026-06-01"
          proposal={proposal}
          state="ghost"
          recurrence="weekly"
          recurrenceDays={['Mon', 'Wed', 'Fri']}
        />,
      )
      await waitFor(() => expect(getEventsForWeekMock).toHaveBeenCalledWith('2026-05-31'))
      expect(getEventsForDayMock).not.toHaveBeenCalled()

      const columns = await screen.findAllByTestId('week-strip-column')
      expect(columns).toHaveLength(7)

      const headers = screen.getAllByTestId('week-strip-header')
      expect(headers[0]).toHaveTextContent('S 31')
      expect(headers[1]).toHaveTextContent('M 1')
      expect(headers[1]).toHaveAttribute('data-anchor', 'true')
      expect(headers[0]).not.toHaveAttribute('data-anchor')

      const blocks = screen.getAllByTestId('day-block')
      const ghosts = blocks.filter((block) => block.dataset.variant === 'ghost')
      expect(ghosts).toHaveLength(3)
      ghosts.forEach((ghost) => {
        expect(ghost).toHaveAttribute('aria-label', 'Standup')
        expect(ghost).toHaveAttribute('title', 'Standup')
      })
      expect(screen.queryAllByText('Standup')).toHaveLength(0)

      expect(screen.getByTestId('extent-footer')).toHaveTextContent('repeats indefinitely')
    })

    it('buckets multiple existing events on the same day into that day’s column', async () => {
      getEventsForWeekMock.mockResolvedValue([
        {
          id: 'e1',
          title: 'Standup sync',
          start: isoAt(2026, 6, 3, 8, 0),
          end: isoAt(2026, 6, 3, 8, 30),
        },
        {
          id: 'e2',
          title: 'Design review',
          start: isoAt(2026, 6, 3, 11, 0),
          end: isoAt(2026, 6, 3, 12, 0),
        },
      ])
      render(
        <DayProposalPreview
          date="2026-06-01"
          proposal={proposal}
          state="ghost"
          recurrence="weekly"
          recurrenceDays={['Mon', 'Wed', 'Fri']}
        />,
      )
      await waitFor(() => expect(getEventsForWeekMock).toHaveBeenCalled())
      const columns = await screen.findAllByTestId('week-strip-column')
      const wednesdayColumn = columns[3]!
      expect(wednesdayColumn).toHaveTextContent('Standup sync')
      expect(wednesdayColumn).toHaveTextContent('Design review')
    })

    it('renders a monthly recurrence in single-day mode with a bounded, freq-worded extent footer', async () => {
      getEventsForDayMock.mockResolvedValue([])
      render(
        <DayProposalPreview
          date="2026-06-02"
          proposal={proposal}
          state="ghost"
          recurrence="monthly"
          recurrenceCount={6}
        />,
      )
      await waitFor(() => expect(getEventsForDayMock).toHaveBeenCalledWith('2026-06-02'))
      expect(getEventsForWeekMock).not.toHaveBeenCalled()
      expect(screen.queryByTestId('week-strip-column')).not.toBeInTheDocument()
      expect(await screen.findByTestId('extent-footer')).toHaveTextContent(
        '+ 5 more monthly through Nov 2',
      )
    })

    it('renders a bounded, non-monthly extent footer with no freq word', async () => {
      getEventsForWeekMock.mockResolvedValue([])
      render(
        <DayProposalPreview
          date="2026-06-01"
          proposal={proposal}
          state="ghost"
          recurrence="daily"
          recurrenceCount={10}
        />,
      )
      expect(await screen.findByTestId('extent-footer')).toHaveTextContent(
        '+ 4 more through Jun 10',
      )
    })

    it('omits the extent footer once the whole series is already shown in the visible week', async () => {
      getEventsForDayMock.mockResolvedValue([])
      render(
        <DayProposalPreview
          date="2026-06-01"
          proposal={proposal}
          state="ghost"
          recurrence="weekly"
          recurrenceDays={['Mon']}
          recurrenceCount={1}
        />,
      )
      await waitFor(() => expect(getEventsForDayMock).toHaveBeenCalledWith('2026-06-01'))
      expect(getEventsForWeekMock).not.toHaveBeenCalled()
      await screen.findByTestId('day-proposal-preview')
      expect(screen.queryByTestId('extent-footer')).not.toBeInTheDocument()
    })

    it('marks an overlapping occurrence ghost as a conflict and shows the conflict footer count', async () => {
      getEventsForWeekMock.mockResolvedValue([
        {
          id: 'e1',
          title: 'Existing on Wed',
          start: isoAt(2026, 6, 3, 9, 30),
          end: isoAt(2026, 6, 3, 10, 30),
        },
      ])
      render(
        <DayProposalPreview
          date="2026-06-01"
          proposal={proposal}
          state="ghost"
          recurrence="weekly"
          recurrenceDays={['Mon', 'Wed', 'Fri']}
        />,
      )
      await waitFor(() => expect(getEventsForWeekMock).toHaveBeenCalled())
      const blocks = await screen.findAllByTestId('day-block')
      const conflictBlocks = blocks.filter((block) => block.dataset.variant === 'conflict')
      expect(conflictBlocks).toHaveLength(1)
      expect(conflictBlocks[0]).toHaveAttribute('aria-label', 'Standup')
      expect(screen.getByTestId('conflict-footer')).toHaveTextContent(
        '1 of 3 occurrences overlap existing events',
      )
    })

    it('keeps the confirmed variant over a conflicting occurrence when the proposal is confirmed', async () => {
      getEventsForWeekMock.mockResolvedValue([
        {
          id: 'e1',
          title: 'Existing on Wed',
          start: isoAt(2026, 6, 3, 9, 30),
          end: isoAt(2026, 6, 3, 10, 30),
        },
      ])
      render(
        <DayProposalPreview
          date="2026-06-01"
          proposal={proposal}
          state="confirmed"
          recurrence="weekly"
          recurrenceDays={['Mon', 'Wed', 'Fri']}
        />,
      )
      await waitFor(() => expect(getEventsForWeekMock).toHaveBeenCalled())
      const blocks = await screen.findAllByTestId('day-block')
      expect(blocks.some((block) => block.dataset.variant === 'conflict')).toBe(false)
      const confirmedBlocks = blocks.filter((block) => block.dataset.variant === 'confirmed')
      expect(confirmedBlocks).toHaveLength(3)
      expect(screen.queryByTestId('conflict-footer')).not.toBeInTheDocument()
    })

    it('renders nothing while the week fetch is pending', () => {
      getEventsForWeekMock.mockReturnValue(new Promise(() => {}))
      const { container } = render(
        <DayProposalPreview
          date="2026-06-01"
          proposal={proposal}
          state="ghost"
          recurrence="weekly"
          recurrenceDays={['Mon', 'Wed', 'Fri']}
        />,
      )
      expect(container).toBeEmptyDOMElement()
    })

    it('renders nothing when the week fetch fails (approval never blocked)', async () => {
      getEventsForWeekMock.mockRejectedValue(new Error('offline'))
      const { container } = render(
        <DayProposalPreview
          date="2026-06-01"
          proposal={proposal}
          state="ghost"
          recurrence="weekly"
          recurrenceDays={['Mon', 'Wed', 'Fri']}
        />,
      )
      await waitFor(() => expect(getEventsForWeekMock).toHaveBeenCalled())
      expect(container).toBeEmptyDOMElement()
    })
  })
})
