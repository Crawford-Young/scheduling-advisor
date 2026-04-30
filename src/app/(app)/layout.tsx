import { auth } from '@/auth'
import { TamboProvider } from '@/components/providers/tambo-provider'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return <TamboProvider userKey={session?.user?.id ?? undefined}>{children}</TamboProvider>
}
