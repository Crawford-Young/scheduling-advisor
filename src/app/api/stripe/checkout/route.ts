import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { stripe } from '@/lib/stripe'
import { env } from '@/env'

export async function POST(): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${env.NEXT_PUBLIC_APP_URL}/upgrade?success=1`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/upgrade?canceled=1`,
    client_reference_id: session.user.id,
    customer_email: session.user.email ?? undefined,
  })

  return NextResponse.json({ url: checkoutSession.url })
}
