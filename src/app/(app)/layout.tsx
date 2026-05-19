import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { conversations, messages, userStats } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { AppShell, Avatar, AvatarFallback, AvatarImage, Sidebar, XpBar } from '@/lib/ui'
import { ActiveSidebarItem } from '@/components/layout/active-sidebar-item'
import { ChatPanelWrapper } from '@/components/chat/chat-panel-wrapper'
import type { Message } from 'ai'
import {
  Calendar,
  CheckSquare,
  Home,
  MessageSquare,
  RefreshCw,
  Settings,
  Target,
  Trophy,
} from 'lucide-react'

const LEVEL_MAX_XP: Record<string, number> = {
  seedling: 500,
  growing: 2000,
  thriving: 5000,
  flourishing: 10000,
  evergreen: 10000,
}

const NAV_ITEMS = [
  { label: 'Home', href: '/', icon: <Home className="h-4 w-4" /> },
  { label: 'Goals', href: '/goals', icon: <Target className="h-4 w-4" /> },
  { label: 'Habits', href: '/habits', icon: <RefreshCw className="h-4 w-4" /> },
  { label: 'Tasks', href: '/tasks', icon: <CheckSquare className="h-4 w-4" /> },
  { label: 'Reflections', href: '/reflections', icon: <MessageSquare className="h-4 w-4" /> },
  { label: 'Calendar', href: '/calendar', icon: <Calendar className="h-4 w-4" /> },
  { label: 'Leaderboard', href: '/leaderboard', icon: <Trophy className="h-4 w-4" /> },
  { label: 'Settings', href: '/settings', icon: <Settings className="h-4 w-4" /> },
] as const

interface AppLayoutProps {
  readonly children: React.ReactNode
}

export default async function AppLayout({ children }: AppLayoutProps) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const [existingConversations, stats] = await Promise.all([
    db.select().from(conversations).where(eq(conversations.userId, userId)).limit(1),
    db.query.userStats.findFirst({ where: eq(userStats.userId, userId) }),
  ])

  let [conversation] = existingConversations
  if (!conversation) {
    const [created] = await db.insert(conversations).values({ userId }).returning()
    conversation = created
  }
  if (!conversation) redirect('/login')

  const dbMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(desc(messages.createdAt))
    .limit(50)

  const initialMessages: Message[] = dbMessages.reverse().map((m) => {
    const content = m.content
    const text = typeof content === 'string' ? content : ''
    return { id: m.id, role: m.role as 'user' | 'assistant', content: text }
  })

  const levelName = stats?.currentLevel ?? 'seedling'
  const currentXp = stats?.totalPoints ?? 0
  const maxXp = LEVEL_MAX_XP[levelName] ?? 500

  const sidebarHeader = (
    <div className="border-border flex h-14 shrink-0 items-center gap-2.5 border-b px-4">
      <div className="bg-accent flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
        <span className="text-accent-foreground text-[10px] font-bold">SA</span>
      </div>
      <span className="text-foreground text-sm font-bold">Scheduling Advisor</span>
    </div>
  )

  const sidebarFooter = (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <Avatar size="sm">
          <AvatarImage src={session.user.image ?? undefined} alt={session.user.name ?? 'User'} />
          <AvatarFallback>{(session.user.name ?? 'U')[0]}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-xs font-medium">
            {session.user.name ?? 'User'}
          </p>
          <p className="text-muted-foreground truncate text-xs capitalize">{levelName}</p>
        </div>
      </div>
      <XpBar levelName={levelName} currentXp={currentXp} maxXp={maxXp} />
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
      <ChatPanelWrapper
        conversationId={conversation.id}
        initialMessages={initialMessages}
        plan={session.user.plan}
      />
    </>
  )
}
