import {
  activities,
  events,
  conversations,
  eventSeries,
  calendarPrefs,
  friendships,
  users,
} from '@/db/schema'

it('activities has the template columns', () => {
  expect(activities.title).toBeDefined()
  expect(activities.minDurationMin).toBeDefined()
  expect(activities.maxDurationMin).toBeDefined()
  expect(activities.weeklyTargetSessions).toBeDefined()
})

it('activities no longer has the dropped schedule columns (A9)', () => {
  expect('schedule' in activities).toBe(false)
  expect('timeZone' in activities).toBe(false)
  expect('generatedThrough' in activities).toBe(false)
})

it('events has the independent-original columns', () => {
  expect(events.activityId).toBeDefined()
  expect(events.status).toBeDefined()
  expect(events.locked).toBeDefined()
  expect(events.startAt).toBeDefined()
  expect(events.endAt).toBeDefined()
})

it('conversations carries the model column', () => {
  expect(conversations.model).toBeDefined()
})

it('eventSeries has the recurrence-rule columns', () => {
  expect(eventSeries.id).toBeDefined()
  expect(eventSeries.userId).toBeDefined()
  expect(eventSeries.activityId).toBeDefined()
  expect(eventSeries.title).toBeDefined()
  expect(eventSeries.description).toBeDefined()
  expect(eventSeries.location).toBeDefined()
  expect(eventSeries.color).toBeDefined()
  expect(eventSeries.freq).toBeDefined()
  expect(eventSeries.weekdays).toBeDefined()
  expect(eventSeries.dayOfMonth).toBeDefined()
  expect(eventSeries.nthOrdinal).toBeDefined()
  expect(eventSeries.nthWeekday).toBeDefined()
  expect(eventSeries.month).toBeDefined()
  expect(eventSeries.startMinutes).toBeDefined()
  expect(eventSeries.durationMin).toBeDefined()
  expect(eventSeries.timeZone).toBeDefined()
  expect(eventSeries.until).toBeDefined()
  expect(eventSeries.generatedThrough).toBeDefined()
})

it('events carries the seriesId column', () => {
  expect(events.seriesId).toBeDefined()
})

it('events carries a visibility column with the enum values and a private default', () => {
  expect(events.visibility).toBeDefined()
  expect(events.visibility.notNull).toBe(true)
  expect(events.visibility.default).toBe('private')
  expect(events.visibility.enumValues).toEqual(['public', 'friends', 'busy', 'private'])
})

it('eventSeries carries a visibility column with the enum values and a private default', () => {
  expect(eventSeries.visibility).toBeDefined()
  expect(eventSeries.visibility.notNull).toBe(true)
  expect(eventSeries.visibility.default).toBe('private')
  expect(eventSeries.visibility.enumValues).toEqual(['public', 'friends', 'busy', 'private'])
})

it('calendarPrefs carries a defaultVisibility column with the enum values and a private default', () => {
  expect(calendarPrefs.defaultVisibility).toBeDefined()
  expect(calendarPrefs.defaultVisibility.notNull).toBe(true)
  expect(calendarPrefs.defaultVisibility.default).toBe('private')
  expect(calendarPrefs.defaultVisibility.enumValues).toEqual([
    'public',
    'friends',
    'busy',
    'private',
  ])
})

it('friendships carries the pair, status, and timestamps', () => {
  expect(friendships.requesterId.notNull).toBe(true)
  expect(friendships.addresseeId.notNull).toBe(true)
  expect(friendships.status.notNull).toBe(true)
  expect(friendships.status.default).toBe('pending')
  expect(friendships.status.enumValues).toEqual(['pending', 'accepted'])
  expect(friendships.respondedAt.notNull).toBe(false)
})

it('users carries the nullable rename-limit stamp column', () => {
  expect(users.lastUsernameChangeAt).toBeDefined()
  expect(users.lastUsernameChangeAt.notNull).toBe(false)
})
