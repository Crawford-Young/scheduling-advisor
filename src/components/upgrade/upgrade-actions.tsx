'use client'
import * as React from 'react'
import { useState } from 'react'
import { Zap, Settings } from 'lucide-react'

export function UpgradeButton(): React.JSX.Element {
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
    <button
      type="button"
      onClick={handleUpgrade}
      disabled={loading}
      className="mt-auto flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-all hover:bg-amber-400 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none active:scale-[0.98] disabled:opacity-60"
    >
      <Zap className="h-4 w-4" aria-hidden="true" />
      {loading ? 'Redirecting…' : 'Upgrade to Pro'}
    </button>
  )
}

export function ManageSubscriptionButton(): React.JSX.Element {
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
    <button
      type="button"
      onClick={handleManage}
      disabled={loading}
      className="flex items-center gap-2 rounded-lg border border-amber-500/40 px-5 py-2.5 text-sm font-semibold text-amber-400 transition-all hover:bg-amber-500/10 disabled:opacity-60"
    >
      <Settings className="h-4 w-4" aria-hidden="true" />
      {loading ? 'Redirecting…' : 'Manage subscription'}
    </button>
  )
}
