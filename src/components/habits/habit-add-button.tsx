'use client'
import * as React from 'react'
import { useState } from 'react'
import { Button } from '@/lib/ui'
import { Plus } from 'lucide-react'
import { HabitFormDialog } from './habit-form-dialog'

export function HabitAddButton(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" aria-hidden />
        Add habit
      </Button>
      <HabitFormDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
