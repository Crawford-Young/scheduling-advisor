'use client'
import * as React from 'react'

interface TasksErrorProps {
  readonly reset: () => void
}

export default function TasksError({ reset }: TasksErrorProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-4 py-16">
      <p className="text-muted-foreground text-sm">Failed to load tasks.</p>
      <button
        onClick={reset}
        className="bg-accent text-accent-foreground hover:bg-accent-hover rounded-md px-4 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </div>
  )
}
