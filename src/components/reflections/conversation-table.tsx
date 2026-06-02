'use client'
import { useRouter } from 'next/navigation'
import { useTransition, useState } from 'react'
import { deleteConversation } from '@/server/actions/conversations'
import type { ConversationRow } from '@/server/queries/conversations'
import { Trash2 } from 'lucide-react'

interface ConversationTableProps {
  readonly conversations: ConversationRow[]
}

function TypeBadge({ type }: { readonly type: 'check_in' | 'general' }) {
  if (type === 'check_in') {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-400 ring-1 ring-blue-500/30">
        Daily Check-in
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-purple-500/15 px-2 py-0.5 text-xs font-medium text-purple-400 ring-1 ring-purple-500/30">
      General
    </span>
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
    <div className="border-border overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-surface-raised">
          <tr>
            <th className="text-muted-foreground px-4 py-3 text-left font-medium">Type</th>
            <th className="text-muted-foreground px-4 py-3 text-left font-medium">Title</th>
            <th className="text-muted-foreground px-4 py-3 text-left font-medium">Date</th>
            <th className="text-muted-foreground px-4 py-3 text-left font-medium">Preview</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => router.push(`/chat/${row.id}`)}
              className="hover:bg-surface-raised cursor-pointer transition-colors"
            >
              <td className="px-4 py-3">
                <TypeBadge type={row.type} />
              </td>
              <td className="text-foreground max-w-[200px] truncate px-4 py-3 font-medium">
                {row.title ?? 'Untitled'}
              </td>
              <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
                {formatDate(row.updatedAt)}
              </td>
              <td className="text-muted-foreground max-w-[300px] truncate px-4 py-3">
                {row.lastMessagePreview || '—'}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={(e) => handleDelete(e, row.id)}
                  disabled={isPending}
                  aria-label="Delete conversation"
                  className="text-muted-foreground hover:text-destructive rounded p-1 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
