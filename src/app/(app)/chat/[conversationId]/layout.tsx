import React from 'react'

interface ChatLayoutProps {
  readonly children: React.ReactNode
}

export default function ChatLayout({ children }: ChatLayoutProps): React.JSX.Element {
  return <div className="flex h-full flex-col">{children}</div>
}
