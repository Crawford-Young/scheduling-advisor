'use client'

import * as React from 'react'
import { useState } from 'react'
import { Button } from '@/lib/ui'

type CheckoutPayload =
  | { type: 'subscription'; tier: 'starter' | 'growth' | 'pro' }
  | { type: 'pack'; pack: 'small' | 'medium' | 'large' }

interface CheckoutButtonProps {
  readonly payload: CheckoutPayload
  readonly label: string
  readonly variant?: 'default' | 'outline'
}

export function CheckoutButton({
  payload,
  label,
  variant = 'default',
}: CheckoutButtonProps): React.JSX.Element {
  const [loading, setLoading] = useState(false)

  async function handleClick(): Promise<void> {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as { url?: string }
      if (data.url) window.location.href = data.url
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant={variant} onClick={handleClick} disabled={loading} className="w-full">
      {loading ? 'Redirecting…' : label}
    </Button>
  )
}

export function ManageSubscriptionButton(): React.JSX.Element {
  const [loading, setLoading] = useState(false)

  async function handleManage(): Promise<void> {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = (await res.json()) as { url?: string }
      if (data.url) window.location.href = data.url
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleManage} disabled={loading}>
      {loading ? 'Redirecting…' : 'Manage subscription'}
    </Button>
  )
}
