import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import {
  PageHeader,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  TokenChip,
  Badge,
  Separator,
} from '@/lib/ui'
import { getTokenBalance } from '@/server/queries/tokens'
import { getTokenLedger } from '@/server/queries/token-ledger'
import { CheckoutButton, ManageSubscriptionButton } from './purchase-buttons'
import { TokenBanners } from './token-banners'

const TIERS = [
  { tier: 'starter', name: 'Starter', price: '$5/mo', credits: 200 },
  { tier: 'growth', name: 'Growth', price: '$12/mo', credits: 600 },
  { tier: 'pro', name: 'Pro', price: '$25/mo', credits: 1500 },
] as const

const PACKS = [
  { pack: 'small', name: 'Small pack', price: '$3', credits: 100 },
  { pack: 'medium', name: 'Medium pack', price: '$8', credits: 300 },
  { pack: 'large', name: 'Large pack', price: '$18', credits: 750 },
] as const

const LEDGER_TYPE_LABELS: Record<'monthly_grant' | 'purchase' | 'usage', string> = {
  monthly_grant: 'Monthly grant',
  purchase: 'Purchase',
  usage: 'AI usage',
}

interface TokensPageProps {
  readonly searchParams: Promise<{ success?: string; canceled?: string }>
}

export default async function TokensPage({ searchParams }: TokensPageProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const { success, canceled } = await searchParams

  const [balance, ledger, user] = await Promise.all([
    getTokenBalance(session.user.id),
    getTokenLedger(session.user.id),
    db.query.users.findFirst({ where: eq(users.id, session.user.id) }),
  ])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Tokens" />
      <TokenBanners success={success === '1'} canceled={canceled === '1'} />

      {/* Balance hero */}
      <Card>
        <CardHeader>
          <CardTitle>Your balance</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <TokenChip balance={balance} className="text-3xl" />
          {user?.tokenResetAt && user?.plan && (
            <p className="text-muted-foreground text-sm">
              Monthly tokens reset on{' '}
              {new Date(user.tokenResetAt).toLocaleDateString(undefined, {
                month: 'long',
                day: 'numeric',
              })}
            </p>
          )}
          <p className="text-muted-foreground text-sm">
            Tokens power AI features — Cy chat and AI reflections. The app is free to use.
          </p>
        </CardContent>
      </Card>

      {/* Subscription tiers */}
      <section aria-labelledby="tiers-heading">
        <h2 id="tiers-heading" className="text-foreground mb-4 text-lg font-semibold">
          Monthly subscriptions
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {TIERS.map(({ tier, name, price, credits }) => {
            const isCurrent = user?.plan === tier
            return (
              <Card key={tier} className={isCurrent ? 'ring-primary ring-2' : undefined}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{name}</CardTitle>
                    {isCurrent && (
                      <Badge variant="default" className="text-xs">
                        Current
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">{price}</p>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-sm font-medium">{credits} tokens / month</p>
                  <CheckoutButton
                    payload={{ type: 'subscription', tier }}
                    label={isCurrent ? `Renew ${name}` : `Get ${name}`}
                    variant={isCurrent ? 'outline' : 'default'}
                  />
                </CardContent>
              </Card>
            )
          })}
        </div>
        {user?.plan && user.plan !== 'comped' && (
          <div className="mt-4">
            <ManageSubscriptionButton />
          </div>
        )}
      </section>

      <Separator />

      {/* Token packs */}
      <section aria-labelledby="packs-heading">
        <h2 id="packs-heading" className="text-foreground mb-4 text-lg font-semibold">
          One-time token packs
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PACKS.map(({ pack, name, price, credits }) => (
            <Card key={pack}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{name}</CardTitle>
                <p className="text-muted-foreground text-sm">{price}</p>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm font-medium">{credits} tokens</p>
                <CheckoutButton payload={{ type: 'pack', pack }} label={`Buy ${name}`} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator />

      {/* Ledger */}
      <section aria-labelledby="ledger-heading">
        <h2 id="ledger-heading" className="text-foreground mb-4 text-lg font-semibold">
          Token history
        </h2>
        {ledger.length === 0 ? (
          <p className="text-muted-foreground text-sm">No token transactions yet.</p>
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-border border-b">
                    <th className="text-muted-foreground px-4 py-3 text-left font-medium">Type</th>
                    <th className="text-muted-foreground px-4 py-3 text-right font-medium">
                      Amount
                    </th>
                    <th className="text-muted-foreground px-4 py-3 text-right font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((entry) => (
                    <tr key={entry.id} className="border-border border-b last:border-0">
                      <td className="px-4 py-3">{LEDGER_TYPE_LABELS[entry.type]}</td>
                      <td
                        className={`px-4 py-3 text-right font-mono ${
                          entry.amount >= 0 ? 'text-green-500' : 'text-red-400'
                        }`}
                      >
                        {entry.amount >= 0 ? `+${entry.amount}` : entry.amount}
                      </td>
                      <td className="text-muted-foreground px-4 py-3 text-right">
                        {new Date(entry.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
