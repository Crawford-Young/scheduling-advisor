'use client'

import * as React from 'react'
import { useState, useTransition } from 'react'
import { Button, Input, Label, NumberInput, Switch } from '@/lib/ui'
import { setUsername } from '@/server/actions/profile'
import { setCalendarWindow } from '@/server/actions/calendar-prefs'
import type { CalendarDayOverrides } from '@/lib/schemas/calendar-prefs'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const WAKE_HOUR_MIN = 0
const WAKE_HOUR_MAX = 23
const SLEEP_HOUR_MIN = 1
const SLEEP_HOUR_MAX = 24

interface DayHours {
  readonly wake: number
  readonly sleep: number
}

type DayOverrideState = Record<string, DayHours | null>

function buildInitialDayOverrideState(dayOverrides: CalendarDayOverrides): DayOverrideState {
  const state: DayOverrideState = {}
  DAY_LABELS.forEach((_, index) => {
    const key = String(index)
    state[key] = dayOverrides[key as keyof CalendarDayOverrides] ?? null
  })
  return state
}

interface SettingsFormProps {
  readonly initialUsername: string
  readonly initialWakeHour: number
  readonly initialSleepHour: number
  readonly initialUse24h: boolean
  readonly initialDayOverrides: CalendarDayOverrides
}

export function SettingsForm({
  initialUsername,
  initialWakeHour,
  initialSleepHour,
  initialUse24h,
  initialDayOverrides,
}: SettingsFormProps): React.JSX.Element {
  const [username, setUsernameValue] = useState(initialUsername)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [isPending, startTransition] = useTransition()

  const [wakeHour, setWakeHour] = useState(initialWakeHour)
  const [sleepHour, setSleepHour] = useState(initialSleepHour)
  const [use24h, setUse24h] = useState(initialUse24h)
  const [dayOverrides, setDayOverrides] = useState<DayOverrideState>(() =>
    buildInitialDayOverrideState(initialDayOverrides),
  )
  const [calStatus, setCalStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [isCalPending, startCalTransition] = useTransition()

  const initialDayOverrideState = buildInitialDayOverrideState(initialDayOverrides)
  const dayOverridesDirty = DAY_LABELS.some((_, index) => {
    const key = String(index)
    const current = dayOverrides[key] ?? null
    const initial = initialDayOverrideState[key] ?? null
    return current?.wake !== initial?.wake || current?.sleep !== initial?.sleep
  })
  const calDirty =
    wakeHour !== initialWakeHour ||
    sleepHour !== initialSleepHour ||
    use24h !== initialUse24h ||
    dayOverridesDirty

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
      const activeDayOverrides: CalendarDayOverrides = {}
      DAY_LABELS.forEach((_, index) => {
        const key = String(index) as keyof CalendarDayOverrides
        const override = dayOverrides[key]
        if (override !== null && override !== undefined) {
          activeDayOverrides[key] = override
        }
      })

      const result = await setCalendarWindow({
        workingHoursStart: wakeHour,
        workingHoursEnd: sleepHour,
        use24h,
        dayOverrides: activeDayOverrides,
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
              <NumberInput
                id="wake-hour"
                min={WAKE_HOUR_MIN}
                max={WAKE_HOUR_MAX}
                value={wakeHour}
                onChange={(value) => {
                  setWakeHour(value)
                  setCalStatus('idle')
                }}
                className="w-20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sleep-hour">Sleep</Label>
              <NumberInput
                id="sleep-hour"
                min={SLEEP_HOUR_MIN}
                max={SLEEP_HOUR_MAX}
                value={sleepHour}
                onChange={(value) => {
                  setSleepHour(value)
                  setCalStatus('idle')
                }}
                className="w-20"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="use-24h"
              aria-label="24-hour time"
              checked={use24h}
              onCheckedChange={(checked) => {
                setUse24h(checked)
                setCalStatus('idle')
              }}
            />
            <Label htmlFor="use-24h">24-hour time</Label>
          </div>
          <div className="space-y-2">
            <h3 className="text-foreground text-sm font-medium">Per-day overrides</h3>
            {DAY_LABELS.map((label, index) => {
              const key = String(index)
              const override = dayOverrides[key] ?? null
              const overrideSwitchId = `override-${key}`
              return (
                <div key={key} className="flex items-center gap-4">
                  <div className="flex w-24 items-center gap-2">
                    <Switch
                      id={overrideSwitchId}
                      aria-label={`Override ${label}`}
                      checked={override !== null}
                      onCheckedChange={(checked) => {
                        setDayOverrides((prev) => ({
                          ...prev,
                          [key]: checked ? { wake: wakeHour, sleep: sleepHour } : null,
                        }))
                        setCalStatus('idle')
                      }}
                    />
                    <Label htmlFor={overrideSwitchId} className="text-foreground text-sm">
                      {label}
                    </Label>
                  </div>
                  {override !== null && (
                    <div className="flex gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`day-${key}-wake`}>{`${label} wake hour`}</Label>
                        <NumberInput
                          id={`day-${key}-wake`}
                          min={WAKE_HOUR_MIN}
                          max={WAKE_HOUR_MAX}
                          value={override.wake}
                          onChange={(value) => {
                            setDayOverrides((prev) => ({
                              ...prev,
                              [key]: { wake: value, sleep: override.sleep },
                            }))
                            setCalStatus('idle')
                          }}
                          className="w-20"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`day-${key}-sleep`}>{`${label} sleep hour`}</Label>
                        <NumberInput
                          id={`day-${key}-sleep`}
                          min={SLEEP_HOUR_MIN}
                          max={SLEEP_HOUR_MAX}
                          value={override.sleep}
                          onChange={(value) => {
                            setDayOverrides((prev) => ({
                              ...prev,
                              [key]: { wake: override.wake, sleep: value },
                            }))
                            setCalStatus('idle')
                          }}
                          className="w-20"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex gap-2">
            <Button
              aria-label="Save calendar settings"
              onClick={handleCalSave}
              disabled={isCalPending || !calDirty}
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
