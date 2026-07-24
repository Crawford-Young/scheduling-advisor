import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import ActivitiesPage from './page'

const authMock = vi.fn()
const getUserActivitiesMock = vi.fn()
const getUserEventsMock = vi.fn()
const getStandaloneEventsMock = vi.fn()
const getSeriesForUserMock = vi.fn()
const safeDeleteExpiredEventsMock = vi.fn()
const safeGenerateEventsMock = vi.fn()
const getCalendarPrefsMock = vi.fn()

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    ViewTransition: ({
      children,
      enter,
      exit,
      default: defaultTransition,
    }: {
      readonly children: React.ReactNode
      readonly enter?: string
      readonly exit?: string
      readonly default?: string
    }) => (
      <div
        data-testid="view-transition"
        data-enter={enter}
        data-exit={exit}
        data-default={defaultTransition}
      >
        {children}
      </div>
    ),
  }
})

vi.mock('@/auth', () => ({ auth: () => authMock() }))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT')
  }),
}))

vi.mock('@/server/queries/activities', () => ({
  getUserActivities: () => getUserActivitiesMock(),
}))

vi.mock('@/server/queries/events', () => ({
  getUserEvents: () => getUserEventsMock(),
  getStandaloneEvents: () => getStandaloneEventsMock(),
}))

vi.mock('@/server/queries/series', () => ({
  getSeriesForUser: (userId: string) => getSeriesForUserMock(userId),
}))

vi.mock('@/server/actions/event-ttl', () => ({
  safeDeleteExpiredEvents: () => safeDeleteExpiredEventsMock(),
}))

vi.mock('@/server/actions/event-generation', () => ({
  safeGenerateEvents: () => safeGenerateEventsMock(),
}))

vi.mock('@/server/queries/calendar-prefs', () => ({
  getCalendarPrefs: () => getCalendarPrefsMock(),
}))

vi.mock('@/components/activity/activity-filters', () => ({
  ActivityFilters: () => <div data-testid="activity-filters" />,
}))

vi.mock('@/components/activity/activity-create-button', () => ({
  ActivityCreateButton: ({ use24h }: { use24h?: boolean }) => (
    <div data-testid="activity-create-button" data-use24h={String(use24h)} />
  ),
}))

interface MockActivityRow {
  id: string
  title: string
  series: { id: string }[]
  weeklyTargetSessions: number
  completedThisWeek: number
  nextEventIso: string | null
}

vi.mock('@/components/activity/activity-table', () => ({
  ActivityTable: ({
    items,
    use24h,
    initialEditId,
  }: {
    items: MockActivityRow[]
    use24h?: boolean
    initialEditId?: string | null
  }) => (
    <div
      data-testid="activity-table"
      data-use24h={String(use24h)}
      data-initial-edit-id={initialEditId ?? ''}
    >
      {items.map((row) => (
        <div
          key={row.id}
          data-testid="activity-row"
          data-activity-id={row.id}
          data-series-len={String(row.series.length)}
          data-weekly-target={String(row.weeklyTargetSessions)}
          data-completed={String(row.completedThisWeek)}
          data-next-event={row.nextEventIso ?? ''}
        >
          <span>{row.title}</span>
        </div>
      ))}
    </div>
  ),
  OneOffEventsTable: ({
    items,
    use24h,
  }: {
    items: { id: string; title: string; status: string }[]
    use24h?: boolean
  }) => (
    <div data-testid="one-off-table" data-use24h={String(use24h)}>
      {items.map((row) => (
        <div key={row.id} data-testid="one-off-row" data-event-id={row.id} data-status={row.status}>
          <span>{row.title}</span>
        </div>
      ))}
    </div>
  ),
  SeriesTable: ({
    items,
    use24h,
  }: {
    items: { id: string; title: string; nextOccurrenceIso: string | null }[]
    use24h?: boolean
  }) => (
    <div data-testid="series-table" data-use24h={String(use24h)}>
      {items.map((row) => (
        <div
          key={row.id}
          data-testid="series-row"
          data-series-id={row.id}
          data-next-occurrence={row.nextOccurrenceIso ?? ''}
        >
          <span>{row.title}</span>
        </div>
      ))}
    </div>
  ),
}))

vi.mock('@/components/chat/open-chat-button', () => ({
  OpenChatButton: ({ label }: { label: string }) => <button>{label}</button>,
}))

vi.mock('@/lib/ui', () => ({
  EmptyState: ({ message }: { message: string }) => <p>{message}</p>,
  StaggerReveal: ({
    children,
    className,
  }: {
    readonly children: React.ReactNode
    readonly className?: string
  }) => (
    <div data-testid="stagger-reveal" className={className}>
      {children}
    </div>
  ),
}))

type ActivityOverrides = {
  id?: string
  title?: string
  weeklyTargetSessions?: number
  color?: string | null
  timeZone?: string | null
}

function makeActivity(over: ActivityOverrides = {}) {
  return {
    id: 'act-1',
    userId: 'user-1',
    title: 'Running',
    color: null,
    description: null,
    defaultLocation: null,
    minDurationMin: 30,
    maxDurationMin: 60,
    weeklyTargetSessions: 3,
    generatedThrough: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...over,
  }
}

type EventOverrides = {
  id?: string
  activityId?: string | null
  seriesId?: string | null
  title?: string
  startAt?: Date | null
  endAt?: Date | null
  status?: 'pending' | 'completed'
}

function makeEvent(over: EventOverrides = {}) {
  return {
    id: 'evt-1',
    userId: 'user-1',
    activityId: 'act-1',
    seriesId: null,
    title: 'Run session',
    description: null,
    location: null,
    startAt: new Date('2026-06-22T13:00:00.000Z'),
    endAt: new Date('2026-06-22T14:00:00.000Z'),
    allDay: false,
    status: 'pending' as const,
    locked: false,
    color: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...over,
  }
}

type SeriesOverrides = {
  id?: string
  activityId?: string | null
  title?: string
  freq?: 'daily' | 'weekly' | 'monthly' | 'yearly'
  weekdays?: readonly number[] | null
  dayOfMonth?: number | null
  nthOrdinal?: number | null
  nthWeekday?: number | null
  month?: number | null
  startMinutes?: number
  durationMin?: number
  until?: Date | null
}

function makeSeries(over: SeriesOverrides = {}) {
  return {
    id: 'series-1',
    userId: 'user-1',
    activityId: 'act-1',
    title: 'Stretch',
    description: null,
    location: null,
    color: null,
    freq: 'weekly' as const,
    weekdays: [1, 3, 5],
    dayOfMonth: null,
    nthOrdinal: null,
    nthWeekday: null,
    month: null,
    startMinutes: 540,
    durationMin: 30,
    timeZone: null,
    until: null,
    generatedThrough: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...over,
  }
}

function makeSession() {
  return { user: { id: 'user-1' } }
}

const VALID_UUID = '11111111-1111-4111-8111-111111111111'

describe('ActivitiesPage', () => {
  beforeEach(() => {
    authMock.mockReset()
    getUserActivitiesMock.mockReset().mockResolvedValue([])
    getUserEventsMock.mockReset().mockResolvedValue([])
    getStandaloneEventsMock.mockReset().mockResolvedValue([])
    safeDeleteExpiredEventsMock.mockReset().mockResolvedValue(undefined)
    safeGenerateEventsMock.mockReset().mockResolvedValue(undefined)
    getCalendarPrefsMock.mockReset().mockResolvedValue(null)
    getSeriesForUserMock.mockReset().mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('redirects to /login when unauthenticated', async () => {
    authMock.mockResolvedValue(null)
    await expect(ActivitiesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT')
  })

  it('sweeps safeDeleteExpiredEvents then safeGenerateEvents before querying activities', async () => {
    authMock.mockResolvedValue(makeSession())
    await ActivitiesPage({ searchParams: Promise.resolve({}) })
    const deleteOrder = safeDeleteExpiredEventsMock.mock.invocationCallOrder[0]!
    const genOrder = safeGenerateEventsMock.mock.invocationCallOrder[0]!
    const activitiesOrder = getUserActivitiesMock.mock.invocationCallOrder[0]!
    expect(deleteOrder).toBeLessThan(genOrder)
    expect(genOrder).toBeLessThan(activitiesOrder)
  })

  it('renders one row per activity', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([
      makeActivity({ id: 'a', title: 'Running' }),
      makeActivity({ id: 'b', title: 'Reading' }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getAllByTestId('activity-row')).toHaveLength(2)
  })

  it('filters activities by ?q= (case-insensitive title match)', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([
      makeActivity({ id: 'a', title: 'Morning gym session' }),
      makeActivity({ id: 'b', title: 'Read a book' }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({ q: 'GYM' }) }))
    const rows = screen.getAllByTestId('activity-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveAttribute('data-activity-id', 'a')
  })

  it('computes weekly fit (completed this local week) per activity', async () => {
    vi.useFakeTimers()
    // A Wednesday; the local week runs Sun 06-21 .. Sun 06-28.
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'))
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([
      makeActivity({ id: 'act-1', weeklyTargetSessions: 3 }),
    ])
    getUserEventsMock.mockResolvedValue([
      makeEvent({
        id: 'e1',
        activityId: 'act-1',
        status: 'completed',
        startAt: new Date('2026-06-22T13:00:00.000Z'),
      }),
      makeEvent({
        id: 'e2',
        activityId: 'act-1',
        status: 'completed',
        startAt: new Date('2026-06-23T13:00:00.000Z'),
      }),
      // pending in-week — not counted
      makeEvent({
        id: 'e3',
        activityId: 'act-1',
        status: 'pending',
        startAt: new Date('2026-06-24T13:00:00.000Z'),
      }),
      // completed but different activity — not counted
      makeEvent({
        id: 'e4',
        activityId: 'other',
        status: 'completed',
        startAt: new Date('2026-06-22T13:00:00.000Z'),
      }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    const row = screen.getByTestId('activity-row')
    expect(row).toHaveAttribute('data-completed', '2')
    expect(row).toHaveAttribute('data-weekly-target', '3')
  })

  it('derives the next event as the earliest future start for that activity', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'))
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity({ id: 'act-1' })])
    getUserEventsMock.mockResolvedValue([
      // past — ignored
      makeEvent({ id: 'e0', activityId: 'act-1', startAt: new Date('2026-06-20T13:00:00.000Z') }),
      makeEvent({ id: 'e1', activityId: 'act-1', startAt: new Date('2026-06-27T13:00:00.000Z') }),
      makeEvent({ id: 'e2', activityId: 'act-1', startAt: new Date('2026-06-25T13:00:00.000Z') }),
      // other activity — ignored
      makeEvent({ id: 'e3', activityId: 'other', startAt: new Date('2026-06-24T18:00:00.000Z') }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    const row = screen.getByTestId('activity-row')
    expect(row).toHaveAttribute('data-next-event', '2026-06-25T13:00:00.000Z')
  })

  it('sets next event to empty when the activity has no future events', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'))
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity({ id: 'act-1' })])
    getUserEventsMock.mockResolvedValue([
      makeEvent({ id: 'e0', activityId: 'act-1', startAt: new Date('2026-06-20T13:00:00.000Z') }),
      makeEvent({ id: 'e1', activityId: 'act-1', startAt: null }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('activity-row')).toHaveAttribute('data-next-event', '')
  })

  it('passes a validated ?edit uuid owned by the user as initialEditId', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity({ id: VALID_UUID, title: 'Running' })])
    render(await ActivitiesPage({ searchParams: Promise.resolve({ edit: VALID_UUID }) }))
    expect(screen.getByTestId('activity-table')).toHaveAttribute('data-initial-edit-id', VALID_UUID)
  })

  it('ignores a non-uuid ?edit value', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity({ id: 'act-1' })])
    render(await ActivitiesPage({ searchParams: Promise.resolve({ edit: 'not-a-uuid' }) }))
    expect(screen.getByTestId('activity-table')).toHaveAttribute('data-initial-edit-id', '')
  })

  it('ignores a valid ?edit uuid that the user does not own', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity({ id: 'act-1' })])
    render(await ActivitiesPage({ searchParams: Promise.resolve({ edit: VALID_UUID }) }))
    expect(screen.getByTestId('activity-table')).toHaveAttribute('data-initial-edit-id', '')
  })

  it('renders the one-off events section when standalone events exist', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity()])
    getStandaloneEventsMock.mockResolvedValue([
      makeEvent({ id: 'so-1', activityId: null, title: 'Dentist', status: 'pending' }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    const section = screen.getByTestId('one-off-table')
    expect(within(section).getByText('Dentist')).toBeInTheDocument()
    expect(within(section).getByTestId('one-off-row')).toHaveAttribute('data-status', 'pending')
  })

  it('renders a past standalone event in the one-off section (past events remain editable)', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity()])
    getStandaloneEventsMock.mockResolvedValue([
      makeEvent({
        id: 'so-past',
        activityId: null,
        title: 'Old dentist visit',
        status: 'pending',
        startAt: new Date('2020-01-01T13:00:00.000Z'),
        endAt: new Date('2020-01-01T14:00:00.000Z'),
      }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    const section = screen.getByTestId('one-off-table')
    expect(within(section).getByText('Old dentist visit')).toBeInTheDocument()
  })

  it('omits the one-off section when there are no standalone events', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity()])
    getStandaloneEventsMock.mockResolvedValue([])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.queryByTestId('one-off-table')).not.toBeInTheDocument()
  })

  it('shows the empty state when there are no activities', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText(/no activities yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /plan with ai/i })).toBeInTheDocument()
    expect(screen.queryByTestId('activity-table')).not.toBeInTheDocument()
  })

  it('threads use24h=true from calendar prefs into the tables and create button', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity()])
    getStandaloneEventsMock.mockResolvedValue([makeEvent({ id: 'so-1', activityId: null })])
    getCalendarPrefsMock.mockResolvedValue({ use24h: true })
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('activity-create-button')).toHaveAttribute('data-use24h', 'true')
    expect(screen.getByTestId('activity-table')).toHaveAttribute('data-use24h', 'true')
    expect(screen.getByTestId('one-off-table')).toHaveAttribute('data-use24h', 'true')
  })

  it('defaults use24h to false when there is no calendar prefs row', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity()])
    getCalendarPrefsMock.mockResolvedValue(null)
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('activity-table')).toHaveAttribute('data-use24h', 'false')
  })

  it("passes an activity's linked series through to its row", async () => {
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity({ id: 'act-1' })])
    getSeriesForUserMock.mockResolvedValue([
      makeSeries({ id: 's1', activityId: 'act-1' }),
      makeSeries({ id: 's2', activityId: 'act-1' }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('activity-row')).toHaveAttribute('data-series-len', '2')
  })

  it("excludes another activity's series from this row's series list", async () => {
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity({ id: 'act-1' })])
    getSeriesForUserMock.mockResolvedValue([
      makeSeries({ id: 's1', activityId: 'act-1' }),
      makeSeries({ id: 's2', activityId: 'other-activity' }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('activity-row')).toHaveAttribute('data-series-len', '1')
  })

  it('renders the "Repeating events" section listing standalone series', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity()])
    getSeriesForUserMock.mockResolvedValue([
      makeSeries({ id: 'standalone-1', activityId: null, title: 'Journal' }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    const section = screen.getByTestId('series-table')
    expect(within(section).getByText('Journal')).toBeInTheDocument()
  })

  it('omits the "Repeating events" section when there are no standalone series', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity()])
    getSeriesForUserMock.mockResolvedValue([makeSeries({ id: 's1', activityId: 'act-1' })])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.queryByTestId('series-table')).not.toBeInTheDocument()
  })

  it('computes a standalone series next occurrence as the earliest future event for that series', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'))
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity()])
    getSeriesForUserMock.mockResolvedValue([
      makeSeries({ id: 'standalone-1', activityId: null, title: 'Journal' }),
    ])
    getUserEventsMock.mockResolvedValue([
      // past — ignored
      makeEvent({
        id: 'e0',
        seriesId: 'standalone-1',
        startAt: new Date('2026-06-20T13:00:00.000Z'),
      }),
      makeEvent({
        id: 'e1',
        seriesId: 'standalone-1',
        startAt: new Date('2026-06-27T13:00:00.000Z'),
      }),
      makeEvent({
        id: 'e2',
        seriesId: 'standalone-1',
        startAt: new Date('2026-06-25T13:00:00.000Z'),
      }),
      // other series — ignored
      makeEvent({
        id: 'e3',
        seriesId: 'other-series',
        startAt: new Date('2026-06-24T18:00:00.000Z'),
      }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('series-row')).toHaveAttribute(
      'data-next-occurrence',
      '2026-06-25T13:00:00.000Z',
    )
  })

  it('sets a standalone series next occurrence to empty when it has no future events', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'))
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity()])
    getSeriesForUserMock.mockResolvedValue([makeSeries({ id: 'standalone-1', activityId: null })])
    getUserEventsMock.mockResolvedValue([
      makeEvent({
        id: 'e0',
        seriesId: 'standalone-1',
        startAt: new Date('2026-06-20T13:00:00.000Z'),
      }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('series-row')).toHaveAttribute('data-next-occurrence', '')
  })

  it('threads use24h into the Repeating events (series) table', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity()])
    getSeriesForUserMock.mockResolvedValue([makeSeries({ id: 'standalone-1', activityId: null })])
    getCalendarPrefsMock.mockResolvedValue({ use24h: true })
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('series-table')).toHaveAttribute('data-use24h', 'true')
  })

  it('calls getSeriesForUser with the session-derived user id (never a client-supplied id)', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity()])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(getSeriesForUserMock).toHaveBeenCalledWith('user-1')
  })

  it('does not render standalone-series occurrences in the One-off events section (they belong to Repeating events only)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'))
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity()])
    getSeriesForUserMock.mockResolvedValue([
      makeSeries({ id: 'standalone-1', activityId: null, title: 'Journal' }),
    ])
    // getUserEvents returns ALL events unfiltered — includes the series' generated
    // occurrences (used for the Repeating-events next-occurrence computation).
    getUserEventsMock.mockResolvedValue([
      makeEvent({
        id: 'occ-1',
        activityId: null,
        seriesId: 'standalone-1',
        startAt: new Date('2026-06-25T13:00:00.000Z'),
      }),
    ])
    // getStandaloneEvents (real query) excludes seriesId-linked rows — the mock
    // reflects that post-fix behavior directly (the query itself is unit-tested
    // separately in tests/unit/server/queries/events.test.ts).
    getStandaloneEventsMock.mockResolvedValue([])

    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByTestId('series-row')).toHaveAttribute(
      'data-next-occurrence',
      '2026-06-25T13:00:00.000Z',
    )
    expect(screen.queryByTestId('one-off-table')).not.toBeInTheDocument()
    expect(screen.queryByTestId('one-off-row')).not.toBeInTheDocument()
  })

  it('wraps the page in a reveal ViewTransition with a StaggerReveal container', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserActivitiesMock.mockResolvedValue([makeActivity()])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    const viewTransition = screen.getByTestId('view-transition')
    expect(viewTransition).toHaveAttribute('data-enter', 'reveal-enter')
    expect(viewTransition).toHaveAttribute('data-default', 'none')
    const staggerReveal = screen.getByTestId('stagger-reveal')
    expect(staggerReveal).toHaveClass('mx-auto', 'max-w-5xl', 'space-y-10')
    expect(within(viewTransition).getByTestId('stagger-reveal')).toBe(staggerReveal)
  })
})
