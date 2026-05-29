'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/lib/ui'
import { updateActivitySettings } from '@/server/actions/activity-settings'

interface ActivitySettingsMenuProps {
  readonly taskId: string
  readonly activityType: 'solo' | 'group'
  readonly visibility: 'everyone' | 'friends' | 'busy' | 'only_me'
  readonly joinability?: 'open' | 'request' | 'closed'
  readonly maxParticipants?: number
}

export function ActivitySettingsMenu({
  taskId,
  activityType: initialActivityType,
  visibility: initialVisibility,
  joinability: initialJoinability,
  maxParticipants,
}: ActivitySettingsMenuProps): React.JSX.Element {
  const router = useRouter()
  const [activityType, setActivityType] = useState(initialActivityType)
  const [visibility, setVisibility] = useState(initialVisibility)
  const [joinability, setJoinability] = useState(initialJoinability)
  const [, startTransition] = useTransition()

  const showJoinability =
    activityType === 'group' && visibility !== 'busy' && visibility !== 'only_me'

  function handleSave(): void {
    startTransition(async () => {
      await updateActivitySettings({
        taskId,
        activityType,
        visibility,
        joinability: activityType === 'group' ? joinability : undefined,
        maxParticipants: activityType === 'group' ? maxParticipants : undefined,
      })
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-1.5">
        <Label htmlFor={`type-${taskId}`}>Activity Type</Label>
        <Select
          value={activityType}
          onValueChange={(v) => setActivityType(v as typeof activityType)}
        >
          <SelectTrigger id={`type-${taskId}`}>
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solo">Solo</SelectItem>
            <SelectItem value="group">Group</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`vis-${taskId}`}>Visibility</Label>
        <Select value={visibility} onValueChange={(v) => setVisibility(v as typeof visibility)}>
          <SelectTrigger id={`vis-${taskId}`}>
            <SelectValue placeholder="Select visibility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="everyone">Everyone</SelectItem>
            <SelectItem value="friends">Friends</SelectItem>
            <SelectItem value="busy">Busy</SelectItem>
            <SelectItem value="only_me">Only me</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showJoinability && (
        <div className="space-y-1.5">
          <Label htmlFor={`join-${taskId}`}>Joinability</Label>
          <Select
            value={joinability ?? 'open'}
            onValueChange={(v) => setJoinability(v as typeof joinability)}
          >
            <SelectTrigger id={`join-${taskId}`}>
              <SelectValue placeholder="Select joinability" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open — anyone can join</SelectItem>
              <SelectItem value="request">Request — you approve</SelectItem>
              <SelectItem value="closed">Closed — visible only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <Button size="sm" onClick={handleSave} aria-label="Save activity settings">
        Save
      </Button>
    </div>
  )
}
