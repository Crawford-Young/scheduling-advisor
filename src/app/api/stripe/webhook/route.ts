import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { stripe } from '@/lib/stripe'
import { db } from '@/db'
import { users, tokenLedger } from '@/db/schema'
import { env } from '@/env'

const TIER_CREDITS: Record<string, number> = {
  starter: 200,
  growth: 600,
  pro: 1500,
  comped: 1500,
}

async function creditTokens(
  userId: string,
  amount: number,
  type: 'monthly_grant' | 'purchase',
): Promise<void> {
  await db.insert(tokenLedger).values({ userId, type, amount })
}

async function getUserByCustomerId(
  customerId: string,
): Promise<{ id: string; plan: string | null } | undefined> {
  const [user] = await db
    .select({ id: users.id, plan: users.plan })
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1)
  return user
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.client_reference_id
    const customerId = session.customer as string | null
    const { metadata } = session

    if (!userId) return NextResponse.json({ received: true })

    if (session.mode === 'subscription' && metadata?.tier) {
      const tier = metadata.tier as 'starter' | 'growth' | 'pro'
      const credits = TIER_CREDITS[tier] ?? 0
      const subscriptionId = session.subscription as string | null
      let resetAt: Date | null = null

      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId)
        const periodEnd = sub.items.data[0]?.current_period_end
        resetAt = periodEnd != null ? new Date(periodEnd * 1000) : null
      }

      await db
        .update(users)
        .set({
          plan: tier,
          ...(customerId ? { stripeCustomerId: customerId } : {}),
          ...(resetAt ? { tokenResetAt: resetAt } : {}),
        })
        .where(eq(users.id, userId))

      await creditTokens(userId, credits, 'monthly_grant')
    }

    if (session.mode === 'payment' && metadata?.credits) {
      const credits = parseInt(metadata.credits, 10)
      if (credits > 0) {
        await creditTokens(userId, credits, 'purchase')
      }
    }
  }

  if (event.type === 'invoice.paid') {
    const invoice = event.data.object as Stripe.Invoice
    const customerId = invoice.customer as string
    const user = await getUserByCustomerId(customerId)
    if (!user?.plan) return NextResponse.json({ received: true })

    const credits = TIER_CREDITS[user.plan] ?? 0
    if (credits > 0) {
      await creditTokens(user.id, credits, 'monthly_grant')

      const subscriptionId = (invoice as { subscription?: string }).subscription
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId)
        const periodEnd = sub.items.data[0]?.current_period_end
        if (periodEnd != null) {
          const resetAt = new Date(periodEnd * 1000)
          await db.update(users).set({ tokenResetAt: resetAt }).where(eq(users.id, user.id))
        }
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription
    const customerId = subscription.customer as string
    await db.update(users).set({ plan: null }).where(eq(users.stripeCustomerId, customerId))
  }

  if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription
    const customerId = subscription.customer as string
    const priceId = subscription.items.data[0]?.price.id

    const tierByPrice: Record<string, 'starter' | 'growth' | 'pro'> = {
      [env.STRIPE_PRICE_ID_STARTER]: 'starter',
      [env.STRIPE_PRICE_ID_GROWTH]: 'growth',
      [env.STRIPE_PRICE_ID_PRO]: 'pro',
    }
    const newTier = priceId ? tierByPrice[priceId] : undefined

    if (subscription.status === 'active' && newTier) {
      await db.update(users).set({ plan: newTier }).where(eq(users.stripeCustomerId, customerId))
    } else if (['canceled', 'past_due', 'paused'].includes(subscription.status)) {
      await db.update(users).set({ plan: null }).where(eq(users.stripeCustomerId, customerId))
    }
  }

  return NextResponse.json({ received: true })
}
