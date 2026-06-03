import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AppShell, Avatar, AvatarFallback, AvatarImage, Sidebar } from '@/lib/ui'
import { ActiveSidebarItem } from '@/components/layout/active-sidebar-item'
import { ChatFab } from '@/components/chat/chat-fab'
import {
  Calendar,
  CheckSquare,
  MessageSquare,
  RefreshCw,
  Rss,
  Settings,
  Target,
} from 'lucide-react'
import React from 'react'

const NAV_ITEMS = [
  { label: 'Calendar', href: '/calendar', icon: <Calendar className="h-4 w-4" /> },
  { label: 'Goals', href: '/goals', icon: <Target className="h-4 w-4" /> },
  { label: 'Habits', href: '/habits', icon: <RefreshCw className="h-4 w-4" /> },
  { label: 'Tasks', href: '/tasks', icon: <CheckSquare className="h-4 w-4" /> },
  { label: 'Reflections', href: '/reflections', icon: <MessageSquare className="h-4 w-4" /> },
  { label: 'Feed', href: '/feed', icon: <Rss className="h-4 w-4" /> },
  { label: 'Settings', href: '/settings', icon: <Settings className="h-4 w-4" /> },
] as const

interface AppLayoutProps {
  readonly children: React.ReactNode
}

export default async function AppLayout({ children }: AppLayoutProps): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const sidebarHeader = (
    <div className="border-border flex h-14 shrink-0 items-center gap-2.5 border-b px-4">
      <div className="bg-accent flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
        <span className="text-accent-foreground text-[10px] font-bold">CB</span>
      </div>
      <span className="text-foreground text-sm font-bold">Cybond</span>
    </div>
  )

  const sidebarFooter = (
    <div className="flex items-center gap-2.5">
      <Avatar size="sm">
        <AvatarImage src={session.user.image ?? undefined} alt={session.user.name ?? 'User'} />
        <AvatarFallback>{(session.user.name ?? 'U')[0]}</AvatarFallback>
      </Avatar>
      <p className="text-foreground truncate text-xs font-medium">{session.user.name ?? 'User'}</p>
    </div>
  )

  return (
    <>
      <AppShell
        sidebar={
          <Sidebar header={sidebarHeader} footer={sidebarFooter}>
            {NAV_ITEMS.map((item) => (
              <ActiveSidebarItem
                key={item.href}
                icon={item.icon}
                label={item.label}
                href={item.href}
              />
            ))}
          </Sidebar>
        }
        topbar={null}
      >
        <div className="p-6">{children}</div>
      </AppShell>
      <ChatFab />
    </>
  )
}
