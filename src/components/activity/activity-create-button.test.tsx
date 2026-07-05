import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ActivityCreateButton } from './activity-create-button'

const refreshMock = vi.fn()
const toastErrorMock = vi.fn()
const createTaskMock = vi.fn().mockResolvedValue({ data: { id: 'new-id' } })

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('@/server/actions/tasks', () => ({
  createTask: (input: unknown) => createTaskMock(input),
}))

// @/lib/ui — Button + toast + the library ActivityFormDialog (mocked to surface data props).
vi.mock('@/lib/ui', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
  toast: { error: (msg: string) => toastErrorMock(msg) },
  ActivityFormDialog: ({
    open,
    isPending,
    use24h,
    onSubmit,
  }: {
    open: boolean
    isPending?: boolean
    use24h?: boolean
    onSubmit: (values: unknown) => void
  }) =>
    open ? (
      <div data-testid="activity-form-dialog">
        <span data-testid="dialog-pending">{String(isPending)}</span>
        <span data-testid="dialog-use24h">{String(use24h)}</span>
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
    toastErrorMock.mockClear()
    createTaskMock.mockClear().mockResolvedValue({ data: { id: 'new-id' } })
  })

  it('opens the app ActivityFormDialog when New is clicked', async () => {
    const user = userEvent.setup()
    render(<ActivityCreateButton />)
    expect(screen.queryByTestId('activity-form-dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /new/i }))
    expect(screen.getByTestId('activity-form-dialog')).toBeInTheDocument()
  })

  it('threads the use24h preference into the library dialog', async () => {
    const user = userEvent.setup()
    render(<ActivityCreateButton use24h />)
    await user.click(screen.getByRole('button', { name: /new/i }))
    expect(screen.getByTestId('dialog-use24h')).toHaveTextContent('true')
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

  it('keeps the dialog open and surfaces a toast when createTask returns an error', async () => {
    createTaskMock.mockResolvedValueOnce({ error: 'Unauthorized' })
    const user = userEvent.setup()
    render(<ActivityCreateButton />)
    await user.click(screen.getByRole('button', { name: /new/i }))
    await user.click(screen.getByRole('button', { name: 'submit-new-task' }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not create activity'))
    expect(refreshMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('activity-form-dialog')).toBeInTheDocument()
  })
})
