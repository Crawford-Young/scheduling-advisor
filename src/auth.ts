import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { accounts, sessions, users, verificationTokens, tokenLedger } from '@/db/schema'
import { env } from '@/env'
import { BASE_SIGNIN_SCOPE } from '@/lib/google-calendar-scopes'
import { encryptAccountTokenFields, syncGoogleAccount } from '@/lib/google-account-sync'

const compedEmails = new Set(
  env.COMPED_EMAILS ? env.COMPED_EMAILS.split(',').map((e) => e.trim().toLowerCase()) : [],
)

const baseAdapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
})

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: {
    ...baseAdapter,
    linkAccount: (account) => baseAdapter.linkAccount!(encryptAccountTokenFields(account)),
  },
  providers: [
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          scope: BASE_SIGNIN_SCOPE,
        },
      },
    }),
  ],
  session: { strategy: 'database' },
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id
      const dbUser = await db.query.users.findFirst({ where: eq(users.id, user.id) })
      session.user.plan = dbUser?.plan ?? null
      return session
    },
    async signIn({ user }) {
      if (!user.email) return true
      if (compedEmails.has(user.email.toLowerCase())) {
        const [dbUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, user.email))
          .limit(1)

        if (dbUser) {
          await db.update(users).set({ plan: 'comped' }).where(eq(users.id, dbUser.id))

          // Grant 1500 credits only on first sign-in (skip if they already have any)
          const [balRow] = await db
            .select({ balance: sql<number>`COALESCE(SUM(${tokenLedger.amount}), 0)` })
            .from(tokenLedger)
            .where(eq(tokenLedger.userId, dbUser.id))

          if ((Number(balRow?.balance) || 0) === 0) {
            await db.insert(tokenLedger).values({
              userId: dbUser.id,
              type: 'monthly_grant',
              amount: 1500,
            })
          }
        }
      }
      return true
    },
  },
  events: {
    async signIn({ account }) {
      if (account?.provider === 'google') await syncGoogleAccount(account)
    },
  },
  pages: {
    signIn: '/login',
  },
})
