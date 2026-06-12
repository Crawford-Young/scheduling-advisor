'use client'
import { useState } from 'react'
import { X } from 'lucide-react'
import { Alert, AlertDescription, Button } from '@/lib/ui'

interface TokenBannersProps {
  readonly success: boolean
  readonly canceled: boolean
}

export function TokenBanners({ success, canceled }: TokenBannersProps): React.JSX.Element {
  const [canceledDismissed, setCanceledDismissed] = useState(false)

  return (
    <>
      {success && (
        <Alert variant="success">
          <AlertDescription>Tokens added to your account!</AlertDescription>
        </Alert>
      )}
      {canceled && !canceledDismissed && (
        <Alert variant="default" className="flex items-center justify-between">
          <AlertDescription>Checkout canceled. You can purchase tokens any time.</AlertDescription>
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
