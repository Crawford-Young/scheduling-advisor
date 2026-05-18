'use client'

import { use, useState } from 'react'
import { Check, Sparkles, X, Zap } from 'lucide-react'

const FREE_FEATURES = [
  'AI-generated daily schedule',
  'Goal & habit tracking',
  'Leaderboard participation',
  'Calendar sync',
]

const PRO_FEATURES = [
  'Everything in Free',
  'AI scheduling assistant',
  'Smart rescheduling suggestions',
  'Priority conflict resolution',
  'Unlimited conversation history',
]

export default function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>
}) {
  const { success, canceled } = use(searchParams)
  const [loading, setLoading] = useState(false)
  const [canceledDismissed, setCanceledDismissed] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const data = (await res.json()) as { url?: string; error?: string }
      if (data.url) window.location.href = data.url
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="bg-background flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-3xl flex-col items-center gap-12">
        {success === '1' && (
          <div className="w-full rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
            You&apos;re now on Pro! Enjoy unlimited AI access.
          </div>
        )}

        {canceled === '1' && !canceledDismissed && (
          <div className="border-border bg-surface text-muted-foreground flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm">
            <span>Upgrade canceled. You can upgrade any time.</span>
            <button
              onClick={() => setCanceledDismissed(true)}
              aria-label="Dismiss"
              className="text-muted-foreground hover:text-foreground ml-3 shrink-0"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/30">
            <Sparkles className="h-6 w-6 text-amber-400" aria-hidden="true" />
          </div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Unlock the AI assistant
          </h1>
          <p className="text-muted-foreground max-w-md text-sm">
            Get personalized scheduling advice, smart conflict resolution, and an AI that actually
            understands your priorities.
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Free tier */}
          <div className="bg-surface border-border flex flex-col gap-6 rounded-xl border p-6">
            <div className="flex flex-col gap-1">
              <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
                Free
              </p>
              <p className="text-foreground text-3xl font-bold">$0</p>
              <p className="text-muted-foreground text-sm">No credit card required</p>
            </div>
            <ul className="flex flex-col gap-3">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="text-foreground flex items-center gap-2.5 text-sm">
                  <Check className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="border-border text-muted-foreground mt-auto rounded-lg border py-2.5 text-center text-sm font-medium">
              Current plan
            </div>
          </div>

          {/* Pro tier */}
          <div className="bg-surface flex flex-col gap-6 rounded-xl border border-amber-500/40 p-6 shadow-lg shadow-amber-500/5">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold tracking-widest text-amber-400 uppercase">Pro</p>
              <div className="flex items-end gap-1">
                <p className="text-foreground text-3xl font-bold">$9</p>
                <p className="text-muted-foreground mb-1 text-sm">/ month</p>
              </div>
              <p className="text-muted-foreground text-sm">Cancel anytime</p>
            </div>
            <ul className="flex flex-col gap-3">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="text-foreground flex items-center gap-2.5 text-sm">
                  <Check className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="mt-auto flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-all hover:bg-amber-400 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none active:scale-[0.98] disabled:opacity-60"
            >
              <Zap className="h-4 w-4" aria-hidden="true" />
              {loading ? 'Redirecting…' : 'Upgrade to Pro'}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
