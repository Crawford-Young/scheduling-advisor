'use client'

import * as React from 'react'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from '@/lib/ui'
import { setUsername, updateProfile } from '@/server/actions/profile'
import { PROFILE_NAME_MAX, PROFILE_BIO_MAX } from '@/lib/schemas/profile'
import { sanitizeUsernameInput, USERNAME_MAX, USERNAME_MIN } from '@/lib/schemas/username'
import { mapUsernameError, USERNAME_ERROR_FALLBACK } from '@/lib/username-errors'

type SaveStatus = 'idle' | 'saved' | 'error'

interface ProfileSectionProps {
  readonly initialName: string
  readonly initialBio: string
  readonly initialUsername: string
}

export function ProfileSection({
  initialName,
  initialBio,
  initialUsername,
}: ProfileSectionProps): React.JSX.Element {
  const [name, setName] = useState(initialName)
  const [bio, setBio] = useState(initialBio)
  const [profileStatus, setProfileStatus] = useState<SaveStatus>('idle')
  const [isProfilePending, startProfileTransition] = useTransition()

  const [username, setUsernameValue] = useState(initialUsername)
  const [usernameStatus, setUsernameStatus] = useState<SaveStatus>('idle')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [isUsernamePending, startUsernameTransition] = useTransition()

  const profileDirty = name !== initialName || bio !== initialBio

  function handleProfileSave(): void {
    startProfileTransition(async () => {
      try {
        await updateProfile({ name, bio })
        setProfileStatus('saved')
      } catch {
        setProfileStatus('error')
      }
    })
  }

  function handleUsernameSave(): void {
    startUsernameTransition(async () => {
      try {
        const result = await setUsername(username)
        if ('error' in result) {
          setUsernameError(mapUsernameError(result.error))
          setUsernameStatus('error')
          return
        }
        setUsernameError(null)
        setUsernameStatus('saved')
      } catch {
        setUsernameError(USERNAME_ERROR_FALLBACK)
        setUsernameStatus('error')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>How you appear to other people on Cybond.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            maxLength={PROFILE_NAME_MAX}
            onChange={(e) => {
              setName(e.target.value)
              setProfileStatus('idle')
            }}
            className="max-w-xs"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            maxLength={PROFILE_BIO_MAX}
            onChange={(e) => {
              setBio(e.target.value)
              setProfileStatus('idle')
            }}
          />
          <p className="text-muted-foreground text-xs">
            {bio.length}/{PROFILE_BIO_MAX}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            aria-label="Save profile"
            onClick={handleProfileSave}
            disabled={isProfilePending || !profileDirty}
          >
            {isProfilePending ? 'Saving…' : 'Save'}
          </Button>
          {profileStatus === 'saved' && <p className="text-xs text-emerald-400">Profile saved.</p>}
          {profileStatus === 'error' && (
            <p className="text-xs text-red-400">Could not save profile — try again.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <div className="flex gap-3">
            <Input
              id="username"
              value={username}
              maxLength={USERNAME_MAX}
              onChange={(e) => {
                setUsernameValue(sanitizeUsernameInput(e.target.value))
                setUsernameStatus('idle')
                setUsernameError(null)
              }}
              placeholder="your_username"
              className="max-w-xs"
            />
            <Button
              aria-label="Save username"
              onClick={handleUsernameSave}
              disabled={
                isUsernamePending || username === initialUsername || username.length < USERNAME_MIN
              }
            >
              {isUsernamePending ? 'Saving…' : 'Save'}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Friends find you by username. 3–20 characters, lowercase letters, numbers, underscores.
          </p>
          {usernameStatus === 'saved' && (
            <p className="text-xs text-emerald-400">Username saved.</p>
          )}
          {usernameStatus === 'error' && <p className="text-xs text-red-400">{usernameError}</p>}
        </div>

        {initialUsername !== '' ? (
          <Link href={`/u/${initialUsername}`} className="text-primary text-xs hover:underline">
            View public profile
          </Link>
        ) : (
          <p className="text-muted-foreground text-xs">Set a username to get your profile page.</p>
        )}
      </CardContent>
    </Card>
  )
}
