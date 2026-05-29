import * as React from 'react'
import { auth } from '@/auth'
import { db } from '@/db'
import { checkIns } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { SplashAnimationClient } from '@/components/splash/splash-animation-client'

export async function SplashWrapper(): Promise<React.JSX.Element> {
  const session = await auth()

  let checkInDone = true
  if (session?.user?.id) {
    const [pending] = await db
      .select()
      .from(checkIns)
      .where(and(eq(checkIns.userId, session.user.id), isNull(checkIns.completedAt)))
      .limit(1)
    checkInDone = !pending
  }

  return <SplashAnimationClient checkInDone={checkInDone} />
}
