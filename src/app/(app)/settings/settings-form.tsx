'use client'

import * as React from 'react'
import { useState, useTransition } from 'react'
import { Button, Input, Label } from '@/lib/ui'
import { setUsername } from '@/server/actions/profile'
import { setCalendarWindow } from '@/server/actions/calendar-prefs'

interface SettingsFormProps {
  readonly initialUsername: string
  readonly initialWakeHour: number
  readonly initialSleepHour: number
}

export function SettingsForm({
  initialUsername,
  initialWakeHour,
  initialSleepHour,
}: SettingsFormProps): React.JSX.Element {
  const [username, setUsernameValue] = useState(initialUsername)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [isPending, startTransition] = useTransition()

  const [wakeHour, setWakeHour] = useState(initialWakeHour)
  const [sleepHour, setSleepHour] = useState(initialSleepHour)
  const [calStatus, setCalStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [isCalPending, startCalTransition] = useTransition()

  function handleSave(): void {
    startTransition(async () => {
      try {
        await setUsername(username)
        setStatus('saved')
      } catch {
        setStatus('error')
      }
    })
  }

  function handleCalSave(): void {
    startCalTransition(async () => {
      const result = await setCalendarWindow({
        workingHoursStart: wakeHour,
        workingHoursEnd: sleepHour,
      })
      if ('data' in result) {
        setCalStatus('saved')
      } else {
        setCalStatus('error')
      }
    })
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="border-border text-foreground border-b pb-2 text-lg font-semibold">
          Account
        </h2>
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <div className="flex gap-2">
            <Input
              id="username"
              value={username}
              onChange={(e) => {
                setUsernameValue(e.target.value)
                setStatus('idle')
              }}
              placeholder="your_username"
              className="max-w-xs"
            />
            <Button onClick={handleSave} disabled={isPending || username === initialUsername}>
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Friends find you by username. 3–20 characters, lowercase letters, numbers, underscores.
          </p>
          {status === 'saved' && <p className="text-xs text-emerald-400">Username saved.</p>}
          {status === 'error' && (
            <p className="text-xs text-red-400">Invalid or taken username — try another.</p>
          )}
        </div>
      </section>
      <section className="space-y-4">
        <h2 className="border-border text-foreground border-b pb-2 text-lg font-semibold">
          Calendar
        </h2>
        <div className="space-y-2">
          <div className="flex gap-4">
            <div className="space-y-2">
              <Label htmlFor="wake-hour">Wake up</Label>
              <Input
                id="wake-hour"
                type="number"
                min={0}
                max={23}
                value={wakeHour}
                onChange={(e) => {
                  setWakeHour(parseInt(e.target.value, 10))
                  setCalStatus('idle')
                }}
                className="w-20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sleep-hour">Sleep</Label>
              <Input
                id="sleep-hour"
                type="number"
                min={1}
                max={24}
                value={sleepHour}
                onChange={(e) => {
                  setSleepHour(parseInt(e.target.value, 10))
                  setCalStatus('idle')
                }}
                className="w-20"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              aria-label="Save calendar settings"
              onClick={handleCalSave}
              disabled={
                isCalPending || (wakeHour === initialWakeHour && sleepHour === initialSleepHour)
              }
            >
              {isCalPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
          {calStatus === 'saved' && <p className="text-xs text-emerald-400">Calendar saved.</p>}
          {calStatus === 'error' && (
            <p className="text-xs text-red-400">Could not save calendar settings — try again.</p>
          )}
        </div>
      </section>
    </div>
  )
}
