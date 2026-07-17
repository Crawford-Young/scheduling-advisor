import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DayProposalPreview } from './day-proposal-preview'

const getEventsForDayMock = vi.fn()
vi.mock('@/server/actions/day-events', () => ({
  getEventsForDay: (date: string) => getEventsForDayMock(date),
}))

const proposal = { title: 'Standup', start: '09:00', end: '10:00' } as const

function renderPreview(state: 'ghost' | 'confirmed' | 'removed' = 'ghost') {
  return render(<DayProposalPreview date="2026-06-02" proposal={proposal} state={state} />)
}

describe('DayProposalPreview', () => {
  beforeEach(() => {
    getEventsForDayMock.mockReset()
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
})
