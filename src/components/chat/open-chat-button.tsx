'use client'
import * as React from 'react'
import { Button } from '@/lib/ui'

interface OpenChatButtonProps {
  readonly label: string
  readonly className?: string
}

export function OpenChatButton({ label, className }: OpenChatButtonProps): React.JSX.Element {
  function handleClick() {
    window.dispatchEvent(new CustomEvent('open-chat'))
  }

  return (
    <Button type="button" variant="default" onClick={handleClick} className={className}>
      {label}
    </Button>
  )
}
