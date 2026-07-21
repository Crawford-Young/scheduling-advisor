'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SidebarItem } from '@/lib/ui'
import { LinkPendingReporter } from '@/components/layout/nav-progress'

interface ActiveSidebarItemProps {
  readonly icon: React.ReactNode
  readonly label: string
  readonly href: string
}

export function ActiveSidebarItem({ icon, label, href }: ActiveSidebarItemProps) {
  const pathname = usePathname()
  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
  return (
    <SidebarItem asChild icon={icon} label={label} href={href} isActive={isActive}>
      <Link href={href}>
        <LinkPendingReporter />
      </Link>
    </SidebarItem>
  )
}
