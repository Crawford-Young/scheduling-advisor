import { tasks } from '@/db/schema'
it('tasks has rich columns', () => {
  expect(tasks.location).toBeDefined()
  expect(tasks.description).toBeDefined()
  expect(tasks.color).toBeDefined()
  expect(tasks.allDay).toBeDefined()
})
