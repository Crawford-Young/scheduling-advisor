import { tasks, seriesSlotTombstones } from '@/db/schema'
it('tasks has rich columns', () => {
  expect(tasks.location).toBeDefined()
  expect(tasks.description).toBeDefined()
  expect(tasks.color).toBeDefined()
  expect(tasks.allDay).toBeDefined()
  expect(tasks.locked).toBeDefined()
})

it('series_slot_tombstones carries the slot identity columns', () => {
  expect(seriesSlotTombstones.id).toBeDefined()
  expect(seriesSlotTombstones.userId).toBeDefined()
  expect(seriesSlotTombstones.recurrenceGroupId).toBeDefined()
  expect(seriesSlotTombstones.slotStart).toBeDefined()
})
