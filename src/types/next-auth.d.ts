import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      plan: 'starter' | 'growth' | 'pro' | 'comped' | null
    } & DefaultSession['user']
  }
}
