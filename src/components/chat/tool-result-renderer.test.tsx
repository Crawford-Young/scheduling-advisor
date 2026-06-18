import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ToolResultRenderer } from './tool-result-renderer'

vi.mock('@/lib/ui', () => ({
  WeekCalendarView: () => <div data-testid="week-cal" />,
  ActivityCard: ({
    title,
    type,
    status,
    streak,
    detail,
  }: {
    title: string
    type: string
    status: string
    streak?: number
    detail?: React.ReactNode
  }) => (
    <div data-testid="activity-card" data-type={type} data-status={status} data-streak={streak}>
      <span>{title}</span>
      {detail}
    </div>
  ),
}))
vi.mock('@/components/cards/schedule-suggestion', () => ({
  ScheduleSuggestion: () => <div>sug</div>,
}))
vi.mock('@/components/cards/reflection-card', () => ({ ReflectionCard: () => <div>refl</div> }))
vi.mock('@/components/cards/life-balance-view', () => ({ LifeBalanceView: () => <div>life</div> }))
vi.mock('@/components/chat/action-confirm-card', () => ({
  ActionConfirmCard: ({
    onConfirm,
    onDeny,
  }: {
    onConfirm: () => void
    onDeny: (r: string) => void
  }) => (
    <div>
      <button onClick={onConfirm}>confirm</button>
      <button onClick={() => onDeny('')}>deny</button>
      <button onClick={() => onDeny('wrong time')}>deny-with-reason</button>
    </div>
  ),
}))

function makeInvocation(toolName: string, result: unknown) {
  return { toolCallId: 'tc1', toolName, args: {}, state: 'result' as const, result }
}

describe('ToolResultRenderer', () => {
  it('returns null for unknown tool', () => {
    const { container } = render(
      <ToolResultRenderer toolInvocation={makeInvocation('unknown', {})} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('calls onScheduleUpdate when showWeekCalendar result rendered', () => {
    const onScheduleUpdate = vi.fn()
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('showWeekCalendar', {
          weekStart: '2026-06-02',
          events: [
            {
              id: '1',
              title: 'E',
              start: '2026-06-02T09:00:00',
              end: '2026-06-02T10:00:00',
              type: 'calendar',
            },
          ],
        })}
        onScheduleUpdate={onScheduleUpdate}
      />,
    )
    expect(onScheduleUpdate).toHaveBeenCalledWith('2026-06-02', expect.any(Array))
  })

  it('renders showWeekCalendar with task/goal/habit event types', () => {
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('showWeekCalendar', {
          weekStart: '2026-06-02',
          events: [
            {
              id: '1',
              title: 'A',
              start: '2026-06-02T09:00:00',
              end: '2026-06-02T10:00:00',
              type: 'task',
            },
            {
              id: '2',
              title: 'B',
              start: '2026-06-02T10:00:00',
              end: '2026-06-02T11:00:00',
              type: 'goal',
            },
            {
              id: '3',
              title: 'C',
              start: '2026-06-02T11:00:00',
              end: '2026-06-02T12:00:00',
              type: 'habit',
            },
          ],
        })}
      />,
    )
    expect(screen.getByTestId('week-cal')).toBeInTheDocument()
  })

  it('renders showWeekCalendar without onScheduleUpdate', () => {
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('showWeekCalendar', {
          weekStart: '2026-06-02',
          events: [],
        })}
      />,
    )
    expect(screen.getByTestId('week-cal')).toBeInTheDocument()
  })

  it('renders showWeekCalendar with undefined events (uses empty array fallback)', () => {
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('showWeekCalendar', {
          weekStart: '2026-06-02',
        })}
      />,
    )
    expect(screen.getByTestId('week-cal')).toBeInTheDocument()
  })

  it('passes an empty array to onScheduleUpdate when events are undefined', () => {
    const onScheduleUpdate = vi.fn()
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('showWeekCalendar', {
          weekStart: '2026-06-02',
        })}
        onScheduleUpdate={onScheduleUpdate}
      />,
    )
    expect(onScheduleUpdate).toHaveBeenCalledWith('2026-06-02', [])
  })

  it('deny without append prop does not throw', async () => {
    const user = userEvent.setup()
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('proposeAction', {
          action: 'Run daily',
          entityType: 'habit',
        })}
      />,
    )
    await user.click(screen.getByText('deny'))
  })

  it('calls onItemConfirmed when ActionConfirmCard confirmed', async () => {
    const user = userEvent.setup()
    const onItemConfirmed = vi.fn()
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('proposeAction', {
          action: 'Run daily',
          entityType: 'habit',
          date: '2026-06-02',
          time: '07:00',
        })}
        onItemConfirmed={onItemConfirmed}
      />,
    )
    await user.click(screen.getByText('confirm'))
    expect(onItemConfirmed).toHaveBeenCalledWith('Run daily', 'habit', '2026-06-02', '07:00')
  })

  it('sends [DENY] reason: text when deny has a reason', async () => {
    const user = userEvent.setup()
    const append = vi.fn()
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('proposeAction', {
          action: 'Run daily',
          entityType: 'habit',
        })}
        append={append}
      />,
    )
    await user.click(screen.getByText('deny-with-reason'))
    expect(append).toHaveBeenCalledWith({ role: 'user', content: '[DENY] reason: wrong time' })
  })

  it('sends a bare [DENY] when deny has no reason and append is provided', async () => {
    const user = userEvent.setup()
    const append = vi.fn()
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('proposeAction', {
          action: 'Run daily',
          entityType: 'habit',
        })}
        append={append}
      />,
    )
    await user.click(screen.getByText('deny'))
    expect(append).toHaveBeenCalledWith({ role: 'user', content: '[DENY]' })
  })

  it('renders showTaskCard as an ActivityCard with a next-slot detail', () => {
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('showTaskCard', {
          taskId: 't1',
          title: 'Buy milk',
          type: 'task',
          status: 'pending',
          nextSlot: 'Mon 9am',
        })}
      />,
    )
    const card = screen.getByTestId('activity-card')
    expect(card).toHaveAttribute('data-type', 'task')
    expect(card).toHaveAttribute('data-status', 'pending')
    expect(screen.getByText('Buy milk')).toBeInTheDocument()
    expect(screen.getByText('Next: Mon 9am')).toBeInTheDocument()
  })

  it('renders showTaskCard with no next slot (no detail line)', () => {
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('showTaskCard', {
          taskId: 't1',
          title: 'Buy milk',
          type: 'task',
          status: 'completed',
        })}
      />,
    )
    expect(screen.getByTestId('activity-card')).toBeInTheDocument()
    expect(screen.queryByText(/^Next:/)).not.toBeInTheDocument()
  })

  it('renders showHabitCard as a habit ActivityCard carrying the streak', () => {
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('showHabitCard', {
          taskId: 'h1',
          title: 'Meditate',
          status: 'pending',
          streak: 5,
        })}
      />,
    )
    const card = screen.getByTestId('activity-card')
    expect(card).toHaveAttribute('data-type', 'habit')
    expect(card).toHaveAttribute('data-streak', '5')
    expect(screen.getByText('Meditate')).toBeInTheDocument()
  })

  it('renders showGoalCard as a goal ActivityCard with a target-date detail', () => {
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('showGoalCard', {
          taskId: 'g1',
          title: 'Run a marathon',
          status: 'in_progress',
          targetDate: '2026-08-01',
        })}
      />,
    )
    const card = screen.getByTestId('activity-card')
    expect(card).toHaveAttribute('data-type', 'goal')
    expect(screen.getByText('Target: 2026-08-01')).toBeInTheDocument()
  })

  it('renders showGoalCard with no target date (no detail line)', () => {
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('showGoalCard', {
          taskId: 'g1',
          title: 'Run a marathon',
          status: 'pending',
        })}
      />,
    )
    expect(screen.getByTestId('activity-card')).toBeInTheDocument()
    expect(screen.queryByText(/^Target:/)).not.toBeInTheDocument()
  })
})
