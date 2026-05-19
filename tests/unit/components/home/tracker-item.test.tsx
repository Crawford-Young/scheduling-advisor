import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrackerItem } from '@/components/home/tracker-item'

vi.mock('@crawfordyoung/ui', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...p
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }) =>
    React.createElement('button', { onClick, disabled, ...p }, children),
}))

vi.mock('@/server/actions/tasks', () => ({
  updateTask: vi.fn().mockResolvedValue({ data: { id: 'task-1' } }),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}))

describe('TrackerItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title', () => {
    render(<TrackerItem id="task-1" title="Do the thing" />)
    expect(screen.getByText('Do the thing')).toBeInTheDocument()
  })

  it('renders formatted time when startAt provided', () => {
    const date = new Date('2026-05-19T09:00:00')
    render(<TrackerItem id="task-1" title="Do the thing" startAt={date} />)
    expect(screen.getByText(/9:00 AM/i)).toBeInTheDocument()
  })

  it('does not render time when startAt omitted', () => {
    render(<TrackerItem id="task-1" title="Do the thing" />)
    expect(screen.queryByText(/AM|PM/)).not.toBeInTheDocument()
  })

  it('calls updateTask with completed status on button click', async () => {
    const { updateTask } = await import('@/server/actions/tasks')
    render(<TrackerItem id="task-1" title="Do the thing" />)
    await userEvent.click(screen.getByRole('button', { name: /complete do the thing/i }))
    expect(updateTask).toHaveBeenCalledWith({ id: 'task-1', status: 'completed' })
  })

  it('applies line-through after completion', async () => {
    render(<TrackerItem id="task-1" title="Do the thing" />)
    await userEvent.click(screen.getByRole('button', { name: /complete do the thing/i }))
    expect(screen.getByText('Do the thing')).toHaveClass('line-through')
  })

  it('disables button after completion', async () => {
    render(<TrackerItem id="task-1" title="Do the thing" />)
    const btn = screen.getByRole('button', { name: /complete do the thing/i })
    await userEvent.click(btn)
    expect(btn).toBeDisabled()
  })
})
