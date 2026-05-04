import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSet, mockUpdate } = vi.hoisted(() => {
  const mockWhere = vi.fn().mockResolvedValue(undefined)
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet })
  return { mockSet, mockUpdate }
})

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/db', () => ({ db: { update: mockUpdate } }))
vi.mock('@/db/schema', () => ({ users: {} }))
vi.mock('@/lib/encryption', () => ({ encrypt: vi.fn(() => 'iv:tag:ct') }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }))
vi.mock('@/lib/redis', () => ({
  ratelimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}))

import { auth } from '@/auth'
import { encrypt } from '@/lib/encryption'
import { ratelimit } from '@/lib/redis'
import { saveApiKey, clearApiKey, saveModelPreference } from '@/server/actions/user-settings'

const authedSession = { user: { id: 'user-1' } } as unknown as Awaited<ReturnType<typeof auth>>

describe('saveApiKey', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null)
    const fd = new FormData()
    fd.append('apiKey', 'sk-ant-test')
    expect(await saveApiKey(fd)).toEqual({ error: 'Unauthorized' })
  })

  it('returns error when key is empty string', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    const fd = new FormData()
    fd.append('apiKey', '   ')
    expect(await saveApiKey(fd)).toEqual({ error: 'API key is required' })
  })

  it('returns error when apiKey field is missing', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    expect(await saveApiKey(new FormData())).toEqual({ error: 'API key is required' })
  })

  it('encrypts the trimmed key and saves it', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    const fd = new FormData()
    fd.append('apiKey', '  sk-ant-api01-real  ')
    await saveApiKey(fd)
    expect(vi.mocked(encrypt)).toHaveBeenCalledWith('sk-ant-api01-real')
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith({ anthropicApiKey: 'iv:tag:ct' })
  })

  it('returns empty object on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    const fd = new FormData()
    fd.append('apiKey', 'sk-ant-valid')
    expect(await saveApiKey(fd)).toEqual({})
  })

  it('returns error when rate limited', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)
    const fd = new FormData()
    fd.append('apiKey', 'sk-ant-test')
    expect(await saveApiKey(fd)).toEqual({ error: 'Too many requests' })
  })
})

describe('clearApiKey', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets anthropicApiKey to null', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await clearApiKey()
    expect(mockSet).toHaveBeenCalledWith({ anthropicApiKey: null })
  })

  it('returns error when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null)
    const result = await clearApiKey()
    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns empty object on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    expect(await clearApiKey()).toEqual({})
  })

  it('returns error when rate limited', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)
    expect(await clearApiKey()).toEqual({ error: 'Too many requests' })
  })
})

describe('saveModelPreference', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null)
    expect(await saveModelPreference('claude-sonnet-4-6')).toEqual({ error: 'Unauthorized' })
  })

  it('returns error for unknown model', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    expect(await saveModelPreference('gpt-4')).toEqual({ error: 'Invalid model' })
  })

  it('saves claude-sonnet-4-6', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await saveModelPreference('claude-sonnet-4-6')
    expect(mockSet).toHaveBeenCalledWith({ preferredModel: 'claude-sonnet-4-6' })
  })

  it('saves claude-opus-4-7', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await saveModelPreference('claude-opus-4-7')
    expect(mockSet).toHaveBeenCalledWith({ preferredModel: 'claude-opus-4-7' })
  })

  it('returns empty object on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    expect(await saveModelPreference('claude-sonnet-4-6')).toEqual({})
  })

  it('returns error when rate limited', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)
    expect(await saveModelPreference('claude-sonnet-4-6')).toEqual({ error: 'Too many requests' })
  })
})
