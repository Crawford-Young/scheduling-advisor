import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ActivityCreateButton } from './activity-create-button'

const refreshMock = vi.fn()
const toastErrorMock = vi.fn()
const createActivityMock = vi.fn().mockResolvedValue({ data: { id: 'act-new' } })

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('@/server/actions/activities', () => ({
  createActivity: (input: unknown) => createActivityMock(input),
}))

interface MockTemplateValues {
  readonly title: string
  readonly color?: string | null
  readonly description?: string | null
  readonly defaultLocation?: string | null
  readonly minDurationMin: number
  readonly maxDurationMin: number
  readonly weeklyTargetSessions: number
  readonly schedule: ReadonlyArray<{ day: number; startMinutes: number; durationMin: number }>
}

const FULL_TEMPLATE: MockTemplateValues = {
  title: 'Running',
  color: 'blue',
  description: 'cardio',
  defaultLocation: 'Park',
  minDurationMin: 30,
  maxDurationMin: 60,
  weeklyTargetSessions: 3,
  schedule: [{ day: 1, startMinutes: 420, durationMin: 45 }],
}

// Optional fields omitted → exercises the ?? null fallbacks.
const MIN_TEMPLATE: MockTemplateValues = {
  title: 'Reading',
  minDurationMin: 20,
  maxDurationMin: 40,
  weeklyTargetSessions: 2,
  schedule: [],
}

vi.mock('@/lib/ui', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
  toast: { error: (msg: string) => toastErrorMock(msg) },
}))

vi.mock('@/components/forms/activity-template-dialog', () => ({
  ActivityTemplateDialog: ({
    open,
    isPending,
    use24h,
    onSubmit,
  }: {
    open: boolean
    isPending?: boolean
    use24h?: boolean
    onSubmit: (values: MockTemplateValues) => void
  }) =>
    open ? (
      <div role="dialog" aria-label="activity-template">
        <span data-testid="dialog-pending">{String(isPending)}</span>
        <span data-testid="dialog-use24h">{String(use24h)}</span>
        <button type="button" onClick={() => onSubmit(FULL_TEMPLATE)}>
          submit-full
        </button>
        <button type="button" onClick={() => onSubmit(MIN_TEMPLATE)}>
          submit-min
        </button>
      </div>
    ) : null,
}))

const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

describe('ActivityCreateButton', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    toastErrorMock.mockClear()
    createActivityMock.mockClear().mockResolvedValue({ data: { id: 'act-new' } })
  })

  it('opens the template dialog when New is clicked', async () => {
    const user = userEvent.setup()
    render(<ActivityCreateButton />)
    expect(screen.queryByRole('dialog', { name: 'activity-template' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /new/i }))
    expect(screen.getByRole('dialog', { name: 'activity-template' })).toBeInTheDocument()
  })

  it('threads the use24h preference into the dialog', async () => {
    const user = userEvent.setup()
    render(<ActivityCreateButton use24h />)
    await user.click(screen.getByRole('button', { name: /new/i }))
    expect(screen.getByTestId('dialog-use24h')).toHaveTextContent('true')
  })

  it('creates an activity with the mapped payload and browser time zone', async () => {
    const user = userEvent.setup()
    render(<ActivityCreateButton />)
    await user.click(screen.getByRole('button', { name: /new/i }))
    await user.click(screen.getByRole('button', { name: 'submit-full' }))

    await waitFor(() =>
      expect(createActivityMock).toHaveBeenCalledWith({
        title: 'Running',
        color: 'blue',
        description: 'cardio',
        defaultLocation: 'Park',
        minDurationMin: 30,
        maxDurationMin: 60,
        weeklyTargetSessions: 3,
        schedule: [{ day: 1, startMinutes: 420, durationMin: 45 }],
        timeZone: BROWSER_TZ,
      }),
    )
    expect(refreshMock).toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'activity-template' })).not.toBeInTheDocument()
  })

  it('maps omitted optional fields to null on create', async () => {
    const user = userEvent.setup()
    render(<ActivityCreateButton />)
    await user.click(screen.getByRole('button', { name: /new/i }))
    await user.click(screen.getByRole('button', { name: 'submit-min' }))

    await waitFor(() =>
      expect(createActivityMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Reading',
          color: null,
          description: null,
          defaultLocation: null,
          schedule: [],
        }),
      ),
    )
  })

  it('keeps the dialog open and surfaces a toast when createActivity errors', async () => {
    createActivityMock.mockResolvedValueOnce({ error: 'Unauthorized' })
    const user = userEvent.setup()
    render(<ActivityCreateButton />)
    await user.click(screen.getByRole('button', { name: /new/i }))
    await user.click(screen.getByRole('button', { name: 'submit-full' }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not create activity'))
    expect(refreshMock).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'activity-template' })).toBeInTheDocument()
  })
})
