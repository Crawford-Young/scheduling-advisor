import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSelectLimit = vi.hoisted(() => vi.fn())
const mockSelectWhere = vi.hoisted(() => vi.fn().mockReturnValue({ limit: mockSelectLimit }))
const mockSelectFrom = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockSelectWhere }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockSelectFrom }))

const mockUpdateWhere = vi.hoisted(() => vi.fn())
const mockUpdateSet = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockUpdateWhere }))
const mockUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ set: mockUpdateSet }))

vi.mock('@/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { id: 'u1' } }) }))

vi.mock('@/lib/redis', () => ({
  ratelimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}))

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn() } }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/db', () => ({ db: { select: mockSelect, update: mockUpdate } }))

import { DrizzleQueryError } from 'drizzle-orm/errors'
import { NeonDbError } from '@neondatabase/serverless'
import { auth } from '@/auth'
import { logger } from '@/lib/logger'
import { ratelimit } from '@/lib/redis'
import { USERNAME_RENAME_WINDOW_MS } from '@/lib/schemas/username'
import { revalidatePath } from 'next/cache'
import { setUsername, updateProfile } from './profile'

const OUTSIDE_WINDOW = new Date(Date.now() - USERNAME_RENAME_WINDOW_MS - 1)
const INSIDE_WINDOW = new Date(Date.now() - 1000)

describe('module export shape', () => {
  it('every export from profile is a function (use server contract)', async () => {
    const mod = await import('./profile')
    for (const [name, value] of Object.entries(mod)) {
      expect(typeof value, `export "${name}" must be a function`).toBe('function')
    }
  })
})

describe('setUsername', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectLimit.mockReset()
    mockUpdateWhere.mockReset()
    mockUpdateWhere.mockResolvedValue(undefined)
  })

  it('returns Unauthorized when there is no session', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    expect(await setUsername('valid_name')).toEqual({ error: 'Unauthorized' })
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('returns Too many requests when rate limited', async () => {
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)
    expect(await setUsername('valid_name')).toEqual({ error: 'Too many requests' })
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('returns the flattened zod error when too short', async () => {
    expect(await setUsername('ab')).toEqual({
      error: { formErrors: expect.arrayContaining([expect.any(String)]), fieldErrors: {} },
    })
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('returns the flattened zod error when too long', async () => {
    expect(await setUsername('a'.repeat(21))).toEqual({
      error: { formErrors: expect.arrayContaining([expect.any(String)]), fieldErrors: {} },
    })
  })

  it('returns the flattened zod error for a disallowed character', async () => {
    expect(await setUsername('BAD NAME')).toEqual({
      error: { formErrors: expect.arrayContaining([expect.any(String)]), fieldErrors: {} },
    })
  })

  it('returns Unauthorized when the user row is missing', async () => {
    mockSelectLimit.mockResolvedValueOnce([])
    expect(await setUsername('valid_name')).toEqual({ error: 'Unauthorized' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('short-circuits a no-op save with no write and no re-stamp', async () => {
    mockSelectLimit.mockResolvedValueOnce([
      { username: 'valid_name', lastUsernameChangeAt: INSIDE_WINDOW },
    ])
    expect(await setUsername('valid_name')).toEqual({ data: { username: 'valid_name' } })
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockSelect).toHaveBeenCalledTimes(1)
  })

  it('rejects a reserved username with the generic unavailable copy', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ username: null, lastUsernameChangeAt: null }])
    expect(await setUsername('admin')).toEqual({ error: 'Username unavailable' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects a rename inside the window', async () => {
    mockSelectLimit.mockResolvedValueOnce([
      { username: 'old_name', lastUsernameChangeAt: INSIDE_WINDOW },
    ])
    expect(await setUsername('new_name')).toEqual({ error: 'Rename limit reached' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects a name held by another user at the pre-check', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([{ username: 'old_name', lastUsernameChangeAt: OUTSIDE_WINDOW }])
      .mockResolvedValueOnce([{ id: 'u2' }])
    expect(await setUsername('new_name')).toEqual({ error: 'Username unavailable' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('sets the first-ever username without stamping the column (one-change grace)', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([{ username: null, lastUsernameChangeAt: null }])
      .mockResolvedValueOnce([])
    expect(await setUsername('new_name')).toEqual({ data: { username: 'new_name' } })
    expect(mockUpdateSet).toHaveBeenCalledWith({
      username: 'new_name',
      lastUsernameChangeAt: null,
    })
    expect(revalidatePath).toHaveBeenCalledTimes(2)
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
    expect(revalidatePath).toHaveBeenCalledWith('/u/new_name')
  })

  it('stamps a Date on a rename by a caller who already has a username', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([{ username: 'old_name', lastUsernameChangeAt: OUTSIDE_WINDOW }])
      .mockResolvedValueOnce([])
    expect(await setUsername('new_name')).toEqual({ data: { username: 'new_name' } })
    expect(mockUpdateSet).toHaveBeenCalledWith({
      username: 'new_name',
      lastUsernameChangeAt: expect.any(Date),
    })
  })

  it('logs the successful set', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([{ username: null, lastUsernameChangeAt: null }])
      .mockResolvedValueOnce([])
    await setUsername('new_name')
    const payload = { userId: 'u1', username: 'new_name' }
    expect(logger.info).toHaveBeenCalledWith(payload, 'Username set')
  })

  it('renames after the window and revalidates the freed old path', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([{ username: 'old_name', lastUsernameChangeAt: OUTSIDE_WINDOW }])
      .mockResolvedValueOnce([])
    expect(await setUsername('new_name')).toEqual({ data: { username: 'new_name' } })
    expect(revalidatePath).toHaveBeenCalledTimes(3)
    expect(revalidatePath).toHaveBeenCalledWith('/u/old_name')
  })

  it('lets a pre-migration user with no stamp rename once', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([{ username: 'old_name', lastUsernameChangeAt: null }])
      .mockResolvedValueOnce([])
    expect(await setUsername('new_name')).toEqual({ data: { username: 'new_name' } })
    expect(mockUpdateSet).toHaveBeenCalledWith({
      username: 'new_name',
      lastUsernameChangeAt: expect.any(Date),
    })
  })

  it('maps a real unique-violation throw to the unavailable copy', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([{ username: null, lastUsernameChangeAt: null }])
      .mockResolvedValueOnce([])
    const driverError = new NeonDbError('duplicate key value violates unique constraint')
    driverError.code = '23505'
    mockUpdateWhere.mockRejectedValueOnce(
      new DrizzleQueryError('update "users" set "username" = $1', [], driverError),
    )
    expect(await setUsername('new_name')).toEqual({ error: 'Username unavailable' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('re-throws a database error that is not a unique violation', async () => {
    mockSelectLimit
      .mockResolvedValueOnce([{ username: null, lastUsernameChangeAt: null }])
      .mockResolvedValueOnce([])
    mockUpdateWhere.mockRejectedValueOnce(new Error('connection lost'))
    await expect(setUsername('new_name')).rejects.toThrow('connection lost')
  })
})

describe('updateProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateWhere.mockReset()
    mockUpdateWhere.mockResolvedValue(undefined)
  })

  it('rejects when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    await expect(updateProfile({ name: 'Crawford', bio: 'hi' })).rejects.toThrow('Unauthorized')
  })

  it('rejects invalid input without touching db', async () => {
    await expect(updateProfile({ name: '', bio: '' })).rejects.toThrow()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('updates name and bio for the session user', async () => {
    await updateProfile({ name: 'Crawford', bio: 'hello there' })
    expect(mockUpdateSet).toHaveBeenCalledWith({ name: 'Crawford', bio: 'hello there' })
  })
})
