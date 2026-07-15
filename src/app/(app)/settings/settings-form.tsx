'use client'

import * as React from 'react'
import { useState, useTransition } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  NumberInput,
  Switch,
  TimeInput,
} from '@/lib/ui'
import { setCalendarWindow } from '@/server/actions/calendar-prefs'
import type { CalendarDayOverrides } from '@/lib/schemas/calendar-prefs'
import { MAX_DISPLAY_MINUTES } from '@/lib/calendar-windows'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const MINUTES_PER_HOUR = 60
const TIME_PAD_LENGTH = 2

const TTL_MIN_DAYS = 1
const TTL_MAX_DAYS = 365
const DEFAULT_TTL_DAYS = 30

function minutesToTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR)
  const minutes = totalMinutes % MINUTES_PER_HOUR
  return `${String(hours).padStart(TIME_PAD_LENGTH, '0')}:${String(minutes).padStart(TIME_PAD_LENGTH, '0')}`
}

function timeStringToMinutes(value: string): number {
  const [hourStr = '0', minuteStr = '0'] = value.split(':')
  return parseInt(hourStr, 10) * MINUTES_PER_HOUR + parseInt(minuteStr, 10)
}

interface DayHours {
  readonly wake: number
  readonly sleep: number
}

type DayOverrideState = Record<string, DayHours | null>

function buildInitialDayOverrideState(dayOverrides: CalendarDayOverrides): DayOverrideState {
  const state: DayOverrideState = {}
  DAY_LABELS.forEach((_, index) => {
    const key = String(index)
    const override = dayOverrides[key as keyof CalendarDayOverrides] ?? null
    state[key] = override
      ? { wake: override.wake, sleep: Math.min(override.sleep, MAX_DISPLAY_MINUTES) }
      : null
  })
  return state
}

interface SettingsFormProps {
  readonly initialWakeMinutes: number
  readonly initialSleepMinutes: number
  readonly initialUse24h: boolean
  readonly initialDayOverrides: CalendarDayOverrides
  readonly initialTtlDays: number | null
}

export function SettingsForm({
  initialWakeMinutes,
  initialSleepMinutes,
  initialUse24h,
  initialDayOverrides,
  initialTtlDays,
}: SettingsFormProps): React.JSX.Element {
  const [wakeMinutes, setWakeMinutes] = useState(initialWakeMinutes)
  const [sleepMinutes, setSleepMinutes] = useState(initialSleepMinutes)
  const [use24h, setUse24h] = useState(initialUse24h)
  const [dayOverrides, setDayOverrides] = useState<DayOverrideState>(() =>
    buildInitialDayOverrideState(initialDayOverrides),
  )
  const [ttlEnabled, setTtlEnabled] = useState(initialTtlDays !== null)
  const [ttlDays, setTtlDays] = useState(initialTtlDays ?? DEFAULT_TTL_DAYS)
  const [calStatus, setCalStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [isCalPending, startCalTransition] = useTransition()

  const initialDayOverrideState = buildInitialDayOverrideState(initialDayOverrides)
  const dayOverridesDirty = DAY_LABELS.some((_, index) => {
    const key = String(index)
    const current = dayOverrides[key] ?? null
    const initial = initialDayOverrideState[key] ?? null
    return current?.wake !== initial?.wake || current?.sleep !== initial?.sleep
  })
  const effectiveTtlDays = ttlEnabled ? ttlDays : null
  const calDirty =
    wakeMinutes !== initialWakeMinutes ||
    sleepMinutes !== initialSleepMinutes ||
    use24h !== initialUse24h ||
    effectiveTtlDays !== initialTtlDays ||
    dayOverridesDirty

  function clearCalStatus(): void {
    setCalStatus('idle')
  }

  function handleCalSave(): void {
    startCalTransition(async () => {
      const activeDayOverrides: CalendarDayOverrides = {}
      DAY_LABELS.forEach((_, index) => {
        const key = String(index) as keyof CalendarDayOverrides
        const override = dayOverrides[key]
        if (override) {
          activeDayOverrides[key] = override
        }
      })

      const result = await setCalendarWindow({
        workingHoursStart: wakeMinutes,
        workingHoursEnd: sleepMinutes,
        use24h,
        dayOverrides: activeDayOverrides,
        ttlDays: effectiveTtlDays,
      })
      if ('data' in result) {
        setCalStatus('saved')
      } else {
        setCalStatus('error')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendar</CardTitle>
        <CardDescription>
          When your day starts and ends, and how events are cleaned up.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-6">
          <div className="space-y-2">
            <Label htmlFor="wake-time">Wake</Label>
            <TimeInput
              id="wake-time"
              label="Wake"
              size="md"
              use24h={use24h}
              value={minutesToTimeString(wakeMinutes)}
              onChange={(next) => {
                setWakeMinutes(timeStringToMinutes(next))
                clearCalStatus()
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sleep-time">Sleep</Label>
            <TimeInput
              id="sleep-time"
              label="Sleep"
              size="md"
              use24h={use24h}
              value={minutesToTimeString(sleepMinutes)}
              onChange={(next) => {
                setSleepMinutes(timeStringToMinutes(next))
                clearCalStatus()
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="use-24h"
            aria-label="24-hour time"
            checked={use24h}
            onCheckedChange={(checked) => {
              setUse24h(checked)
              clearCalStatus()
            }}
          />
          <div className="space-y-0.5">
            <Label htmlFor="use-24h">24-hour time</Label>
            <p className="text-muted-foreground text-xs">
              Display times as 14:00 instead of 2:00 PM.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-foreground text-sm font-medium">Per-day overrides</h3>
            <p className="text-muted-foreground text-xs">
              Set different wake and sleep times for individual days.
            </p>
          </div>
          <div className="space-y-3">
            {DAY_LABELS.map((label, index) => {
              const key = String(index)
              const override = dayOverrides[key] ?? null
              const overrideSwitchId = `override-${key}`
              return (
                <div key={key} className="grid grid-cols-[auto_9rem_1fr] items-center gap-4">
                  <Switch
                    id={overrideSwitchId}
                    aria-label={`Override ${label}`}
                    checked={override !== null}
                    onCheckedChange={(checked) => {
                      setDayOverrides((prev) => ({
                        ...prev,
                        [key]: checked ? { wake: wakeMinutes, sleep: sleepMinutes } : null,
                      }))
                      clearCalStatus()
                    }}
                  />
                  <Label htmlFor={overrideSwitchId} className="text-foreground text-sm">
                    {label}
                  </Label>
                  {override !== null && (
                    <div className="flex flex-wrap gap-4">
                      <TimeInput
                        id={`day-${key}-wake`}
                        label={`${label} wake`}
                        use24h={use24h}
                        value={minutesToTimeString(override.wake)}
                        onChange={(next) => {
                          setDayOverrides((prev) => ({
                            ...prev,
                            [key]: { wake: timeStringToMinutes(next), sleep: override.sleep },
                          }))
                          clearCalStatus()
                        }}
                      />
                      <TimeInput
                        id={`day-${key}-sleep`}
                        label={`${label} sleep`}
                        use24h={use24h}
                        value={minutesToTimeString(override.sleep)}
                        onChange={(next) => {
                          setDayOverrides((prev) => ({
                            ...prev,
                            [key]: { wake: override.wake, sleep: timeStringToMinutes(next) },
                          }))
                          clearCalStatus()
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="ttl-enabled"
              aria-label="Auto-delete events"
              checked={ttlEnabled}
              onCheckedChange={(checked) => {
                setTtlEnabled(checked)
                clearCalStatus()
              }}
            />
            <div className="space-y-0.5">
              <Label htmlFor="ttl-enabled">Auto-delete events</Label>
              <p className="text-muted-foreground text-xs">
                Pending one-off events are deleted this many days after they end. Completed events
                are kept.
              </p>
            </div>
          </div>
          {ttlEnabled && (
            <div className="space-y-2">
              <Label htmlFor="ttl-days">Delete after (days)</Label>
              <NumberInput
                id="ttl-days"
                min={TTL_MIN_DAYS}
                max={TTL_MAX_DAYS}
                value={ttlDays}
                onChange={(value) => {
                  setTtlDays(value)
                  clearCalStatus()
                }}
                className="w-32"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            aria-label="Save calendar settings"
            onClick={handleCalSave}
            disabled={isCalPending || !calDirty}
          >
            {isCalPending ? 'Saving…' : 'Save'}
          </Button>
          {calStatus === 'saved' && <p className="text-xs text-emerald-400">Calendar saved.</p>}
          {calStatus === 'error' && (
            <p className="text-xs text-red-400">Could not save calendar settings — try again.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
