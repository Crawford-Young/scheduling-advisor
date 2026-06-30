import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ActivityCreateButton } from './activity-create-button'

const refreshMock = vi.fn()
const createTaskMock = vi.fn().mockResolvedValue({ data: { id: 'new-id' } })

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('@/server/actions/tasks', () => ({
  createTask: (input: unknown) => createTaskMock(input),
}))

vi.mock('@/lib/ui', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock('./activity-form-dialog', () => ({
  ActivityFormDialog: ({
    open,
    isPending,
    onSubmit,
  }: {
    open: boolean
    isPending?: boolean
    onSubmit: (values: unknown) => void
  }) =>
    open ? (
      <div data-testid="activity-form-dialog">
        <span data-testid="dialog-pending">{String(isPending)}</span>
        <button
          type="button"
          onClick={() =>
            onSubmit({
              type: 'goal',
              title: 'New goal',
              targetDate: '2026-09-01',
              social: { activityType: 'solo', visibility: 'only_me' },
            })
          }
        >
          submit-new-goal
        </button>
        <button
          type="button"
          onClick={() =>
            onSubmit({
              type: 'goal',
              title: 'Dateless goal',
              targetDate: null,
              social: { activityType: 'solo', visibility: 'only_me' },
            })
          }
        >
          submit-goal-no-date
        </button>
        <button
          type="button"
          onClick={() =>
            onSubmit({
              type: 'task',
              title: 'New task',
              startAt: '2026-09-01T09:00:00.000Z',
              endAt: null,
              recurrence: null,
              social: { activityType: 'solo', visibility: 'only_me' },
            })
          }
        >
          submit-new-task
        </button>
      </div>
    ) : null,
}))

describe('ActivityCreateButton', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    createTaskMock.mockClear()
  })

  it('opens the app ActivityFormDialog when New is clicked', async () => {
    const user = userEvent.setup()
    render(<ActivityCreateButton />)
    expect(screen.queryByTestId('activity-form-dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /new/i }))
    expect(screen.getByTestId('activity-form-dialog')).toBeInTheDocument()
  })

  it('routes a goal submission to createTask with a noon-UTC ISO targetDate', async () => {
    const user = userEvent.setup()
    render(<ActivityCreateButton />)
    await user.click(screen.getByRole('button', { name: /new/i }))
    await user.click(screen.getByRole('button', { name: 'submit-new-goal' }))

    await waitFor(() =>
      expect(createTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'goal',
          title: 'New goal',
          targetDate: '2026-09-01T12:00:00.000Z',
        }),
      ),
    )
    expect(refreshMock).toHaveBeenCalled()
  })

  it('routes a goal with no target date to createTask with a null targetDate', async () => {
    const user = userEvent.setup()
    render(<ActivityCreateButton />)
    await user.click(screen.getByRole('button', { name: /new/i }))
    await user.click(screen.getByRole('button', { name: 'submit-goal-no-date' }))

    await waitFor(() =>
      expect(createTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'goal',
          title: 'Dateless goal',
          targetDate: null,
        }),
      ),
    )
  })

  it('routes a task submission to createTask with a null targetDate', async () => {
    const user = userEvent.setup()
    render(<ActivityCreateButton />)
    await user.click(screen.getByRole('button', { name: /new/i }))
    await user.click(screen.getByRole('button', { name: 'submit-new-task' }))

    await waitFor(() =>
      expect(createTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task',
          title: 'New task',
          startAt: '2026-09-01T09:00:00.000Z',
          targetDate: null,
        }),
      ),
    )
    expect(refreshMock).toHaveBeenCalled()
  })
})
