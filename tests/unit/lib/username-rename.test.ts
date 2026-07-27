import { describe, expect, it } from 'vitest'
import { isRenameBlocked } from '@/lib/username-rename'
import { USERNAME_RENAME_WINDOW_MS } from '@/lib/schemas/username'

const now = new Date('2026-07-27T12:00:00.000Z')

describe('isRenameBlocked', () => {
  it('never blocks the first-ever set', () => {
    expect(isRenameBlocked({ currentUsername: null, lastChangeAt: null, now })).toBe(false)
  })

  it('never blocks a user who has a username but no recorded stamp', () => {
    const lastChangeAt = null
    expect(isRenameBlocked({ currentUsername: 'ada', lastChangeAt, now })).toBe(false)
  })

  it('blocks a rename inside the window', () => {
    const lastChangeAt = new Date(now.getTime() - USERNAME_RENAME_WINDOW_MS + 1)
    expect(isRenameBlocked({ currentUsername: 'ada', lastChangeAt, now })).toBe(true)
  })

  it('allows a rename exactly at the window boundary', () => {
    const lastChangeAt = new Date(now.getTime() - USERNAME_RENAME_WINDOW_MS)
    expect(isRenameBlocked({ currentUsername: 'ada', lastChangeAt, now })).toBe(false)
  })

  it('allows a rename after the window', () => {
    const lastChangeAt = new Date(now.getTime() - USERNAME_RENAME_WINDOW_MS - 1)
    expect(isRenameBlocked({ currentUsername: 'ada', lastChangeAt, now })).toBe(false)
  })
})
