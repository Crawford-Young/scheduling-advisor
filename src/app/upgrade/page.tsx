import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { Sparkles, Check, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { UpgradeBanners } from '@/components/upgrade/upgrade-banners'
import { UpgradeButton, ManageSubscriptionButton } from '@/components/upgrade/upgrade-actions'

const FREE_FEATURES = [
  'Goal, habit & task tracking',
  'Daily check-ins & reflections',
  'Calendar view',
  'Activity feed & friends',
  'Per-habit streak tracking',
]

const PRO_FEATURES = [
  'Everything in Free',
  'AI scheduling assistant',
  'Smart rescheduling suggestions',
  'Priority conflict resolution',
  'Unlimited conversation history',
]

interface UpgradePageProps {
  readonly searchParams: Promise<{ success?: string; canceled?: string }>
}

export default async function UpgradePage({ searchParams }: UpgradePageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { success, canceled } = await searchParams
  const isPro = session.user.plan === 'pro' || session.user.plan === 'comped'

  return (
    <main className="bg-background flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-3xl flex-col items-center gap-12">
        <div className="w-full">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to app
          </Link>
        </div>

        <UpgradeBanners success={success === '1'} canceled={canceled === '1'} />

        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/30">
            <Sparkles className="h-6 w-6 text-amber-400" aria-hidden="true" />
          </div>
          {isPro ? (
            <>
              <h1 className="text-foreground text-3xl font-bold tracking-tight">
                You&apos;re on Pro
              </h1>
              <p className="text-muted-foreground max-w-md text-sm">
                You have full access to the AI scheduling assistant and all Pro features.
              </p>
              <ManageSubscriptionButton />
            </>
          ) : (
            <>
              <h1 className="text-foreground text-3xl font-bold tracking-tight">
                Unlock the AI assistant
              </h1>
              <p className="text-muted-foreground max-w-md text-sm">
                Get personalized scheduling advice, smart conflict resolution, and an AI that
                actually understands your priorities.
              </p>
            </>
          )}
        </div>

        {!isPro && (
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
                <p className="text-xs font-semibold tracking-widest text-amber-400 uppercase">
                  Pro
                </p>
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
              <UpgradeButton />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
