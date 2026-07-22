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
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/lib/ui'
import { savePlace, deletePlace, setTravelMode } from '@/server/actions/places'
import type { PlaceRow } from '@/lib/schemas/place'
import type { TravelMode } from '@/server/services/interfaces/travel'

const HOME_NAME = 'home'

const TRAVEL_MODE_OPTIONS: readonly { readonly value: TravelMode; readonly label: string }[] = [
  { value: 'driving', label: 'Driving' },
  { value: 'walking', label: 'Walking' },
  { value: 'bicycling', label: 'Bicycling' },
  { value: 'transit', label: 'Transit' },
]

function isHome(name: string): boolean {
  return name.trim().toLowerCase() === HOME_NAME
}

function sortHomeFirst(rows: readonly PlaceRow[]): PlaceRow[] {
  return [...rows].sort((a, b) => {
    const aHome = isHome(a.name)
    const bHome = isHome(b.name)
    if (aHome === bHome) return 0
    return aHome ? -1 : 1
  })
}

export interface TravelSectionProps {
  readonly places: readonly PlaceRow[]
  readonly travelMode: TravelMode
  readonly locked: boolean
}

export function TravelSection({
  places,
  travelMode,
  locked,
}: TravelSectionProps): React.JSX.Element {
  const [placeList, setPlaceList] = useState<readonly PlaceRow[]>(places)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [savedAddress, setSavedAddress] = useState<string | null>(null)
  const [isSaving, startSaveTransition] = useTransition()

  const [mode, setMode] = useState<TravelMode>(travelMode)
  const [isModePending, startModeTransition] = useTransition()

  if (locked) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Travel time</CardTitle>
          <CardDescription>
            Upgrade to a paid plan to save places and get travel-time-aware scheduling.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const sorted = sortHomeFirst(placeList)
  const hasHome = sorted.some((p) => isHome(p.name))

  function handleAdd(): void {
    setFormError(null)
    setSavedAddress(null)
    startSaveTransition(async () => {
      const result = await savePlace({ name, address })
      if (!result.ok || !result.place) {
        setFormError(result.error ?? 'Could not save place')
        return
      }
      const saved = result.place
      setPlaceList((prev) => [...prev.filter((p) => p.id !== saved.id), saved])
      setSavedAddress(saved.address)
      setName('')
      setAddress('')
    })
  }

  function handleDelete(id: string): void {
    startSaveTransition(async () => {
      const result = await deletePlace({ id })
      if (result.ok) {
        setPlaceList((prev) => prev.filter((p) => p.id !== id))
      }
    })
  }

  function handleModeChange(next: TravelMode): void {
    setMode(next)
    startModeTransition(async () => {
      await setTravelMode({ travelMode: next })
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Travel time</CardTitle>
        <CardDescription>Saved places and your default travel mode.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {!hasHome && <li className="text-muted-foreground text-sm">Set your home address</li>}
          {sorted.map((place) => (
            <li key={place.id} className="flex items-center justify-between gap-3">
              <div>
                <p>{place.name}</p>
                <p className="text-muted-foreground text-xs">{place.address}</p>
              </div>
              <Button
                aria-label={`Delete ${place.name}`}
                onClick={() => handleDelete(place.id)}
                disabled={isSaving}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>

        <div className="space-y-2">
          <Label htmlFor="place-name">Name</Label>
          <Input
            id="place-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-xs"
          />
          <Label htmlFor="place-address">Address</Label>
          <Input id="place-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          <div className="flex items-center gap-3">
            <Button onClick={handleAdd} disabled={isSaving || !name || !address}>
              {isSaving ? 'Saving…' : 'Add place'}
            </Button>
            {formError && <p className="text-xs text-red-400">{formError}</p>}
            {savedAddress && <p className="text-xs text-emerald-400">Saved: {savedAddress}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="travel-mode">Default travel mode</Label>
          <Select
            value={mode}
            onValueChange={(v) => handleModeChange(v as TravelMode)}
            disabled={isModePending}
          >
            <SelectTrigger id="travel-mode" aria-label="Default travel mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRAVEL_MODE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}
