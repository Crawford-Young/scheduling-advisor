import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { stripe } from '@/lib/stripe'
import { env } from '@/env'
import { z } from 'zod'

const TIER_CREDITS: Record<string, number> = {
  starter: 200,
  growth: 600,
  pro: 1500,
}

const TIER_PRICE_MAP: Record<string, string> = {
  starter: env.STRIPE_PRICE_ID_STARTER,
  growth: env.STRIPE_PRICE_ID_GROWTH,
  pro: env.STRIPE_PRICE_ID_PRO,
}

const PACK_CREDITS: Record<string, number> = {
  small: 100,
  medium: 300,
  large: 750,
}

const PACK_PRICE_MAP: Record<string, string> = {
  small: env.STRIPE_PACK_PRICE_ID_SMALL,
  medium: env.STRIPE_PACK_PRICE_ID_MEDIUM,
  large: env.STRIPE_PACK_PRICE_ID_LARGE,
}

const checkoutSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscription'), tier: z.enum(['starter', 'growth', 'pro']) }),
  z.object({ type: z.literal('pack'), pack: z.enum(['small', 'medium', 'large']) }),
])

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = checkoutSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { data } = parsed
  const baseParams = {
    payment_method_types: ['card' as const],
    success_url: `${env.NEXT_PUBLIC_APP_URL}/tokens?success=1`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/tokens?canceled=1`,
    client_reference_id: session.user.id,
    customer_email: session.user.email ?? undefined,
  }

  if (data.type === 'subscription') {
    const checkoutSession = await stripe.checkout.sessions.create({
      ...baseParams,
      mode: 'subscription',
      line_items: [{ price: TIER_PRICE_MAP[data.tier], quantity: 1 }],
      metadata: { tier: data.tier, credits: String(TIER_CREDITS[data.tier]) },
    })
    return NextResponse.json({ url: checkoutSession.url })
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    ...baseParams,
    mode: 'payment',
    line_items: [{ price: PACK_PRICE_MAP[data.pack], quantity: 1 }],
    metadata: { pack: data.pack, credits: String(PACK_CREDITS[data.pack]) },
  })
  return NextResponse.json({ url: checkoutSession.url })
}
