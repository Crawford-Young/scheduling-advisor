'use client'
import { useState } from 'react'
import { Zap, Settings } from 'lucide-react'
import { Button } from '@/lib/ui'

export function UpgradeButton() {
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const data = (await res.json()) as { url?: string }
      if (data.url) window.location.href = data.url
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handleUpgrade}
      disabled={loading}
      className="mt-auto w-full bg-amber-500 text-zinc-950 hover:bg-amber-400 active:scale-[0.98]"
    >
      <Zap className="h-4 w-4" aria-hidden="true" />
      {loading ? 'Redirecting…' : 'Upgrade to Pro'}
    </Button>
  )
}

export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false)

  async function handleManage() {
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
    <Button
      variant="outline"
      onClick={handleManage}
      disabled={loading}
      className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
    >
      <Settings className="h-4 w-4" aria-hidden="true" />
      {loading ? 'Redirecting…' : 'Manage subscription'}
    </Button>
  )
}
