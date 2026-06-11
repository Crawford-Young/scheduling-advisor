import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ToolInvocation } from 'ai'
import { ToolResultRenderer } from '@/components/chat/tool-result-renderer'

vi.mock('@/components/cards/task-card', () => ({
  TaskCard: ({ title }: { title: string }) => <div data-testid="task-card">{title}</div>,
}))
vi.mock('@/components/cards/habit-card', () => ({
  HabitCard: () => <div data-testid="habit-card" />,
}))
vi.mock('@/components/cards/goal-card', () => ({
  GoalCard: () => <div data-testid="goal-card" />,
}))
vi.mock('@/components/cards/schedule-suggestion', () => ({
  ScheduleSuggestion: () => <div data-testid="schedule-suggestion" />,
}))
vi.mock('@/components/cards/reflection-card', () => ({
  ReflectionCard: () => <div data-testid="reflection-card" />,
}))
vi.mock('@/lib/ui', () => ({
  WeekCalendarView: () => <div data-testid="week-calendar-view" />,
}))
vi.mock('@/components/cards/life-balance-view', () => ({
  LifeBalanceView: () => <div data-testid="life-balance-view" />,
}))
vi.mock('@/components/chat/action-confirm-card', () => ({
  ActionConfirmCard: ({
    action,
    onConfirm,
    onDeny,
  }: {
    action: string
    onConfirm: () => void
    onDeny: (reason: string) => void
  }) => (
    <div data-testid="action-confirm-card">
      <span>{action}</span>
      <button onClick={onConfirm}>Confirm</button>
      <button onClick={() => onDeny('too busy')}>Deny with reason</button>
      <button onClick={() => onDeny('')}>Deny empty</button>
    </div>
  ),
}))

function makeInvocation(toolName: string, result: unknown): ToolInvocation & { state: 'result' } {
  return {
    state: 'result',
    toolCallId: 'call-1',
    toolName,
    args: {},
    result,
  } as ToolInvocation & { state: 'result' }
}

describe('ToolResultRenderer', () => {
  it('renders TaskCard for showTaskCard', () => {
    render(
      <ToolResultRenderer toolInvocation={makeInvocation('showTaskCard', { title: 'Buy milk' })} />,
    )
    expect(screen.getByTestId('task-card')).toBeInTheDocument()
    expect(screen.getByText('Buy milk')).toBeInTheDocument()
  })

  it('renders HabitCard for showHabitCard', () => {
    render(<ToolResultRenderer toolInvocation={makeInvocation('showHabitCard', {})} />)
    expect(screen.getByTestId('habit-card')).toBeInTheDocument()
  })

  it('renders GoalCard for showGoalCard', () => {
    render(<ToolResultRenderer toolInvocation={makeInvocation('showGoalCard', {})} />)
    expect(screen.getByTestId('goal-card')).toBeInTheDocument()
  })

  it('renders ScheduleSuggestion for showScheduleSuggestion', () => {
    render(<ToolResultRenderer toolInvocation={makeInvocation('showScheduleSuggestion', {})} />)
    expect(screen.getByTestId('schedule-suggestion')).toBeInTheDocument()
  })

  it('renders ReflectionCard for showReflectionCard', () => {
    render(<ToolResultRenderer toolInvocation={makeInvocation('showReflectionCard', {})} />)
    expect(screen.getByTestId('reflection-card')).toBeInTheDocument()
  })

  it('renders WeekCalendarView for showWeekCalendar', () => {
    render(<ToolResultRenderer toolInvocation={makeInvocation('showWeekCalendar', {})} />)
    expect(screen.getByTestId('week-calendar-view')).toBeInTheDocument()
  })

  it('renders LifeBalanceView for showLifeBalance', () => {
    render(<ToolResultRenderer toolInvocation={makeInvocation('showLifeBalance', {})} />)
    expect(screen.getByTestId('life-balance-view')).toBeInTheDocument()
  })

  it('renders nothing for unknown tool name', () => {
    const { container } = render(
      <ToolResultRenderer toolInvocation={makeInvocation('unknownTool', {})} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('calls onScheduleUpdate with empty array when result.events is undefined', () => {
    const onScheduleUpdate = vi.fn()
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('showWeekCalendar', { weekStart: '2026-05-25' })}
        onScheduleUpdate={onScheduleUpdate}
      />,
    )
    expect(onScheduleUpdate).toHaveBeenCalledWith('2026-05-25', [])
  })

  it('calls onScheduleUpdate with provided events array', () => {
    const onScheduleUpdate = vi.fn()
    const events = [
      {
        id: 'e1',
        title: 'Run',
        start: '2026-05-25T09:00:00',
        end: '2026-05-25T10:00:00',
        type: 'task' as const,
      },
    ]
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('showWeekCalendar', { weekStart: '2026-05-25', events })}
        onScheduleUpdate={onScheduleUpdate}
      />,
    )
    expect(onScheduleUpdate).toHaveBeenCalledWith('2026-05-25', events)
  })

  it('renders ActionConfirmCard for proposeAction', () => {
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('proposeAction', {
          action: 'Schedule a run',
          entityType: 'event',
        })}
      />,
    )
    expect(screen.getByTestId('action-confirm-card')).toBeInTheDocument()
    expect(screen.getByText('Schedule a run')).toBeInTheDocument()
  })

  it('proposeAction onConfirm calls append and onItemConfirmed', async () => {
    const append = vi.fn()
    const onItemConfirmed = vi.fn()
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('proposeAction', {
          action: 'Schedule a run',
          entityType: 'event',
          date: '2026-05-25',
          time: '09:00',
        })}
        append={append}
        onItemConfirmed={onItemConfirmed}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(append).toHaveBeenCalledWith({
      role: 'user',
      content: '[CONFIRM] Schedule a run',
    })
    expect(onItemConfirmed).toHaveBeenCalledWith('Schedule a run', 'event', '2026-05-25', '09:00')
  })

  it('proposeAction onDeny with reason sends deny message with reason', async () => {
    const append = vi.fn()
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('proposeAction', {
          action: 'Schedule a run',
          entityType: 'event',
        })}
        append={append}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Deny with reason' }))
    expect(append).toHaveBeenCalledWith({
      role: 'user',
      content: '[DENY] reason: too busy',
    })
  })

  it('proposeAction onDeny with empty reason sends bare [DENY]', async () => {
    const append = vi.fn()
    render(
      <ToolResultRenderer
        toolInvocation={makeInvocation('proposeAction', {
          action: 'Schedule a run',
          entityType: 'event',
        })}
        append={append}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Deny empty' }))
    expect(append).toHaveBeenCalledWith({
      role: 'user',
      content: '[DENY]',
    })
  })
})
