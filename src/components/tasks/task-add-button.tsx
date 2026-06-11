'use client'
import * as React from 'react'
import { useState } from 'react'
import { Button } from '@/lib/ui'
import { Plus } from 'lucide-react'
import { TaskFormDialog } from './task-form-dialog'

export function TaskAddButton(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" aria-hidden />
        Add task
      </Button>
      <TaskFormDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
