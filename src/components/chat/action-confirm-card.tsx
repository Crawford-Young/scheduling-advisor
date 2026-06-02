'use client'
import * as React from 'react'
import { Check, X } from 'lucide-react'
import { Badge, Button, Card, CardContent, Input } from '@/lib/ui'

export interface ActionConfirmCardProps {
  readonly action: string
  readonly entityType: 'habit' | 'goal' | 'event'
  readonly date?: string
  readonly time?: string
  readonly detail?: string
  readonly onConfirm: () => void
  readonly onDeny: (reason: string) => void
}

type CardState = 'pending' | 'denying' | 'confirmed' | 'denied'

const entityBadgeClass: Record<ActionConfirmCardProps['entityType'], string> = {
  habit: 'border-blue-500/30 bg-blue-500/10 text-blue-500',
  goal: 'border-purple-500/30 bg-purple-500/10 text-purple-500',
  event: 'border-green-500/30 bg-green-500/10 text-green-500',
}

export function ActionConfirmCard({
  action,
  entityType,
  date,
  time,
  detail,
  onConfirm,
  onDeny,
}: ActionConfirmCardProps): React.JSX.Element {
  const [state, setState] = React.useState<CardState>('pending')
  const [reason, setReason] = React.useState('')

  function handleConfirm(): void {
    setState('confirmed')
    onConfirm()
  }

  function handleDenyClick(): void {
    setState('denying')
  }

  function handleCancel(): void {
    setState('pending')
    setReason('')
  }

  function handleSend(): void {
    setState('denied')
    onDeny(reason)
  }

  const dateTime = [date, time].filter(Boolean).join(' · ')

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-card-foreground truncate text-sm font-medium">{action}</p>
            {dateTime && (
              <p className="text-muted-foreground mt-0.5 text-xs">
                {dateTime}
                <Badge
                  variant="outline"
                  className={`ml-2 text-[10px] tracking-wide uppercase ${entityBadgeClass[entityType]}`}
                >
                  {entityType}
                </Badge>
              </p>
            )}
            {detail && <p className="text-muted-foreground mt-1 text-xs">{detail}</p>}
          </div>

          {state === 'pending' || state === 'denying' ? (
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Confirm"
                onClick={handleConfirm}
                className="h-8 w-8 rounded-full bg-green-500/10 text-green-500 hover:bg-green-500/20"
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Deny"
                onClick={handleDenyClick}
                className="h-8 w-8 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : state === 'confirmed' ? (
            <Badge
              variant="outline"
              className="shrink-0 rounded-full border-green-500/30 bg-green-500/10 text-green-500"
            >
              Confirmed
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="shrink-0 rounded-full border-red-500/30 bg-red-500/10 text-red-500"
            >
              Declined
            </Badge>
          )}
        </div>

        {state === 'denying' && (
          <div className="mt-3 space-y-2">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why not? (optional)"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" aria-label="Cancel" onClick={handleCancel}>
                Cancel
              </Button>
              <Button size="sm" aria-label="Send" onClick={handleSend}>
                Send
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
