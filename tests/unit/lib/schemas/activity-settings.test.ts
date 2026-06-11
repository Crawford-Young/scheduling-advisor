import { describe, it, expect } from 'vitest'
import { updateActivitySettingsSchema } from '@/lib/schemas/activity-settings'

const uuid = '550e8400-e29b-41d4-a716-446655440000'

describe('updateActivitySettingsSchema', () => {
  it('accepts solo with only_me visibility', () => {
    expect(
      updateActivitySettingsSchema.safeParse({
        taskId: uuid,
        activityType: 'solo',
        visibility: 'only_me',
      }).success,
    ).toBe(true)
  })

  it('accepts group with joinability', () => {
    expect(
      updateActivitySettingsSchema.safeParse({
        taskId: uuid,
        activityType: 'group',
        visibility: 'friends',
        joinability: 'request',
        maxParticipants: 10,
      }).success,
    ).toBe(true)
  })

  it('rejects joinability on solo type', () => {
    expect(
      updateActivitySettingsSchema.safeParse({
        taskId: uuid,
        activityType: 'solo',
        visibility: 'everyone',
        joinability: 'open',
      }).success,
    ).toBe(false)
  })

  it('rejects joinability when group with busy visibility', () => {
    expect(
      updateActivitySettingsSchema.safeParse({
        taskId: uuid,
        activityType: 'group',
        visibility: 'busy',
        joinability: 'open',
      }).success,
    ).toBe(false)
  })

  it('rejects joinability when group with only_me visibility', () => {
    expect(
      updateActivitySettingsSchema.safeParse({
        taskId: uuid,
        activityType: 'group',
        visibility: 'only_me',
        joinability: 'open',
      }).success,
    ).toBe(false)
  })

  it('rejects negative maxParticipants', () => {
    expect(
      updateActivitySettingsSchema.safeParse({
        taskId: uuid,
        activityType: 'group',
        visibility: 'everyone',
        joinability: 'open',
        maxParticipants: -1,
      }).success,
    ).toBe(false)
  })

  it('rejects invalid uuid', () => {
    expect(
      updateActivitySettingsSchema.safeParse({
        taskId: 'bad',
        activityType: 'solo',
        visibility: 'only_me',
      }).success,
    ).toBe(false)
  })
})
