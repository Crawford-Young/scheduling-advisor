import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Message } from 'ai'

const { mockHandleSubmit, mockSetInput, mockUseChat } = vi.hoisted(() => ({
  mockHandleSubmit: vi.fn(),
  mockSetInput: vi.fn(),
  mockUseChat: vi.fn(),
}))

vi.mock('ai/react', () => ({ useChat: mockUseChat }))
vi.mock('@/components/chat/tool-result-renderer', () => ({
  ToolResultRenderer: ({ toolInvocation }: { toolInvocation: { toolName: string } }) => (
    <div data-testid={`tool-${toolInvocation.toolName}`} />
  ),
}))
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@crawfordyoung/ui', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  Textarea: ({ ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}))

import { DashboardChat } from '@/components/chat/dashboard-chat'

const defaultUseChat = {
  messages: [] as Message[],
  input: '',
  setInput: mockSetInput,
  handleSubmit: mockHandleSubmit,
  isLoading: false,
}

describe('DashboardChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseChat.mockReturnValue(defaultUseChat)
  })

  it('renders the header with settings link', () => {
    render(<DashboardChat conversationId="conv-1" initialMessages={[]} />)
    expect(screen.getByText('Scheduling Advisor')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings')
  })

  it('renders empty state message when no messages', () => {
    render(<DashboardChat conversationId="conv-1" initialMessages={[]} />)
    expect(screen.getByText(/start a conversation/i)).toBeInTheDocument()
  })

  it('renders user messages right-aligned', () => {
    mockUseChat.mockReturnValue({
      ...defaultUseChat,
      messages: [{ id: '1', role: 'user', content: 'Hello!' }] as Message[],
    })
    render(<DashboardChat conversationId="conv-1" initialMessages={[]} />)
    expect(screen.getByText('Hello!')).toBeInTheDocument()
  })

  it('renders assistant text messages', () => {
    mockUseChat.mockReturnValue({
      ...defaultUseChat,
      messages: [{ id: '2', role: 'assistant', content: 'How can I help?' }] as Message[],
    })
    render(<DashboardChat conversationId="conv-1" initialMessages={[]} />)
    expect(screen.getByText('How can I help?')).toBeInTheDocument()
  })

  it('shows bouncing dots when loading', () => {
    mockUseChat.mockReturnValue({ ...defaultUseChat, isLoading: true })
    render(<DashboardChat conversationId="conv-1" initialMessages={[]} />)
    expect(screen.getByTestId('loading-dots')).toBeInTheDocument()
  })

  it('hides loading indicator when not loading', () => {
    render(<DashboardChat conversationId="conv-1" initialMessages={[]} />)
    expect(screen.queryByTestId('loading-dots')).not.toBeInTheDocument()
  })

  it('shows no-key banner when showNoKeyBanner is true', async () => {
    let errorCallback: ((e: Error) => void) | undefined
    mockUseChat.mockImplementation(({ onError }: { onError: (e: Error) => void }) => {
      errorCallback = onError
      return defaultUseChat
    })
    render(<DashboardChat conversationId="conv-1" initialMessages={[]} />)
    expect(screen.queryByText(/add your anthropic api key/i)).not.toBeInTheDocument()
    act(() => {
      errorCallback!(new Error('{"error":"no_api_key"}'))
    })
    expect(await screen.findByText(/add your anthropic api key/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
  })

  it('hides empty state when no-key banner is shown', async () => {
    let errorCallback: ((e: Error) => void) | undefined
    mockUseChat.mockImplementation(({ onError }: { onError: (e: Error) => void }) => {
      errorCallback = onError
      return defaultUseChat
    })
    render(<DashboardChat conversationId="conv-1" initialMessages={[]} />)
    act(() => {
      errorCallback!(new Error('{"error":"no_api_key"}'))
    })
    expect(await screen.findByText(/add your anthropic api key/i)).toBeInTheDocument()
    expect(screen.queryByText(/start a conversation/i)).not.toBeInTheDocument()
  })

  it('submits form on Enter key (no shift)', async () => {
    mockUseChat.mockReturnValue({ ...defaultUseChat, input: 'hello' })
    render(<DashboardChat conversationId="conv-1" initialMessages={[]} />)
    const textarea = screen.getByPlaceholderText(/ask about your schedule/i)
    await userEvent.type(textarea, '{Enter}')
    expect(mockHandleSubmit).toHaveBeenCalled()
  })

  it('renders tool result via ToolResultRenderer', () => {
    mockUseChat.mockReturnValue({
      ...defaultUseChat,
      messages: [
        {
          id: '3',
          role: 'assistant',
          content: '',
          toolInvocations: [
            { state: 'result', toolCallId: 'c1', toolName: 'showTaskCard', args: {}, result: {} },
          ],
        },
      ] as Message[],
    })
    render(<DashboardChat conversationId="conv-1" initialMessages={[]} />)
    expect(screen.getByTestId('tool-showTaskCard')).toBeInTheDocument()
  })

  it('passes conversationId in useChat body', () => {
    render(<DashboardChat conversationId="my-conv-id" initialMessages={[]} />)
    expect(mockUseChat).toHaveBeenCalledWith(
      expect.objectContaining({ body: { conversationId: 'my-conv-id' } }),
    )
  })

  it('does not show no-key banner for unrelated errors', async () => {
    let errorCallback: ((e: Error) => void) | undefined
    mockUseChat.mockImplementation(({ onError }: { onError: (e: Error) => void }) => {
      errorCallback = onError
      return defaultUseChat
    })
    render(<DashboardChat conversationId="conv-1" initialMessages={[]} />)
    act(() => {
      errorCallback!(new Error('some other error'))
    })
    expect(screen.queryByText(/add your anthropic api key/i)).not.toBeInTheDocument()
  })

  it('calls setInput when user types in the textarea', async () => {
    render(<DashboardChat conversationId="conv-1" initialMessages={[]} />)
    const textarea = screen.getByPlaceholderText(/ask about your schedule/i)
    await userEvent.type(textarea, 'hello')
    expect(mockSetInput).toHaveBeenCalled()
  })

  it('does not submit on Shift+Enter', async () => {
    mockUseChat.mockReturnValue({ ...defaultUseChat, input: 'hello' })
    render(<DashboardChat conversationId="conv-1" initialMessages={[]} />)
    const textarea = screen.getByPlaceholderText(/ask about your schedule/i)
    await userEvent.type(textarea, '{Shift>}{Enter}{/Shift}')
    expect(mockHandleSubmit).not.toHaveBeenCalled()
  })
})
