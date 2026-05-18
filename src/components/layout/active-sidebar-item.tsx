'use client'
import { usePathname } from 'next/navigation'
import { SidebarItem } from '@crawfordyoung/ui'

interface ActiveSidebarItemProps {
  readonly icon: React.ReactNode
  readonly label: string
  readonly href: string
}

export function ActiveSidebarItem({ icon, label, href }: ActiveSidebarItemProps) {
  const pathname = usePathname()
  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
  return <SidebarItem icon={icon} label={label} href={href} isActive={isActive} />
}
