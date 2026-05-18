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
import {
  saveAnthropicKey,
  clearAnthropicKey,
  saveModelPreference,
} from '@/server/actions/user-settings'

const authedSession = { user: { id: 'user-1' } } as unknown as Awaited<ReturnType<typeof auth>>

describe('saveAnthropicKey', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const fd = new FormData()
    fd.append('apiKey', 'sk-ant-test')
    expect(await saveAnthropicKey(fd)).toEqual({ error: 'Unauthorized' })
  })

  it('returns error when key is empty string', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    const fd = new FormData()
    fd.append('apiKey', '   ')
    expect(await saveAnthropicKey(fd)).toEqual({ error: 'API key is required' })
  })

  it('returns error when apiKey field is missing', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    expect(await saveAnthropicKey(new FormData())).toEqual({ error: 'API key is required' })
  })

  it('encrypts the trimmed key and saves it', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    const fd = new FormData()
    fd.append('apiKey', '  sk-ant-api01-real  ')
    await saveAnthropicKey(fd)
    expect(vi.mocked(encrypt)).toHaveBeenCalledWith('sk-ant-api01-real')
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith({ anthropicApiKey: 'iv:tag:ct' })
  })

  it('returns empty object on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    const fd = new FormData()
    fd.append('apiKey', 'sk-ant-valid')
    expect(await saveAnthropicKey(fd)).toEqual({})
  })

  it('returns error when rate limited', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)
    const fd = new FormData()
    fd.append('apiKey', 'sk-ant-test')
    expect(await saveAnthropicKey(fd)).toEqual({ error: 'Too many requests' })
  })
})

describe('clearAnthropicKey', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets anthropicApiKey to null', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    await clearAnthropicKey()
    expect(mockSet).toHaveBeenCalledWith({ anthropicApiKey: null })
  })

  it('returns error when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const result = await clearAnthropicKey()
    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns empty object on success', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    expect(await clearAnthropicKey()).toEqual({})
  })

  it('returns error when rate limited', async () => {
    vi.mocked(auth).mockResolvedValue(authedSession)
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)
    expect(await clearAnthropicKey()).toEqual({ error: 'Too many requests' })
  })
})

describe('saveModelPreference', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
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
