import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/db', () => ({ db: { update: vi.fn() } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { auth } from '@/auth'
import { db } from '@/db'

describe('setUsername', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const { setUsername } = await import('./profile')
    await expect(setUsername('valid_name')).rejects.toThrow('Unauthorized')
  })

  it('rejects invalid username without touching db', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1' } } as never)
    const { setUsername } = await import('./profile')
    await expect(setUsername('BAD NAME')).rejects.toThrow()
    expect(db.update).not.toHaveBeenCalled()
  })

  it('updates username for the session user', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1' } } as never)
    const where = vi.fn()
    const set = vi.fn(() => ({ where }))
    vi.mocked(db.update).mockReturnValueOnce({ set } as never)
    const { setUsername } = await import('./profile')
    await setUsername('crawford_young')
    expect(set).toHaveBeenCalledWith({ username: 'crawford_young' })
  })
})

describe('updateProfile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const { updateProfile } = await import('./profile')
    await expect(updateProfile({ name: 'Crawford', bio: 'hi' })).rejects.toThrow('Unauthorized')
  })

  it('rejects invalid input without touching db', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1' } } as never)
    const { updateProfile } = await import('./profile')
    await expect(updateProfile({ name: '', bio: '' })).rejects.toThrow()
    expect(db.update).not.toHaveBeenCalled()
  })

  it('updates name and bio for the session user', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'u1' } } as never)
    const where = vi.fn()
    const set = vi.fn(() => ({ where }))
    vi.mocked(db.update).mockReturnValueOnce({ set } as never)
    const { updateProfile } = await import('./profile')
    await updateProfile({ name: 'Crawford', bio: 'hello there' })
    expect(set).toHaveBeenCalledWith({ name: 'Crawford', bio: 'hello there' })
  })
})
