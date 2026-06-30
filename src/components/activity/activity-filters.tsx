'use client'
import * as React from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/lib/ui'

const ALL_VALUE = 'all'
const RECURRING_TRUE = '1'
const RECURRING_TOGGLE_ID = 'activity-filter-recurring'

/**
 * URL-driven filter controls for the Activities surface. Every change rebuilds
 * the query string from the current params (preserving the others) and pushes
 * `?type=&status=&q=&recurring=`, which the server component reads to filter.
 */
export function ActivityFilters(): React.JSX.Element {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const type = searchParams.get('type') ?? ALL_VALUE
  const status = searchParams.get('status') ?? ALL_VALUE
  const q = searchParams.get('q') ?? ''
  const recurring = searchParams.get('recurring') === RECURRING_TRUE

  function pushParam(key: string, value: string | null): void {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null || value === '' || value === ALL_VALUE) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        aria-label="Search activities"
        placeholder="Search activities…"
        value={q}
        onChange={(e) => pushParam('q', e.target.value)}
        className="min-w-[12rem] flex-1"
      />

      <Select value={type} onValueChange={(value) => pushParam('type', value)}>
        <SelectTrigger aria-label="Filter by type" className="w-[9rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All types</SelectItem>
          <SelectItem value="task">Tasks</SelectItem>
          <SelectItem value="goal">Goals</SelectItem>
        </SelectContent>
      </Select>

      <Select value={status} onValueChange={(value) => pushParam('status', value)}>
        <SelectTrigger aria-label="Filter by status" className="w-[10rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All statuses</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="in_progress">In progress</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Switch
          id={RECURRING_TOGGLE_ID}
          checked={recurring}
          onCheckedChange={(checked) => pushParam('recurring', checked ? RECURRING_TRUE : null)}
        />
        <Label htmlFor={RECURRING_TOGGLE_ID}>Recurring</Label>
      </div>
    </div>
  )
}
