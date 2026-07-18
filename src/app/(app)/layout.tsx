import { auth, signOut } from '@/auth'
import { redirect } from 'next/navigation'
import { AppShell, Avatar, AvatarFallback, AvatarImage, Sidebar, Toaster } from '@/lib/ui'
import { ActiveSidebarItem } from '@/components/layout/active-sidebar-item'
import { BrandMark } from '@/components/layout/brand-mark'
import { TokenChipLive } from '@/components/layout/token-chip-live'
import { QuickScheduleInput } from '@/components/chat/quick-schedule-input'
import { ChatPopup } from '@/components/chat/chat-popup'
import { getTokenBalance } from '@/server/queries/tokens'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import {
  Calendar,
  Coins,
  ListChecks,
  LogOut,
  MessageSquare,
  Rss,
  Settings,
  User,
} from 'lucide-react'
import Image from 'next/image'
import React from 'react'

const NAV_ITEMS_BEFORE_PROFILE = [
  { label: 'Calendar', href: '/calendar', icon: <Calendar className="h-4 w-4" /> },
  { label: 'Activities', href: '/activities', icon: <ListChecks className="h-4 w-4" /> },
  { label: 'Reflections', href: '/reflections', icon: <MessageSquare className="h-4 w-4" /> },
  { label: 'Feed', href: '/feed', icon: <Rss className="h-4 w-4" /> },
] as const

const NAV_ITEMS_AFTER_PROFILE = [
  { label: 'Tokens', href: '/tokens', icon: <Coins className="h-4 w-4" /> },
  { label: 'Settings', href: '/settings', icon: <Settings className="h-4 w-4" /> },
] as const

interface AppLayoutProps {
  readonly children: React.ReactNode
}

export default async function AppLayout({ children }: AppLayoutProps): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const tokenBalance = await getTokenBalance(session.user.id)
  const profileUser = await db.query.users.findFirst({
    columns: { username: true },
    where: eq(users.id, session.user.id),
  })

  const sidebarHeader = (
    <div className="border-border flex h-14 shrink-0 items-center gap-2.5 border-b px-4">
      <Image
        src="/cybond.png"
        alt="Cybond"
        width={28}
        height={28}
        className="shrink-0 rounded-lg"
      />
      <BrandMark />
    </div>
  )

  const sidebarCollapsedHeader = (
    <div className="border-border flex h-14 shrink-0 items-center justify-center border-b">
      <Image
        src="/cybond.png"
        alt="Cybond"
        width={28}
        height={28}
        className="shrink-0 rounded-lg"
      />
    </div>
  )

  const sidebarFooter = (
    <div className="flex w-full items-center gap-2.5">
      <Avatar size="sm">
        <AvatarImage src={session.user.image ?? undefined} alt={session.user.name ?? 'User'} />
        <AvatarFallback>{(session.user.name ?? 'U')[0]}</AvatarFallback>
      </Avatar>
      <p className="text-foreground flex-1 truncate text-xs font-medium">
        {session.user.name ?? 'User'}
      </p>
      <form
        action={async () => {
          'use server'
          await signOut({ redirectTo: '/login' })
        }}
      >
        <button
          type="submit"
          aria-label="Sign out"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  )

  return (
    <>
      <AppShell
        sidebar={
          <Sidebar
            header={sidebarHeader}
            collapsedHeader={sidebarCollapsedHeader}
            footer={sidebarFooter}
          >
            {NAV_ITEMS_BEFORE_PROFILE.map((item) => (
              <ActiveSidebarItem
                key={item.href}
                icon={item.icon}
                label={item.label}
                href={item.href}
              />
            ))}
            {profileUser?.username && (
              <ActiveSidebarItem
                key="profile"
                icon={<User className="h-4 w-4" />}
                label="Profile"
                href={`/u/${profileUser.username}`}
              />
            )}
            {NAV_ITEMS_AFTER_PROFILE.map((item) => (
              <ActiveSidebarItem
                key={item.href}
                icon={item.icon}
                label={item.label}
                href={item.href}
              />
            ))}
          </Sidebar>
        }
        topbar={
          <div className="border-border flex h-12 items-center justify-end gap-4 border-b px-4">
            <QuickScheduleInput />
            <TokenChipLive initialBalance={tokenBalance} />
          </div>
        }
      >
        <div className="h-full p-6">{children}</div>
      </AppShell>
      <ChatPopup />
      <Toaster />
    </>
  )
}
