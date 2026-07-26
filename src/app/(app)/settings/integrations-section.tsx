'use client'
import * as React from 'react'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/lib/ui'
import { connectGoogleCalendar, disconnectGoogleCalendar } from '@/server/actions/google-calendar'
import type { CalendarConnectionStatus } from '@/server/queries/google-calendar-connection'

interface IntegrationsSectionProps {
  readonly status: CalendarConnectionStatus
}

export function IntegrationsSection({ status }: IntegrationsSectionProps): React.JSX.Element {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const connected = status === 'connected'

  function handleConnect(): void {
    startTransition(async () => {
      await connectGoogleCalendar('/settings')
    })
  }

  function handleDisconnect(): void {
    startTransition(async () => {
      await disconnectGoogleCalendar()
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="font-medium">Google Calendar</p>
            <p className="text-muted-foreground text-sm">
              Cy uses your Google Calendar to check availability and add accepted events.
            </p>
            <p className="text-muted-foreground text-sm">
              {connected ? 'Connected' : 'Not connected'}
            </p>
          </div>
          {connected ? (
            <Button variant="outline" onClick={handleDisconnect} disabled={isPending}>
              Disconnect
            </Button>
          ) : (
            <Button onClick={handleConnect} disabled={isPending}>
              Connect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
