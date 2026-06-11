'use client'
import { useRouter } from 'next/navigation'
import { useTransition, useState } from 'react'
import { deleteConversation } from '@/server/actions/conversations'
import type { ConversationRow } from '@/server/queries/conversations'
import { Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/lib/ui'

interface ConversationTableProps {
  readonly conversations: ConversationRow[]
}

function TypeBadge({ type }: { readonly type: 'check_in' | 'general' }) {
  if (type === 'check_in') {
    return (
      <Badge variant="outline" className="border-blue-500/30 bg-blue-500/15 text-blue-400">
        Daily Check-in
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-purple-500/30 bg-purple-500/15 text-purple-400">
      General
    </Badge>
  )
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function ConversationTable({ conversations }: ConversationTableProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rows, setRows] = useState(conversations)

  function handleDelete(e: React.MouseEvent, id: string): void {
    e.stopPropagation()
    setRows((prev) => prev.filter((r) => r.id !== id))
    startTransition(async () => {
      await deleteConversation(id)
    })
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        No conversations yet. Tap the AI button to start one.
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Preview</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={row.id}
            onClick={() => router.push(`/chat/${row.id}`)}
            className="cursor-pointer"
          >
            <TableCell>
              <TypeBadge type={row.type} />
            </TableCell>
            <TableCell className="max-w-[200px] truncate font-medium">
              {row.title ?? 'Untitled'}
            </TableCell>
            <TableCell className="whitespace-nowrap">{formatDate(row.updatedAt)}</TableCell>
            <TableCell className="text-muted-foreground max-w-[300px] truncate">
              {row.lastMessagePreview || '—'}
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="icon"
                disabled={isPending}
                aria-label="Delete conversation"
                onClick={(e) => handleDelete(e, row.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
