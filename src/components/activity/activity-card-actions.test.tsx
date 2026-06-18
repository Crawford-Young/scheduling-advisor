import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ActivityCardActions } from './activity-card-actions'

const refreshMock = vi.fn()
const updateTaskMock = vi.fn().mockResolvedValue({ ok: true })
const deleteTaskMock = vi.fn().mockResolvedValue({ ok: true })
const recordCompletionMock = vi.fn().mockResolvedValue({ ok: true })

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('@/server/actions/tasks', () => ({
  updateTask: (input: unknown) => updateTaskMock(input),
  deleteTask: (input: unknown) => deleteTaskMock(input),
}))

vi.mock('@/server/actions/consistency', () => ({
  recordCompletion: (input: unknown) => recordCompletionMock(input),
}))

// Lightweight stand-ins so we can drive the wrapper's wiring without Radix portals.
vi.mock('@/lib/ui', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
  ActivityFormDialog: ({
    open,
    onSubmit,
    initialType,
  }: {
    open: boolean
    onSubmit: (values: unknown) => void
    initialType?: string
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onSubmit(
            initialType === 'task'
              ? {
                  type: 'task',
                  title: 'Edited task',
                  startAt: '2026-07-01T09:00:00.000Z',
                  endAt: null,
                  recurrence: null,
                  social: { activityType: 'solo', visibility: 'only_me' },
                }
              : {
                  type: 'goal',
                  title: 'Edited goal',
                  targetDate: '2026-07-01',
                  social: { activityType: 'solo', visibility: 'only_me' },
                },
          )
        }
      >
        submit-edit
      </button>
    ) : null,
  AlertDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="alertdialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogAction: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}))

const goalProps = {
  taskId: 'goal-1',
  type: 'goal' as const,
  title: 'Run a marathon',
  status: 'in_progress' as const,
  targetDate: '2026-08-01',
  social: { activityType: 'solo' as const, visibility: 'only_me' as const },
}

describe('ActivityCardActions', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    updateTaskMock.mockClear()
    deleteTaskMock.mockClear()
    recordCompletionMock.mockClear()
  })

  it('marks a goal/task complete via updateTask', async () => {
    const user = userEvent.setup()
    render(<ActivityCardActions {...goalProps} />)
    await user.click(screen.getByRole('button', { name: /mark complete/i }))
    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith({ id: 'goal-1', status: 'completed' }),
    )
  })

  it('logs a habit via recordCompletion (not updateTask)', async () => {
    const user = userEvent.setup()
    render(
      <ActivityCardActions
        taskId="habit-1"
        type="habit"
        title="Meditate"
        status="pending"
        social={{ activityType: 'solo', visibility: 'only_me' }}
      />,
    )
    await user.click(screen.getByRole('button', { name: /log today/i }))
    await waitFor(() =>
      expect(recordCompletionMock).toHaveBeenCalledWith({ taskId: 'habit-1', outcome: 'done' }),
    )
    expect(updateTaskMock).not.toHaveBeenCalled()
  })

  it('hides the complete action when already completed', () => {
    render(<ActivityCardActions {...goalProps} status="completed" />)
    expect(screen.queryByRole('button', { name: /mark complete/i })).not.toBeInTheDocument()
  })

  it('converts the date-only targetDate to a full ISO datetime on edit save', async () => {
    const user = userEvent.setup()
    render(<ActivityCardActions {...goalProps} />)
    await user.click(screen.getByRole('button', { name: /edit goal/i }))
    await user.click(screen.getByRole('button', { name: 'submit-edit' }))
    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'goal-1',
          title: 'Edited goal',
          targetDate: '2026-07-01T12:00:00.000Z',
        }),
      ),
    )
  })

  it('sends a null targetDate when editing a task (no target date)', async () => {
    const user = userEvent.setup()
    render(
      <ActivityCardActions
        taskId="task-9"
        type="task"
        title="Ship it"
        status="pending"
        startAt="2026-07-01T09:00:00.000Z"
        social={{ activityType: 'solo', visibility: 'only_me' }}
      />,
    )
    await user.click(screen.getByRole('button', { name: /edit task/i }))
    await user.click(screen.getByRole('button', { name: 'submit-edit' }))
    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'task-9', targetDate: null }),
      ),
    )
  })

  it('deletes via deleteTask and refreshes', async () => {
    const user = userEvent.setup()
    render(<ActivityCardActions {...goalProps} />)
    await user.click(screen.getByRole('button', { name: /delete goal/i }))
    await user.click(screen.getByRole('button', { name: /confirm delete/i }))
    await waitFor(() => expect(deleteTaskMock).toHaveBeenCalledWith({ id: 'goal-1' }))
    expect(refreshMock).toHaveBeenCalled()
  })
})
