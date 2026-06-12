'use client'

import * as React from 'react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TokenChip } from '@/lib/ui'
import { getTokenBalanceAction } from '@/server/actions/tokens'

interface TokenChipLiveProps {
  readonly initialBalance: number
}

export function TokenChipLive({ initialBalance }: TokenChipLiveProps): React.JSX.Element {
  const [balance, setBalance] = useState(initialBalance)

  useEffect(() => {
    async function refresh(): Promise<void> {
      try {
        setBalance(await getTokenBalanceAction())
      } catch {
        // non-fatal — stale balance ok
      }
    }
    function handleChanged(): void {
      void refresh()
    }
    window.addEventListener('token-balance-changed', handleChanged)
    return () => window.removeEventListener('token-balance-changed', handleChanged)
  }, [])

  return (
    <Link href="/tokens" aria-label="Manage tokens" className="transition-opacity hover:opacity-80">
      <TokenChip balance={balance} />
    </Link>
  )
}
