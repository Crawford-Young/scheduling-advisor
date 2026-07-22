import * as React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ChatPopup } from './chat-popup'

interface MockConversation {
  readonly id: string
  readonly title: string | null
}

interface MockProposal {
  readonly toolCallId: string
  readonly title: string
  readonly date: string
  readonly start: string
  readonly end: string
}

interface MockChatSurfaceProps {
  readonly conversation: MockConversation | null
  readonly initialMessages: readonly { readonly id: string }[]
  readonly initialTokenBalance: number
  readonly prefill?: string
  readonly onEnsureConversation?: () => Promise<{ id: string }>
  readonly onEventProposed?: (proposal: MockProposal) => void
  readonly onEventResolved?: (toolCallId: string, outcome: 'confirmed' | 'denied') => void
  readonly inlineDayPreview?: boolean
}

const PROPOSAL_A: MockProposal = {
  toolCallId: 'call-a',
  title: 'Dentist',
  date: '2026-06-03',
  start: '14:00',
  end: '15:00',
}
const PROPOSAL_B: MockProposal = {
  toolCallId: 'call-b',
  title: 'Standup',
  date: '2026-06-04',
  start: '09:00',
  end: '09:15',
}

let chatSurfaceMountCount = 0

vi.mock('@/components/chat/chat-surface', () => ({
  ChatSurface: ({
    conversation,
    initialMessages,
    initialTokenBalance,
    prefill,
    onEnsureConversation,
    onEventProposed,
    onEventResolved,
    inlineDayPreview,
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
        <span data-testid="cs-inline-preview">{String(inlineDayPreview)}</span>
        <button onClick={() => void onEnsureConversation?.()}>ensure</button>
        <button onClick={() => onEventProposed?.(PROPOSAL_A)}>propose-a</button>
        <button onClick={() => onEventProposed?.(PROPOSAL_B)}>propose-b</button>
        <button onClick={() => onEventResolved?.('call-a', 'confirmed')}>resolve-a</button>
      </div>
    )
  },
}))

// ChatFab and ChatPanel are used FOR REAL here (not mocked) -- the tests
// below assert actual library-rendered structure (aside/testid/role passthrough,
// close-button copy, backdrop absence, position class), which a mock would hide.
vi.mock('@/lib/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ui')>()
  return {
    ...actual,
    Button: ({ children, onClick, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button onClick={onClick} {...rest}>
        {children}
      </button>
    ),
    Spinner: () => <div data-testid="popup-spinner">loading</div>,
  }
})

vi.mock('@/components/chat/model-tier-select', () => ({
  ModelTierSelect: ({ value, onChange }: { value: string; onChange: (tier: string) => void }) => (
    <div>
      <span data-testid="popup-model-value">{value}</span>
      <button data-testid="popup-model-opus" onClick={() => onChange('opus')}>
        pick opus
      </button>
    </div>
  ),
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
const setConversationModelMock = vi.fn()

vi.mock('@/server/actions/conversations', () => ({
  getLatestConversation: () => getLatestConversationMock(),
  getConversationMessagesAction: (id: string) => getConversationMessagesActionMock(id),
  createConversation: (type: string, model?: string) => createConversationMock(type, model),
  setConversationModel: (id: string, model: string) => setConversationModelMock(id, model),
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
    setConversationModelMock.mockReset().mockResolvedValue(undefined)
    getTokenBalanceActionMock.mockReset().mockResolvedValue(50)
    window.localStorage.clear()
    window.sessionStorage.clear()
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
      expect(screen.getByRole('button', { name: 'Close panel' })).toBeInTheDocument()

      await screen.findByTestId('chat-surface')
    })

    it('renders non-modal, with no backdrop, so the rest of the page stays interactive', async () => {
      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')

      expect(document.querySelector('.backdrop-blur-sm')).toBeNull()
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

    it('enables the inline day preview on its ChatSurface', async () => {
      getLatestConversationMock.mockResolvedValue(null)

      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')

      expect(screen.getByTestId('cs-inline-preview')).toHaveTextContent('true')
    })

    it('re-seeds the conversation after onEnsureConversation lazily creates one, so auto-title can fire', async () => {
      getLatestConversationMock.mockResolvedValue(null)
      createConversationMock.mockResolvedValue({ id: 'lazy-1' })

      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')

      fireEvent.click(screen.getByRole('button', { name: 'ensure' }))

      await waitFor(() => {
        expect(createConversationMock).toHaveBeenCalledWith('general', 'sonnet')
      })
      await waitFor(() => {
        expect(screen.getByTestId('cs-conversation-id')).toHaveTextContent('lazy-1')
      })
    })
  })

  describe('reopen', () => {
    it('reloads latest conversation on reopen', async () => {
      getLatestConversationMock.mockResolvedValueOnce({ id: 'conv-1', title: 'Trip planning' })
      getConversationMessagesActionMock.mockResolvedValueOnce([
        { id: 'm1', role: 'user', content: 'hi' },
      ])
      getTokenBalanceActionMock.mockResolvedValueOnce(42)

      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')
      expect(screen.getByTestId('cs-conversation-id')).toHaveTextContent('conv-1')
      expect(screen.getByTestId('cs-message-count')).toHaveTextContent('1')

      fireEvent.click(screen.getByRole('button', { name: 'Close panel' }))

      getLatestConversationMock.mockResolvedValueOnce({ id: 'conv-2', title: 'Updated title' })
      getConversationMessagesActionMock.mockResolvedValueOnce([
        { id: 'm1', role: 'user', content: 'hi' },
        { id: 'm2', role: 'assistant', content: 'hello' },
        { id: 'm3', role: 'user', content: 'more' },
      ])
      getTokenBalanceActionMock.mockResolvedValueOnce(30)

      openFab()
      await waitFor(() => {
        expect(screen.getByTestId('cs-conversation-id')).toHaveTextContent('conv-2')
      })
      expect(screen.getByTestId('cs-message-count')).toHaveTextContent('3')
      expect(screen.getByTestId('chat-popup-title')).toHaveTextContent('Updated title')
      expect(getLatestConversationMock).toHaveBeenCalledTimes(2)
      expect(getConversationMessagesActionMock).toHaveBeenCalledTimes(2)
    })

    it('does not reload when open-chat fires while the panel is already open', async () => {
      getLatestConversationMock.mockResolvedValue({ id: 'conv-1', title: 'Trip planning' })

      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')
      expect(getLatestConversationMock).toHaveBeenCalledTimes(1)

      act(() => {
        window.dispatchEvent(new CustomEvent('open-chat', { detail: { prefill: 'while open' } }))
      })

      await waitFor(() => {
        expect(screen.getByTestId('cs-prefill')).toHaveTextContent('while open')
      })
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
        expect(createConversationMock).toHaveBeenCalledWith('general', 'sonnet')
        expect(pushMock).toHaveBeenCalledWith('/chat/created-1')
      })
      expect(screen.queryByTestId('chat-surface')).not.toBeInTheDocument()
    })
  })

  describe('expand handoff of pending proposals', () => {
    const KEY_CONV_1 = 'chat-pending-proposals:conv-1'

    async function openWithConversation(): Promise<void> {
      getLatestConversationMock.mockResolvedValue({ id: 'conv-1', title: 'Trip planning' })
      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')
    }

    it('writes the pending proposal to sessionStorage under the conversation id on expand', async () => {
      await openWithConversation()

      fireEvent.click(screen.getByRole('button', { name: 'propose-a' }))
      fireEvent.click(screen.getByRole('button', { name: 'Expand to full chat' }))

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith('/chat/conv-1')
      })
      expect(JSON.parse(window.sessionStorage.getItem(KEY_CONV_1) as string)).toEqual([PROPOSAL_A])
    })

    it('carries every still-pending proposal', async () => {
      await openWithConversation()

      fireEvent.click(screen.getByRole('button', { name: 'propose-a' }))
      fireEvent.click(screen.getByRole('button', { name: 'propose-b' }))
      fireEvent.click(screen.getByRole('button', { name: 'Expand to full chat' }))

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalled()
      })
      expect(JSON.parse(window.sessionStorage.getItem(KEY_CONV_1) as string)).toEqual([
        PROPOSAL_A,
        PROPOSAL_B,
      ])
    })

    it('does not carry a proposal resolved before expand', async () => {
      await openWithConversation()

      fireEvent.click(screen.getByRole('button', { name: 'propose-a' }))
      fireEvent.click(screen.getByRole('button', { name: 'propose-b' }))
      fireEvent.click(screen.getByRole('button', { name: 'resolve-a' }))
      fireEvent.click(screen.getByRole('button', { name: 'Expand to full chat' }))

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalled()
      })
      expect(JSON.parse(window.sessionStorage.getItem(KEY_CONV_1) as string)).toEqual([PROPOSAL_B])
    })

    it('writes nothing when no proposal is pending', async () => {
      await openWithConversation()

      fireEvent.click(screen.getByRole('button', { name: 'Expand to full chat' }))

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalled()
      })
      expect(window.sessionStorage.getItem(KEY_CONV_1)).toBeNull()
    })

    it('clears the pending set on New chat, so a later expand writes nothing', async () => {
      await openWithConversation()

      fireEvent.click(screen.getByRole('button', { name: 'propose-a' }))
      fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
      // New chat drops the conversation; expand lazily creates 'new-conv'.
      fireEvent.click(screen.getByRole('button', { name: 'Expand to full chat' }))

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith('/chat/new-conv')
      })
      expect(window.sessionStorage.getItem('chat-pending-proposals:new-conv')).toBeNull()
      expect(window.sessionStorage.getItem(KEY_CONV_1)).toBeNull()
    })
  })

  describe('close', () => {
    it('closes the panel and shows the fab again', async () => {
      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')
      fireEvent.click(screen.getByRole('button', { name: 'Close panel' }))
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

  describe('model tier', () => {
    it('seeds the model selector from the latest conversation model', async () => {
      getLatestConversationMock.mockResolvedValue({
        id: 'conv-1',
        title: 'Trip planning',
        model: 'opus',
      })

      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')

      expect(screen.getByTestId('popup-model-value')).toHaveTextContent('opus')
    })

    it('defaults the model selector to sonnet when no conversation exists', async () => {
      getLatestConversationMock.mockResolvedValue(null)

      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')

      expect(screen.getByTestId('popup-model-value')).toHaveTextContent('sonnet')
    })

    it('persists the model via setConversationModel when a conversation exists', async () => {
      getLatestConversationMock.mockResolvedValue({
        id: 'conv-1',
        title: 'Trip planning',
        model: 'sonnet',
      })

      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')

      fireEvent.click(screen.getByTestId('popup-model-opus'))

      expect(screen.getByTestId('popup-model-value')).toHaveTextContent('opus')
      await waitFor(() => {
        expect(setConversationModelMock).toHaveBeenCalledWith('conv-1', 'opus')
      })
    })

    it('updates local state only pre-create, then bills the first send at that tier', async () => {
      getLatestConversationMock.mockResolvedValue(null)
      createConversationMock.mockResolvedValue({ id: 'lazy-1' })

      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')

      fireEvent.click(screen.getByTestId('popup-model-opus'))
      expect(screen.getByTestId('popup-model-value')).toHaveTextContent('opus')
      expect(setConversationModelMock).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'ensure' }))

      await waitFor(() => {
        expect(createConversationMock).toHaveBeenCalledWith('general', 'opus')
      })
    })

    it('passes the selected tier when expand lazily creates a conversation', async () => {
      getLatestConversationMock.mockResolvedValue(null)
      createConversationMock.mockResolvedValue({ id: 'created-1' })

      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')

      fireEvent.click(screen.getByTestId('popup-model-opus'))
      fireEvent.click(screen.getByRole('button', { name: 'Expand to full chat' }))

      await waitFor(() => {
        expect(createConversationMock).toHaveBeenCalledWith('general', 'opus')
      })
    })

    it('normalizes a legacy haiku conversation model to sonnet', async () => {
      getLatestConversationMock.mockResolvedValue({
        id: 'conv-1',
        title: 'Legacy chat',
        model: 'haiku',
      })

      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')

      expect(screen.getByTestId('popup-model-value')).toHaveTextContent('sonnet')
    })

    it('re-seeds the model from a fresh load on reopen', async () => {
      getLatestConversationMock.mockResolvedValueOnce({
        id: 'conv-1',
        title: 'Trip planning',
        model: 'sonnet',
      })

      render(<ChatPopup />)
      openFab()
      await screen.findByTestId('chat-surface')
      expect(screen.getByTestId('popup-model-value')).toHaveTextContent('sonnet')

      fireEvent.click(screen.getByRole('button', { name: 'Close panel' }))

      getLatestConversationMock.mockResolvedValueOnce({
        id: 'conv-2',
        title: 'Updated title',
        model: 'opus',
      })

      openFab()
      await waitFor(() => {
        expect(screen.getByTestId('popup-model-value')).toHaveTextContent('opus')
      })
    })
  })

  describe('fab drag position', () => {
    const FAB_DEFAULT_X = 944
    const FAB_DEFAULT_Y = 688
    const SUB_THRESHOLD_X = 946
    const PAST_THRESHOLD_X = 500
    const PAST_THRESHOLD_Y = 400

    function fabWrapper(): HTMLElement {
      return screen.getByTestId('chat-fab-wrapper')
    }

    it('opens the panel when a sub-threshold pointer release is followed by the browser click', async () => {
      render(<ChatPopup />)
      fireEvent.pointerDown(fabWrapper(), {
        clientX: FAB_DEFAULT_X,
        clientY: FAB_DEFAULT_Y,
        pointerId: 1,
      })
      fireEvent.pointerMove(fabWrapper(), {
        clientX: SUB_THRESHOLD_X,
        clientY: FAB_DEFAULT_Y,
        pointerId: 1,
      })
      fireEvent.pointerUp(fabWrapper(), {
        clientX: SUB_THRESHOLD_X,
        clientY: FAB_DEFAULT_Y,
        pointerId: 1,
      })
      // Real browsers always fire a trailing `click` after pointerup; jsdom/happy-dom do not
      // synthesize it automatically, so the test dispatches it explicitly.
      fireEvent.click(screen.getByRole('button', { name: 'Open AI assistant' }))

      await screen.findByTestId('chat-surface')
    })

    it('does not open the panel when the trailing click follows a past-threshold drag', () => {
      render(<ChatPopup />)
      fireEvent.pointerDown(fabWrapper(), {
        clientX: FAB_DEFAULT_X,
        clientY: FAB_DEFAULT_Y,
        pointerId: 1,
      })
      fireEvent.pointerMove(fabWrapper(), {
        clientX: PAST_THRESHOLD_X,
        clientY: PAST_THRESHOLD_Y,
        pointerId: 1,
      })
      fireEvent.pointerUp(fabWrapper(), {
        clientX: PAST_THRESHOLD_X,
        clientY: PAST_THRESHOLD_Y,
        pointerId: 1,
      })
      fireEvent.click(screen.getByRole('button', { name: 'Open AI assistant' }))

      expect(screen.queryByTestId('chat-surface')).not.toBeInTheDocument()
    })

    it('keeps the default (no inline style) fab wrapper placement when no position is stored', () => {
      render(<ChatPopup />)
      expect(fabWrapper().style.left).toBe('')
      expect(fabWrapper().style.top).toBe('')
    })

    it('gives the fab a fixed position class when no position is stored', () => {
      render(<ChatPopup />)
      const fab = screen.getByRole('button', { name: 'Open AI assistant' })
      expect(fab).toHaveClass('fixed')
      expect(fab).not.toHaveClass('static')
    })

    it('gives the fab a static position class when a fab position is persisted', () => {
      window.localStorage.setItem('chat-fab-position', JSON.stringify({ edge: 'left', offset: 0 }))
      render(<ChatPopup />)
      const fab = screen.getByRole('button', { name: 'Open AI assistant' })
      expect(fab).toHaveClass('static')
      expect(fab).not.toHaveClass('fixed')
    })

    it('positions the fab wrapper from a persisted localStorage position', () => {
      window.localStorage.setItem('chat-fab-position', JSON.stringify({ edge: 'left', offset: 0 }))
      render(<ChatPopup />)
      // Left boundary = bar gap (no sidebar in the test DOM); top clears the topbar.
      expect(fabWrapper()).toHaveStyle({ position: 'fixed', left: '8px', top: '56px' })
    })

    it('keeps the default class-based right-6 bottom-6 panel placement when no position is stored', async () => {
      render(<ChatPopup />)
      openFab()
      const panel = await screen.findByTestId('chat-popup-panel')
      expect(panel).toHaveClass('right-6')
      expect(panel).toHaveClass('bottom-6')
      expect(panel.style.left).toBe('')
      expect(panel.style.top).toBe('')
    })

    it('anchors the open panel from a persisted fab position', async () => {
      window.localStorage.setItem('chat-fab-position', JSON.stringify({ edge: 'left', offset: 0 }))
      render(<ChatPopup />)
      openFab()
      const panel = await screen.findByTestId('chat-popup-panel')
      // Top-left anchored panel sits just clear of the topbar, never under it.
      expect(panel).toHaveStyle({ position: 'fixed', left: '8px', top: '56px' })
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
