import { render, screen, act, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/server/actions/tokens', () => ({
  getTokenBalanceAction: vi.fn().mockResolvedValue(99),
}))

import { TokenChipLive } from './token-chip-live'
import { getTokenBalanceAction } from '@/server/actions/tokens'

describe('TokenChipLive', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders initial balance', () => {
    render(<TokenChipLive initialBalance={142} />)
    expect(screen.getByLabelText('Token balance: 142')).toBeInTheDocument()
  })

  it('refetches balance on token-balance-changed event', async () => {
    render(<TokenChipLive initialBalance={142} />)
    act(() => {
      window.dispatchEvent(new CustomEvent('token-balance-changed'))
    })
    await waitFor(() => expect(screen.getByLabelText('Token balance: 99')).toBeInTheDocument())
    expect(getTokenBalanceAction).toHaveBeenCalledTimes(1)
  })

  it('keeps stale balance if refetch fails', async () => {
    vi.mocked(getTokenBalanceAction).mockRejectedValueOnce(new Error('net'))
    render(<TokenChipLive initialBalance={142} />)
    act(() => {
      window.dispatchEvent(new CustomEvent('token-balance-changed'))
    })
    await waitFor(() => expect(getTokenBalanceAction).toHaveBeenCalled())
    expect(screen.getByLabelText('Token balance: 142')).toBeInTheDocument()
  })
})
