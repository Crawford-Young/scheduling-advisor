import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ActivityCreate } from './activity-create'

const refreshMock = vi.fn()
const createTaskMock = vi.fn().mockResolvedValue({ ok: true })

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('@/server/actions/tasks', () => ({
  createTask: (input: unknown) => createTaskMock(input),
}))

vi.mock('@/lib/ui', () => ({
  buildIso: (_d: Date, time: string) => `2026-06-18T${time}:00.000Z`,
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
  ActivityFormDialog: ({
    open,
    onSubmit,
  }: {
    open: boolean
    onSubmit: (values: unknown) => void
  }) =>
    open ? (
      <>
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
      </>
    ) : null,
}))

describe('ActivityCreate', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    createTaskMock.mockClear()
  })

  it('quick-adds a task defaulting to today and clears the input', async () => {
    const user = userEvent.setup()
    render(<ActivityCreate />)
    await user.type(screen.getByLabelText(/quick add/i), 'Buy milk')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() =>
      expect(createTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task',
          title: 'Buy milk',
          startAt: '2026-06-18T09:00:00.000Z',
          endAt: '2026-06-18T10:00:00.000Z',
        }),
      ),
    )
    expect(refreshMock).toHaveBeenCalled()
  })

  it('does not quick-add when the title is blank (form submitted directly)', () => {
    render(<ActivityCreate />)
    const input = screen.getByLabelText(/quick add/i)
    fireEvent.submit(input.closest('form')!)
    expect(createTaskMock).not.toHaveBeenCalled()
  })

  it('routes a goal from the full dialog to createTask with an ISO targetDate', async () => {
    const user = userEvent.setup()
    render(<ActivityCreate />)
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
  })

  it('routes a task from the full dialog to createTask with a null targetDate', async () => {
    const user = userEvent.setup()
    render(<ActivityCreate />)
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
  })
})
