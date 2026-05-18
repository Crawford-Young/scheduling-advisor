'use client'
import { useState } from 'react'
import { X } from 'lucide-react'

interface UpgradeBannersProps {
  readonly success: boolean
  readonly canceled: boolean
}

export function UpgradeBanners({ success, canceled }: UpgradeBannersProps) {
  const [canceledDismissed, setCanceledDismissed] = useState(false)

  return (
    <>
      {success && (
        <div className="w-full rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          You&apos;re now on Pro! Enjoy unlimited AI access.
        </div>
      )}
      {canceled && !canceledDismissed && (
        <div className="border-border bg-surface text-muted-foreground flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm">
          <span>Upgrade canceled. You can upgrade any time.</span>
          <button
            type="button"
            onClick={() => setCanceledDismissed(true)}
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground ml-3 shrink-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  )
}
