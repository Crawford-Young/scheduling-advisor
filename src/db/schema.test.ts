import { activities, events, conversations } from '@/db/schema'

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
