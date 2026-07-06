import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useActivityActions, type ActivityCardActionsProps } from './use-activity-actions'

const refreshMock = vi.fn()
const updateTaskMock = vi.fn().mockResolvedValue({ data: {} })
const updateTaskSeriesMock = vi.fn().mockResolvedValue({ data: {} })
const deleteTaskMock = vi.fn().mockResolvedValue({ data: { success: true } })
const recordCompletionMock = vi.fn().mockResolvedValue({ data: {} })
const toastErrorMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('@/server/actions/tasks', () => ({
  updateTask: (input: unknown) => updateTaskMock(input),
  updateTaskSeries: (input: unknown) => updateTaskSeriesMock(input),
  deleteTask: (input: unknown) => deleteTaskMock(input),
}))

vi.mock('@/server/actions/consistency', () => ({
  recordCompletion: (input: unknown) => recordCompletionMock(input),
}))

// @/lib/ui — AlertDialog family + toast + the library ActivityFormDialog (mocked to surface data props).
vi.mock('@/lib/ui', () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
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
  // Library ActivityFormDialog — renders key props as visible text so contract bugs surface.
  ActivityFormDialog: ({
    open,
    onSubmit,
    initialType,
    lockType,
    use24h,
    initialValues,
  }: {
    open: boolean
    onSubmit: (values: unknown) => void
    initialType?: string
    lockType?: boolean
    use24h?: boolean
    initialValues?: {
      type?: string
      title?: string
      targetDate?: string
      startAt?: string
      endAt?: string
      recurrence?: string
      recurrenceCount?: number
      color?: string | null
      location?: string | null
      description?: string | null
      allDay?: boolean
    }
  }) =>
    open ? (
      <div data-testid="activity-form-dialog">
        <span data-testid="dialog-initial-type">{initialType}</span>
        <span data-testid="dialog-lock-type">{String(lockType)}</span>
        <span data-testid="dialog-use24h">{String(use24h)}</span>
        <span data-testid="dialog-target-date">{initialValues?.targetDate ?? ''}</span>
        <span data-testid="dialog-start-at">{initialValues?.startAt ?? ''}</span>
        <span data-testid="dialog-end-at">{initialValues?.endAt ?? ''}</span>
        <span data-testid="dialog-recurrence">{initialValues?.recurrence ?? ''}</span>
        <span data-testid="dialog-recurrence-count">
          {initialValues?.recurrenceCount !== undefined
            ? String(initialValues.recurrenceCount)
            : ''}
        </span>
        <span data-testid="dialog-color">{initialValues?.color ?? ''}</span>
        <span data-testid="dialog-location">{initialValues?.location ?? ''}</span>
        <span data-testid="dialog-description">{initialValues?.description ?? ''}</span>
        <span data-testid="dialog-all-day">{String(initialValues?.allDay ?? '')}</span>
        {/* Series-shaped submit: keeps the frequency, changes recurrenceCount 4 → 8. */}
        <button
          type="button"
          onClick={() =>
            onSubmit({
              type: 'task',
              title: 'Series edited task',
              startAt: '2026-07-01T09:00:00.000Z',
              endAt: '2026-07-01T10:00:00.000Z',
              recurrence: 'weekly',
              recurrenceCount: 8,
              color: null,
              location: null,
              description: null,
              allDay: false,
              social: { activityType: 'solo', visibility: 'only_me' },
            })
          }
        >
          submit-series-edit
        </button>
        <button
          type="button"
          onClick={() =>
            onSubmit(
              initialType === 'task'
                ? // Emit null startAt/endAt when initial allDay is true (covers ?? null branches)
                  initialValues?.allDay === true
                  ? {
                      type: 'task',
                      title: 'Edited all-day task',
                      startAt: null,
                      endAt: null,
                      recurrence: null,
                      color: null,
                      location: null,
                      description: null,
                      allDay: true,
                      social: { activityType: 'solo', visibility: 'only_me' },
                    }
                  : {
                      type: 'task',
                      title: 'Edited task',
                      startAt: '2026-07-01T09:00:00.000Z',
                      endAt: '2026-07-01T10:00:00.000Z',
                      recurrence: null,
                      color: null,
                      location: null,
                      description: null,
                      allDay: false,
                      social: { activityType: 'solo', visibility: 'only_me' },
                    }
                : {
                    type: 'goal',
                    title: 'Edited goal',
                    // Emit undefined when no initial targetDate to cover toIsoTargetDate(null) branch
                    targetDate: initialValues?.targetDate !== undefined ? '2026-07-01' : undefined,
                    location: null,
                    description: null,
                    social: { activityType: 'solo', visibility: 'only_me' },
                  },
            )
          }
        >
          submit-edit
        </button>
      </div>
    ) : null,
}))

/** Minimal host that exposes the hook's return values as clickable buttons for tests. */
function ActivityActionsHarness(props: ActivityCardActionsProps): React.JSX.Element {
  const { isComplete, completeLabel, isPending, handleComplete, openEdit, openDelete, dialogs } =
    useActivityActions(props)

  return (
    <>
      <div className="flex items-center gap-1">
        {!isComplete && (
          <button onClick={handleComplete} disabled={isPending}>
            {completeLabel}
          </button>
        )}
        <button aria-label={`Edit ${props.type}`} onClick={openEdit}>
          edit
        </button>
        <button aria-label={`Delete ${props.type}`} onClick={openDelete}>
          delete
        </button>
      </div>
      {dialogs}
    </>
  )
}

const goalProps = {
  taskId: 'goal-1',
  type: 'goal' as const,
  title: 'Run a marathon',
  status: 'in_progress' as const,
  targetDate: '2026-08-01',
  social: { activityType: 'solo' as const, visibility: 'only_me' as const },
}

describe('useActivityActions', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    updateTaskMock.mockClear()
    updateTaskSeriesMock.mockClear()
    deleteTaskMock.mockClear()
    recordCompletionMock.mockClear()
    toastErrorMock.mockClear()
  })

  it('marks a non-recurring goal/task complete via updateTask', async () => {
    const user = userEvent.setup()
    render(<ActivityActionsHarness {...goalProps} />)
    await user.click(screen.getByRole('button', { name: /mark complete/i }))
    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith({ id: 'goal-1', status: 'completed' }),
    )
    expect(recordCompletionMock).not.toHaveBeenCalled()
  })

  it('logs a recurring task via recordCompletion (not updateTask)', async () => {
    const user = userEvent.setup()
    render(
      <ActivityActionsHarness
        taskId="task-rec-1"
        type="task"
        title="Meditate"
        status="pending"
        recurrence="daily"
        social={{ activityType: 'solo', visibility: 'only_me' }}
      />,
    )
    await user.click(screen.getByRole('button', { name: /log today/i }))
    await waitFor(() => expect(recordCompletionMock).toHaveBeenCalledWith({ taskId: 'task-rec-1' }))
    expect(updateTaskMock).not.toHaveBeenCalled()
  })

  it('hides the complete action when already completed', () => {
    render(<ActivityActionsHarness {...goalProps} status="completed" />)
    expect(screen.queryByRole('button', { name: /mark complete/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /log today/i })).not.toBeInTheDocument()
  })

  it('edit opens ActivityFormDialog with lockType and initialType', async () => {
    const user = userEvent.setup()
    render(<ActivityActionsHarness {...goalProps} />)
    await user.click(screen.getByRole('button', { name: /edit goal/i }))
    expect(screen.getByTestId('activity-form-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('dialog-initial-type')).toHaveTextContent('goal')
    expect(screen.getByTestId('dialog-lock-type')).toHaveTextContent('true')
  })

  it('threads the use24h preference into the edit dialog', async () => {
    const user = userEvent.setup()
    render(<ActivityActionsHarness {...goalProps} use24h />)
    await user.click(screen.getByRole('button', { name: /edit goal/i }))
    expect(screen.getByTestId('dialog-use24h')).toHaveTextContent('true')
  })

  it('goal edit initialValues passes date-only targetDate (not a full ISO)', async () => {
    const user = userEvent.setup()
    render(<ActivityActionsHarness {...goalProps} />)
    await user.click(screen.getByRole('button', { name: /edit goal/i }))
    // Must be YYYY-MM-DD — a full ISO datetime triggers the goal-date-wipe trap in the dialog
    const dateText = screen.getByTestId('dialog-target-date').textContent
    expect(dateText).toBe('2026-08-01')
    expect(dateText).not.toMatch(/T\d{2}:\d{2}:\d{2}/)
  })

  it('converts date-only targetDate to noon-UTC ISO on goal edit save', async () => {
    const user = userEvent.setup()
    render(<ActivityActionsHarness {...goalProps} />)
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

  it('task edit sends startAt/endAt without a targetDate field', async () => {
    const user = userEvent.setup()
    render(
      <ActivityActionsHarness
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
        expect.objectContaining({
          id: 'task-9',
          startAt: '2026-07-01T09:00:00.000Z',
          endAt: '2026-07-01T10:00:00.000Z',
        }),
      ),
    )
    // Tasks must NOT send targetDate — it belongs only to goals
    expect((updateTaskMock.mock.calls[0] as unknown[][])[0]).not.toHaveProperty('targetDate')
  })

  it('passes rich props (color, location, description, allDay) to dialog initialValues', async () => {
    const user = userEvent.setup()
    render(
      <ActivityActionsHarness
        taskId="task-rich"
        type="task"
        title="Rich task"
        status="pending"
        startAt="2026-07-01T09:00:00.000Z"
        endAt="2026-07-01T10:00:00.000Z"
        color="blue"
        location="Coffee shop"
        description="Some notes"
        allDay={false}
        social={{ activityType: 'solo', visibility: 'only_me' }}
      />,
    )
    await user.click(screen.getByRole('button', { name: /edit task/i }))
    expect(screen.getByTestId('dialog-color')).toHaveTextContent('blue')
    expect(screen.getByTestId('dialog-location')).toHaveTextContent('Coffee shop')
    expect(screen.getByTestId('dialog-description')).toHaveTextContent('Some notes')
    expect(screen.getByTestId('dialog-all-day')).toHaveTextContent('false')
    expect(screen.getByTestId('dialog-start-at')).toHaveTextContent('2026-07-01T09:00:00.000Z')
    expect(screen.getByTestId('dialog-end-at')).toHaveTextContent('2026-07-01T10:00:00.000Z')
  })

  it('all-day task edit sends null startAt/endAt (covers ?? null null-side branch)', async () => {
    const user = userEvent.setup()
    render(
      <ActivityActionsHarness
        taskId="task-allday"
        type="task"
        title="All day thing"
        status="pending"
        allDay={true}
        social={{ activityType: 'solo', visibility: 'only_me' }}
      />,
    )
    await user.click(screen.getByRole('button', { name: /edit task/i }))
    await user.click(screen.getByRole('button', { name: 'submit-edit' }))
    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'task-allday', startAt: null, endAt: null, allDay: true }),
      ),
    )
  })

  it('goal edit with no targetDate prop sends null targetDate (covers toIsoTargetDate null branch)', async () => {
    const user = userEvent.setup()
    render(
      <ActivityActionsHarness
        taskId="goal-nodate"
        type="goal"
        title="Someday goal"
        status="pending"
        social={{ activityType: 'solo', visibility: 'only_me' }}
      />,
    )
    await user.click(screen.getByRole('button', { name: /edit goal/i }))
    await user.click(screen.getByRole('button', { name: 'submit-edit' }))
    await waitFor(() =>
      expect(updateTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'goal-nodate', targetDate: null }),
      ),
    )
  })

  it('shows toast.error when non-recurring complete fails', async () => {
    updateTaskMock.mockResolvedValueOnce({ error: 'Unauthorized' })
    const user = userEvent.setup()
    render(<ActivityActionsHarness {...goalProps} />)
    await user.click(screen.getByRole('button', { name: /mark complete/i }))
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not mark complete'))
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('shows toast.error when recurring complete fails', async () => {
    recordCompletionMock.mockResolvedValueOnce({ error: 'Unauthorized' })
    const user = userEvent.setup()
    render(
      <ActivityActionsHarness
        taskId="task-rec-2"
        type="task"
        title="Stretch"
        status="pending"
        recurrence="weekly"
        social={{ activityType: 'solo', visibility: 'only_me' }}
      />,
    )
    await user.click(screen.getByRole('button', { name: /log today/i }))
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not log completion'))
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('shows toast.error when edit save fails', async () => {
    updateTaskMock.mockResolvedValueOnce({ error: 'Not found' })
    const user = userEvent.setup()
    render(<ActivityActionsHarness {...goalProps} />)
    await user.click(screen.getByRole('button', { name: /edit goal/i }))
    await user.click(screen.getByRole('button', { name: 'submit-edit' }))
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not save activity'))
    expect(refreshMock).not.toHaveBeenCalled()
  })

  // S8: a task already part of a recurrence group whose recurrence/recurrenceCount
  // changes routes to updateTaskSeries (regenerate the group's future pending
  // rows); row-shaped-only edits keep updateTask.
  const seriesTaskProps = {
    taskId: 'task-series-1',
    type: 'task' as const,
    title: 'Weekly review',
    status: 'pending' as const,
    startAt: '2026-07-01T09:00:00.000Z',
    endAt: '2026-07-01T10:00:00.000Z',
    recurrence: 'weekly',
    recurrenceCount: 4,
    social: { activityType: 'solo' as const, visibility: 'only_me' as const },
  }

  it('seeds recurrenceCount into the edit dialog initialValues from the row', async () => {
    const user = userEvent.setup()
    render(<ActivityActionsHarness {...seriesTaskProps} />)
    await user.click(screen.getByRole('button', { name: /edit task/i }))
    expect(screen.getByTestId('dialog-recurrence-count')).toHaveTextContent('4')
    expect(screen.getByTestId('dialog-recurrence')).toHaveTextContent('weekly')
  })

  it('routes a changed recurrenceCount to updateTaskSeries (not updateTask)', async () => {
    const user = userEvent.setup()
    render(<ActivityActionsHarness {...seriesTaskProps} />)
    await user.click(screen.getByRole('button', { name: /edit task/i }))
    await user.click(screen.getByRole('button', { name: 'submit-series-edit' }))
    await waitFor(() =>
      expect(updateTaskSeriesMock).toHaveBeenCalledWith({
        taskId: 'task-series-1',
        recurrence: 'weekly',
        recurrenceCount: 8,
      }),
    )
    expect(updateTaskMock).not.toHaveBeenCalled()
    expect(refreshMock).toHaveBeenCalled()
  })

  // S10: setting a frequency (± count) on a NON-recurring task routes to
  // updateTaskSeries, which materializes the series. Clearing recurrence on an
  // already-recurring task stays on updateTask (series → one-off, unchanged).
  it('routes making a non-recurring task recurring to updateTaskSeries (materialize)', async () => {
    const user = userEvent.setup()
    render(
      <ActivityActionsHarness
        taskId="task-oneoff"
        type="task"
        title="One off"
        status="pending"
        startAt="2026-07-01T09:00:00.000Z"
        social={{ activityType: 'solo', visibility: 'only_me' }}
      />,
    )
    await user.click(screen.getByRole('button', { name: /edit task/i }))
    await user.click(screen.getByRole('button', { name: 'submit-series-edit' }))
    await waitFor(() =>
      expect(updateTaskSeriesMock).toHaveBeenCalledWith({
        taskId: 'task-oneoff',
        recurrence: 'weekly',
        recurrenceCount: 8,
      }),
    )
    expect(updateTaskMock).not.toHaveBeenCalled()
    expect(refreshMock).toHaveBeenCalled()
  })

  it('keeps clearing recurrence on a recurring task on updateTask (series → one-off)', async () => {
    const user = userEvent.setup()
    render(
      <ActivityActionsHarness
        taskId="task-clear"
        type="task"
        title="Weekly review"
        status="pending"
        startAt="2026-07-01T09:00:00.000Z"
        recurrence="weekly"
        social={{ activityType: 'solo', visibility: 'only_me' }}
      />,
    )
    await user.click(screen.getByRole('button', { name: /edit task/i }))
    // submit-edit emits recurrence: null for a task → recurrence cleared.
    await user.click(screen.getByRole('button', { name: 'submit-edit' }))
    await waitFor(() => expect(updateTaskMock).toHaveBeenCalled())
    expect(updateTaskSeriesMock).not.toHaveBeenCalled()
  })

  it('keeps a row-shaped-only task edit on updateTask (not updateTaskSeries)', async () => {
    const user = userEvent.setup()
    render(
      <ActivityActionsHarness
        taskId="task-plain"
        type="task"
        title="One-off"
        status="pending"
        startAt="2026-07-01T09:00:00.000Z"
        social={{ activityType: 'solo', visibility: 'only_me' }}
      />,
    )
    await user.click(screen.getByRole('button', { name: /edit task/i }))
    await user.click(screen.getByRole('button', { name: 'submit-edit' }))
    await waitFor(() => expect(updateTaskMock).toHaveBeenCalled())
    expect(updateTaskSeriesMock).not.toHaveBeenCalled()
  })

  it('shows toast.error when a series edit fails to persist', async () => {
    updateTaskSeriesMock.mockResolvedValueOnce({ error: 'Not a series' })
    const user = userEvent.setup()
    render(<ActivityActionsHarness {...seriesTaskProps} />)
    await user.click(screen.getByRole('button', { name: /edit task/i }))
    await user.click(screen.getByRole('button', { name: 'submit-series-edit' }))
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not save activity'))
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('shows toast.error when delete fails (no refresh)', async () => {
    deleteTaskMock.mockResolvedValueOnce({ error: 'Not found' })
    const user = userEvent.setup()
    render(<ActivityActionsHarness {...goalProps} />)
    await user.click(screen.getByRole('button', { name: /delete goal/i }))
    await user.click(screen.getByRole('button', { name: /confirm delete/i }))
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not delete activity'))
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('deletes via deleteTask and refreshes', async () => {
    const user = userEvent.setup()
    render(<ActivityActionsHarness {...goalProps} />)
    await user.click(screen.getByRole('button', { name: /delete goal/i }))
    await user.click(screen.getByRole('button', { name: /confirm delete/i }))
    await waitFor(() => expect(deleteTaskMock).toHaveBeenCalledWith({ id: 'goal-1' }))
    expect(refreshMock).toHaveBeenCalled()
  })
})
