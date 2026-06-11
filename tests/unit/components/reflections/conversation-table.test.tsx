import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ConversationTable } from '@/components/reflections/conversation-table'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/server/actions/conversations', () => ({
  deleteConversation: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ui', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    onClick,
    disabled,
    ...p
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled} {...p}>
      {children}
    </button>
  ),
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <tr onClick={onClick}>{children}</tr>
  ),
}))

const conversations = [
  {
    id: 'conv-1',
    type: 'general' as const,
    title: 'My first chat',
    createdAt: new Date('2026-06-01'),
    updatedAt: new Date('2026-06-01'),
    lastMessagePreview: 'Hello world',
  },
  {
    id: 'conv-2',
    type: 'check_in' as const,
    title: null,
    createdAt: new Date('2026-06-02'),
    updatedAt: new Date('2026-06-02'),
    lastMessagePreview: '',
  },
]

describe('ConversationTable', () => {
  beforeEach(() => {
    pushMock.mockClear()
  })

  it('shows empty state when no conversations', () => {
    render(<ConversationTable conversations={[]} />)
    expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument()
  })

  it('renders conversation rows', () => {
    render(<ConversationTable conversations={conversations} />)
    expect(screen.getByText('My first chat')).toBeInTheDocument()
  })

  it('shows "Untitled" for null title', () => {
    render(<ConversationTable conversations={conversations} />)
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })

  it('shows "—" for empty preview', () => {
    render(<ConversationTable conversations={conversations} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows check_in badge for check_in type', () => {
    render(<ConversationTable conversations={conversations} />)
    expect(screen.getByText('Daily Check-in')).toBeInTheDocument()
  })

  it('shows General badge for general type', () => {
    render(<ConversationTable conversations={conversations} />)
    expect(screen.getByText('General')).toBeInTheDocument()
  })

  it('navigates to conversation on row click', () => {
    render(<ConversationTable conversations={[conversations[0]!]} />)
    const row = screen.getAllByRole('row')[1]!
    fireEvent.click(row)
    expect(pushMock).toHaveBeenCalledWith('/chat/conv-1')
  })

  it('removes row on delete click', async () => {
    render(<ConversationTable conversations={[conversations[0]!]} />)
    fireEvent.click(screen.getByRole('button', { name: /delete conversation/i }))
    await vi.waitFor(() => {
      expect(screen.queryByText('My first chat')).not.toBeInTheDocument()
    })
  })
})
