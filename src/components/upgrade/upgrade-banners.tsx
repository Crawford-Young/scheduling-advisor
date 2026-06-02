'use client'
import { useState } from 'react'
import { X } from 'lucide-react'
import { Alert, AlertDescription, Button } from '@/lib/ui'

interface UpgradeBannersProps {
  readonly success: boolean
  readonly canceled: boolean
}

export function UpgradeBanners({ success, canceled }: UpgradeBannersProps) {
  const [canceledDismissed, setCanceledDismissed] = useState(false)

  return (
    <>
      {success && (
        <Alert variant="success">
          <AlertDescription>You&apos;re now on Pro! Enjoy unlimited AI access.</AlertDescription>
        </Alert>
      )}
      {canceled && !canceledDismissed && (
        <Alert variant="default" className="flex items-center justify-between">
          <AlertDescription>Upgrade canceled. You can upgrade any time.</AlertDescription>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCanceledDismissed(true)}
            aria-label="Dismiss"
            className="ml-3 shrink-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Alert>
      )}
    </>
  )
}
