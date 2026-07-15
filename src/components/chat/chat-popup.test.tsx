import * as React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ChatPopup } from './chat-popup'

interface MockConversation {
  readonly id: string
  readonly title: string | null
}

interface MockChatSurfaceProps {
  readonly conversation: MockConversation | null
  readonly initialMessages: readonly { readonly id: string }[]
  readonly initialTokenBalance: number
  readonly prefill?: string
  readonly onEnsureConversation?: () => Promise<{ id: string }>
}

let chatSurfaceMountCount = 0

vi.mock('@/components/chat/chat-surface', () => ({
  ChatSurface: ({
    conversation,
    initialMessages,
    initialTokenBalance,
    prefill,
    onEnsureConversation,
  }: MockChatSurfaceProps) => {
    React.useEffect(() => {
      chatSurfaceMountCount += 1
    }, [])
    return (
      <div data-testid="chat-surface">
        <span data-testid="cs-conversation-id">{conversation?.id ?? 'none'}</span>
        <span data-testid="cs-message-count">{initialMessages.length}</span>
        <span data-testid="cs-token-balance">{initialTokenBalance}</span>
        <span data-testid="cs-prefill">{prefill ?? 'none'}</span>
        <button onClick={() => void onEnsureConversation?.()}>ensure</button>
      </div>
    )
  },
}))

vi.mock('@/lib/ui', () => ({
  ChatFab: ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} aria-label="Open AI assistant">
      fab
    </button>
  ),
  Button: ({ children, onClick, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} {...rest}>
      {children}
    </button>
  ),
  Spinner: () => <div data-testid="popup-spinner">loading</div>,
}))

let mockPathname = '/dashboard'
const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: pushMock }),
}))

const getLatestConversationMock = vi.fn()
const getConversationMessagesActionMock = vi.fn()
const createConversationMock = vi.fn()

vi.mock('@/server/actions/conversations', () => ({
  getLatestConversation: () => getLatestConversationMock(),
  getConversationMessagesAction: (id: string) => getConversationMessagesActionMock(id),
  createConversation: (type: string) => createConversationMock(type),
}))

const getTokenBalanceActionMock = vi.fn()

vi.mock('@/server/actions/tokens', () => ({
  getTokenBalanceAction: () => getTokenBalanceActionMock(),
}))

function openFab(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Open AI assistant' }))
}

describe('ChatPopup', () => {
  beforeEach(() => {
    mockPathname = '/dashboard'
    pushMock.mockClear()
    chatSurfaceMountCount = 0
    getLatestConversationMock.mockReset().mockResolvedValue(null)
    getConversationMessagesActionMock.mockReset().mockResolvedValue([])
    createConversationMock.mockReset().mockResolvedValue({ id: 'new-conv' })
    getTokenBalanceActionMock.mockReset().mockResolvedValue(50)
  })

  describe('route guard', () => {
    it('renders nothing on /chat/:id routes', () => {
      mockPathname = '/chat/abc'
      const { container } = render(<ChatPopup />)
      expect(container).toBeEmptyDOMElement()
    })

    it('renders nothing on the exact /chat route', () => {
      mockPathname = '/chat'
      const { container } = render(<ChatPopup />)
      expect(container).toBeEmptyDOMElement()
    })

    it('renders normally on other routes', () => {
      mockPathname = '/calendar'
      render(<ChatPopup />)
      expect(screen.getByRole('button', { name: 'Open AI assistant' })).toBeInTheDocument()
    })
  })

  describe('closed state', () => {
    it('renders only the ChatFab', () => {
      render(<ChatPopup />)
      expect(screen.getByRole('button', { name: 'Open AI assistant' })).toBeInTheDocument()
      expect(screen.queryByTestId('chat-surface')).not.toBeInTheDocument()
    })

    it('opens the panel when the fab is clicked', async () => {
      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')
      expect(screen.queryByRole('button', { name: 'Open AI assistant' })).not.toBeInTheDocument()
    })
  })

  describe('dialog landmark', () => {
    it('is absent when the panel is closed', () => {
      render(<ChatPopup />)
      expect(screen.queryByRole('dialog', { name: 'Cy assistant' })).not.toBeInTheDocument()
    })

    it('exposes the open panel as a dialog landmark', async () => {
      render(<ChatPopup />)
      openFab()
      const dialog = await screen.findByRole('dialog', { name: 'Cy assistant' })
      expect(dialog).toHaveAttribute('data-testid', 'chat-popup-panel')
    })
  })

  describe('open panel layout', () => {
    it('renders a fixed, sized panel with header controls and a truncated title', async () => {
      render(<ChatPopup />)
      openFab()
      const panel = await screen.findByTestId('chat-popup-panel')
      expect(panel).toHaveClass('w-[380px]')
      expect(panel).toHaveClass('h-[560px]')

      const title = screen.getByTestId('chat-popup-title')
      expect(title).toHaveClass('min-w-0')
      expect(title).toHaveClass('truncate')

      expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Expand to full chat' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Close chat' })).toBeInTheDocument()

      await screen.findByTestId('chat-surface')
    })
  })

  describe('first-open load', () => {
    it('loads an existing latest conversation, its messages, and the token balance', async () => {
      getLatestConversationMock.mockResolvedValue({ id: 'conv-1', title: 'Trip planning' })
      getConversationMessagesActionMock.mockResolvedValue([
        { id: 'm1', role: 'user', content: 'hi' },
        { id: 'm2', role: 'assistant', content: 'hello' },
      ])
      getTokenBalanceActionMock.mockResolvedValue(42)

      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')

      expect(getConversationMessagesActionMock).toHaveBeenCalledWith('conv-1')
      expect(screen.getByTestId('cs-conversation-id')).toHaveTextContent('conv-1')
      expect(screen.getByTestId('cs-message-count')).toHaveTextContent('2')
      expect(screen.getByTestId('cs-token-balance')).toHaveTextContent('42')
      expect(screen.getByTestId('chat-popup-title')).toHaveTextContent('Trip planning')
    })

    it('renders a null-conversation state with a lazy onEnsureConversation when none exists', async () => {
      getLatestConversationMock.mockResolvedValue(null)

      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')

      expect(getConversationMessagesActionMock).not.toHaveBeenCalled()
      expect(screen.getByTestId('cs-conversation-id')).toHaveTextContent('none')
      expect(screen.getByTestId('cs-message-count')).toHaveTextContent('0')
      expect(screen.getByTestId('cs-prefill')).toHaveTextContent('none')
    })

    it('re-seeds the conversation after onEnsureConversation lazily creates one, so auto-title can fire', async () => {
      getLatestConversationMock.mockResolvedValue(null)
      createConversationMock.mockResolvedValue({ id: 'lazy-1' })

      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')

      fireEvent.click(screen.getByRole('button', { name: 'ensure' }))

      await waitFor(() => {
        expect(createConversationMock).toHaveBeenCalledWith('general')
      })
      await waitFor(() => {
        expect(screen.getByTestId('cs-conversation-id')).toHaveTextContent('lazy-1')
      })
    })

    it('only fetches the latest conversation on the first open, not on subsequent opens', async () => {
      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')
      fireEvent.click(screen.getByRole('button', { name: 'Close chat' }))
      openFab()
      await screen.findByTestId('chat-surface')
      expect(getLatestConversationMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('new chat', () => {
    it('resets to the null-conversation state and remounts ChatSurface', async () => {
      getLatestConversationMock.mockResolvedValue({ id: 'conv-1', title: 'Trip planning' })
      getConversationMessagesActionMock.mockResolvedValue([
        { id: 'm1', role: 'user', content: 'hi' },
      ])

      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')
      expect(screen.getByTestId('cs-conversation-id')).toHaveTextContent('conv-1')

      const mountsBefore = chatSurfaceMountCount
      fireEvent.click(screen.getByRole('button', { name: 'New chat' }))

      expect(screen.getByTestId('cs-conversation-id')).toHaveTextContent('none')
      expect(screen.getByTestId('cs-message-count')).toHaveTextContent('0')
      expect(chatSurfaceMountCount).toBeGreaterThan(mountsBefore)
    })
  })

  describe('expand', () => {
    it('pushes to the existing conversation route and closes the panel', async () => {
      getLatestConversationMock.mockResolvedValue({ id: 'conv-1', title: 'Trip planning' })

      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')
      fireEvent.click(screen.getByRole('button', { name: 'Expand to full chat' }))

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith('/chat/conv-1')
      })
      expect(createConversationMock).not.toHaveBeenCalled()
      expect(screen.queryByTestId('chat-surface')).not.toBeInTheDocument()
    })

    it('creates a conversation first when none exists, then pushes and closes', async () => {
      getLatestConversationMock.mockResolvedValue(null)
      createConversationMock.mockResolvedValue({ id: 'created-1' })

      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')
      fireEvent.click(screen.getByRole('button', { name: 'Expand to full chat' }))

      await waitFor(() => {
        expect(createConversationMock).toHaveBeenCalledWith('general')
        expect(pushMock).toHaveBeenCalledWith('/chat/created-1')
      })
      expect(screen.queryByTestId('chat-surface')).not.toBeInTheDocument()
    })
  })

  describe('close', () => {
    it('closes the panel and shows the fab again', async () => {
      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')
      fireEvent.click(screen.getByRole('button', { name: 'Close chat' }))
      expect(screen.queryByTestId('chat-surface')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Open AI assistant' })).toBeInTheDocument()
    })
  })

  describe('open-chat event', () => {
    it('opens the panel and passes detail.prefill through to ChatSurface', async () => {
      render(<ChatPopup />)
      act(() => {
        window.dispatchEvent(
          new CustomEvent('open-chat', { detail: { prefill: 'Reschedule my afternoon' } }),
        )
      })
      await screen.findByTestId('chat-surface')
      expect(screen.getByTestId('cs-prefill')).toHaveTextContent('Reschedule my afternoon')
    })

    it('opens the panel when the event has no detail (null-safe)', async () => {
      render(<ChatPopup />)
      act(() => {
        window.dispatchEvent(new CustomEvent('open-chat'))
      })
      await screen.findByTestId('chat-surface')
      expect(screen.getByTestId('cs-prefill')).toHaveTextContent('none')
    })

    it('adds the listener on mount and removes it on unmount', () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const removeSpy = vi.spyOn(window, 'removeEventListener')

      const { unmount } = render(<ChatPopup />)
      expect(addSpy).toHaveBeenCalledWith('open-chat', expect.any(Function))
      const handler = addSpy.mock.calls.find(([type]) => type === 'open-chat')?.[1]

      unmount()
      expect(removeSpy).toHaveBeenCalledWith('open-chat', handler)

      addSpy.mockRestore()
      removeSpy.mockRestore()
    })
  })

  describe('loading state', () => {
    it('shows a spinner while fetching and hides it once loaded', async () => {
      let resolveLatest: (value: null) => void = () => {}
      getLatestConversationMock.mockReturnValue(
        new Promise<null>((resolve) => {
          resolveLatest = resolve
        }),
      )

      render(<ChatPopup />)
      openFab()

      expect(screen.getByTestId('popup-spinner')).toBeInTheDocument()
      expect(screen.queryByTestId('chat-surface')).not.toBeInTheDocument()

      await act(async () => {
        resolveLatest(null)
      })

      await waitFor(() => {
        expect(screen.queryByTestId('popup-spinner')).not.toBeInTheDocument()
      })
      expect(screen.getByTestId('chat-surface')).toBeInTheDocument()
    })
  })
})
