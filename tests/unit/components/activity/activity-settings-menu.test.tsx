import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { ActivitySettingsMenu } from '@/components/activity/activity-settings-menu'

vi.mock('@/server/actions/activity-settings', () => ({
  updateActivitySettings: vi.fn().mockResolvedValue({ data: { id: 'task-1' } }),
}))

vi.mock('next/navigation', () => ({ useRouter: vi.fn(() => ({ refresh: vi.fn() })) }))

vi.mock('@/lib/ui', () => ({
  Button: ({ children, onClick, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement('button', { onClick, ...p }, children),
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) =>
    React.createElement('label', { htmlFor }, children),
  Select: ({
    children,
    value,
  }: {
    children: React.ReactNode
    value: string
    onValueChange: (v: string) => void
  }) => React.createElement('div', { 'data-value': value, 'data-testid': 'select' }, children),
  SelectTrigger: ({ children, id }: { children: React.ReactNode; id?: string }) =>
    React.createElement('button', { id }, children),
  SelectContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) =>
    React.createElement('div', { 'data-value': value }, children),
  SelectValue: () => null,
}))

const baseProps = {
  taskId: '550e8400-e29b-41d4-a716-446655440000',
  activityType: 'solo' as const,
  visibility: 'only_me' as const,
  joinability: undefined,
  maxParticipants: undefined,
}

describe('ActivitySettingsMenu', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders Activity Type label', () => {
    render(<ActivitySettingsMenu {...baseProps} />)
    expect(screen.getByText(/activity type/i)).toBeInTheDocument()
  })

  it('renders Visibility label', () => {
    render(<ActivitySettingsMenu {...baseProps} />)
    expect(screen.getByText(/visibility/i)).toBeInTheDocument()
  })

  it('renders Save button', () => {
    render(<ActivitySettingsMenu {...baseProps} />)
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('calls updateActivitySettings on Save click', async () => {
    const { updateActivitySettings } = await import('@/server/actions/activity-settings')
    render(<ActivitySettingsMenu {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(updateActivitySettings).toHaveBeenCalled()
  })

  it('does not show joinability label for solo type', () => {
    render(<ActivitySettingsMenu {...baseProps} activityType="solo" />)
    expect(screen.queryByText(/joinability/i)).not.toBeInTheDocument()
  })

  it('passes axe', async () => {
    const { container } = render(<ActivitySettingsMenu {...baseProps} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
