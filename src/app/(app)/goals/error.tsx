'use client'

export default function GoalsError({ reset }: { reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16">
      <p className="text-muted-foreground text-sm">Failed to load goals.</p>
      <button
        onClick={reset}
        className="bg-accent text-accent-foreground hover:bg-accent-hover rounded-md px-4 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </div>
  )
}
