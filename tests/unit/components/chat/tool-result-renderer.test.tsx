import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
vi.mock('@/components/cards/week-calendar-view', () => ({
  WeekCalendarView: () => <div data-testid="week-calendar-view" />,
}))
vi.mock('@/components/cards/life-balance-view', () => ({
  LifeBalanceView: () => <div data-testid="life-balance-view" />,
}))

function makeInvocation(toolName: string, result: unknown): ToolInvocation {
  return { state: 'result', toolCallId: 'call-1', toolName, args: {}, result } as ToolInvocation
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
})
