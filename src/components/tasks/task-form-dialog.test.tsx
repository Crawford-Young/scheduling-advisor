import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TaskFormDialog } from './task-form-dialog'

const refreshMock = vi.fn()
const createTaskMock = vi.fn().mockResolvedValue({ ok: true })
const updateTaskMock = vi.fn().mockResolvedValue({ ok: true })

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('@/server/actions/tasks', () => ({
  createTask: (input: unknown) => createTaskMock(input),
  updateTask: (input: unknown) => updateTaskMock(input),
}))

describe('TaskFormDialog (characterization — UTC save path)', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    createTaskMock.mockClear()
    updateTaskMock.mockClear()
  })

  it('creates a task with UTC startAt/endAt built from the chosen date + time', async () => {
    const user = userEvent.setup()
    render(
      <TaskFormDialog
        open
        onOpenChange={() => {}}
        initialStartAt="2026-06-20T09:00:00.000Z"
        initialEndAt="2026-06-20T10:00:00.000Z"
      />,
    )

    await user.type(screen.getByLabelText('Title'), 'Write spec')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(createTaskMock).toHaveBeenCalledTimes(1))
    expect(createTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'task',
        title: 'Write spec',
        startAt: '2026-06-20T09:00:00.000Z',
        endAt: '2026-06-20T10:00:00.000Z',
        recurrence: null,
      }),
    )
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('locks dates and creates one task per calendar-supplied date (multi-date path)', async () => {
    const user = userEvent.setup()
    render(
      <TaskFormDialog
        open
        onOpenChange={() => {}}
        defaultDates={[new Date('2026-06-20T00:00:00.000Z'), new Date('2026-06-21T00:00:00.000Z')]}
        defaultStartTime="09:00"
        defaultEndTime="10:00"
      />,
    )

    await user.type(screen.getByLabelText('Title'), 'Standup')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(createTaskMock).toHaveBeenCalledTimes(2))
    expect(createTaskMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        startAt: '2026-06-20T09:00:00.000Z',
        endAt: '2026-06-20T10:00:00.000Z',
      }),
    )
    expect(createTaskMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        startAt: '2026-06-21T09:00:00.000Z',
        endAt: '2026-06-21T10:00:00.000Z',
      }),
    )
  })

  it('updates an existing task via updateTask when taskId is supplied', async () => {
    const user = userEvent.setup()
    render(
      <TaskFormDialog
        open
        onOpenChange={() => {}}
        taskId="task-7"
        initialTitle="Edit me"
        initialStartAt="2026-06-20T09:00:00.000Z"
        initialEndAt="2026-06-20T10:00:00.000Z"
      />,
    )

    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(updateTaskMock).toHaveBeenCalledTimes(1))
    expect(updateTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-7', title: 'Edit me', recurrence: null }),
    )
    expect(createTaskMock).not.toHaveBeenCalled()
  })

  it('passes recurrence and recurrenceCount when the task repeats', async () => {
    const user = userEvent.setup()
    render(
      <TaskFormDialog
        open
        onOpenChange={() => {}}
        initialStartAt="2026-06-20T09:00:00.000Z"
        initialEndAt="2026-06-20T10:00:00.000Z"
        initialRecurrence="weekly"
      />,
    )

    await user.type(screen.getByLabelText('Title'), 'Weekly sync')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(createTaskMock).toHaveBeenCalledTimes(1))
    expect(createTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({ recurrence: 'weekly', recurrenceCount: 2 }),
    )
  })

  it('does not submit when no date is resolved', () => {
    render(<TaskFormDialog open onOpenChange={() => {}} />)
    fireEvent.submit(document.getElementById('task-form')!)
    expect(createTaskMock).not.toHaveBeenCalled()
    expect(updateTaskMock).not.toHaveBeenCalled()
  })

  it('closes without saving when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<TaskFormDialog open onOpenChange={onOpenChange} />)
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(createTaskMock).not.toHaveBeenCalled()
  })
})
