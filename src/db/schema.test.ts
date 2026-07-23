import { activities, events, conversations, eventSeries } from '@/db/schema'

it('activities has the template columns', () => {
  expect(activities.title).toBeDefined()
  expect(activities.minDurationMin).toBeDefined()
  expect(activities.maxDurationMin).toBeDefined()
  expect(activities.weeklyTargetSessions).toBeDefined()
  expect(activities.schedule).toBeDefined()
  expect(activities.timeZone).toBeDefined()
  expect(activities.generatedThrough).toBeDefined()
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
