import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { stripe } from '@/lib/stripe'
import { db } from '@/db'
import { users } from '@/db/schema'
import { env } from '@/env'

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

    if (userId) {
      await db
        .update(users)
        .set({
          plan: 'pro',
          ...(customerId ? { stripeCustomerId: customerId } : {}),
        })
        .where(eq(users.id, userId))
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription
    const customerId = subscription.customer as string

    await db.update(users).set({ plan: 'free' }).where(eq(users.stripeCustomerId, customerId))
  }

  return NextResponse.json({ received: true })
}
