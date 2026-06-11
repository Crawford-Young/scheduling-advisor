import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { ratelimit } from '@/lib/redis'
import { subscribeToPush, unsubscribeFromPush } from '@/server/actions/push-subscriptions'

const subscribeBody = z.object({
  action: z.literal('subscribe'),
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
})

const unsubscribeBody = z.object({
  action: z.literal('unsubscribe'),
  endpoint: z.string().url(),
})

const bodySchema = z.discriminatedUnion('action', [subscribeBody, unsubscribeBody])

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body: unknown = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  if (parsed.data.action === 'subscribe') {
    const result = await subscribeToPush({
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
    })
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 })
    return NextResponse.json({ data: result.data })
  }

  if (parsed.data.action === 'unsubscribe') {
    await unsubscribeFromPush(parsed.data.endpoint)
    return NextResponse.json({ data: { success: true } })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
