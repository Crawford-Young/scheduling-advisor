import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { conversations, messages, userStats } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { AppShell, Sidebar, TopBar, XpBar } from '@crawfordyoung/ui'
import { ActiveSidebarItem } from '@/components/layout/active-sidebar-item'
import { ChatPanelWrapper } from '@/components/chat/chat-panel-wrapper'
import type { Message } from 'ai'
import { Home, Target, RefreshCw, MessageSquare, Calendar, Trophy, Settings } from 'lucide-react'

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

  let [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .limit(1)

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

  const stats = await db.query.userStats.findFirst({ where: eq(userStats.userId, userId) })
  const levelName = stats?.currentLevel ?? 'seedling'
  const currentXp = stats?.totalPoints ?? 0
  const maxXp = LEVEL_MAX_XP[levelName] ?? 500

  const sidebar = (
    <Sidebar
      footer={
        <div className="px-1 py-2">
          <XpBar levelName={levelName} currentXp={currentXp} maxXp={maxXp} />
        </div>
      }
    >
      {NAV_ITEMS.map((item) => (
        <ActiveSidebarItem key={item.href} icon={item.icon} label={item.label} href={item.href} />
      ))}
    </Sidebar>
  )

  const topbar = (
    <TopBar
      logo={<span className="text-accent text-sm font-bold">SA</span>}
      actions={
        session.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.user.image}
            alt={session.user.name ?? 'User avatar'}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="bg-accent-subtle text-accent flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold">
            {(session.user.name ?? 'U')[0]}
          </div>
        )
      }
    />
  )

  return (
    <AppShell sidebar={sidebar} topbar={topbar}>
      <div className="relative h-full">
        <div className="p-6">{children}</div>
        <ChatPanelWrapper
          conversationId={conversation.id}
          initialMessages={initialMessages}
          plan={session.user.plan}
        />
      </div>
    </AppShell>
  )
}
