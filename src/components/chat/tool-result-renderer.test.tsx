import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ToolResultRenderer } from './tool-result-renderer'

vi.mock('@/lib/ui', () => ({
  WeekCalendarView: () => <div data-testid="week-cal" />,
}))
vi.mock('@/components/cards/task-card', () => ({ TaskCard: () => <div>task</div> }))
vi.mock('@/components/cards/habit-card', () => ({ HabitCard: () => <div>habit</div> }))
vi.mock('@/components/cards/goal-card', () => ({ GoalCard: () => <div>goal</div> }))
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
})
