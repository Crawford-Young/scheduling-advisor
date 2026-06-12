'use client'

import * as React from 'react'
import { useState, useTransition } from 'react'
import { Button, Input, Label } from '@/lib/ui'
import { setUsername } from '@/server/actions/profile'

interface SettingsFormProps {
  readonly initialUsername: string
}

export function SettingsForm({ initialUsername }: SettingsFormProps): React.JSX.Element {
  const [username, setUsernameValue] = useState(initialUsername)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [isPending, startTransition] = useTransition()

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
    </div>
  )
}
