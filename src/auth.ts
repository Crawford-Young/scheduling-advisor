import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { accounts, sessions, users, verificationTokens } from '@/db/schema'
import { env } from '@/env'

const compedEmails = new Set(
  env.COMPED_EMAILS ? env.COMPED_EMAILS.split(',').map((e) => e.trim().toLowerCase()) : [],
)

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  session: { strategy: 'database' },
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id
      const dbUser = await db.query.users.findFirst({ where: eq(users.id, user.id) })
      session.user.plan = dbUser?.plan ?? 'free'
      return session
    },
    async signIn({ user }) {
      if (!user.email) return true
      if (compedEmails.has(user.email.toLowerCase())) {
        await db.update(users).set({ plan: 'comped' }).where(eq(users.email, user.email))
      }
      return true
    },
  },
  pages: {
    signIn: '/login',
  },
})
