import * as React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Message } from 'ai'
import { QuickScheduleInput } from '@/components/chat/quick-schedule-input'

const appendMock = vi.fn()
const setMessagesMock = vi.fn()
const pathnameMock = vi.fn(() => '/calendar')

let capturedUseChatOptions:
  | {
      id?: string
      api?: string
      body?: Record<string, unknown>
      onFinish?: (message: Message, options: unknown) => void
    }
  | undefined

let messagesState: Message[] = []
let errorState: Error | undefined
const reloadMock = vi.fn()

vi.mock('ai/react', () => ({
  useChat: (
    options: {
      id?: string
      api?: string
      body?: Record<string, unknown>
      onFinish?: (message: Message, options: unknown) => void
    } = {},
  ) => {
    capturedUseChatOptions = options
    return {
      messages: messagesState,
      append: appendMock,
      setMessages: setMessagesMock,
      error: errorState,
      reload: reloadMock,
    }
  },
}))

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}))

vi.mock('@/lib/ui', () => ({
  Input: ({ ...rest }: React.InputHTMLAttributes<HTMLInputElement>) => <input {...rest} />,
  Button: ({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
}))

vi.mock('@/components/chat/tool-result-renderer', () => ({
  ToolResultRenderer: ({
    toolInvocation,
    append,
  }: {
    toolInvocation: { toolName: string; result: unknown }
    append?: (message: { role: string; content: string }) => void
  }) => (
    <div data-testid="tool-result">
      <span data-testid="tool-name">{toolInvocation.toolName}</span>
      <span data-testid="tool-result-data">{JSON.stringify(toolInvocation.result)}</span>
      <button onClick={() => append?.({ role: 'user', content: '[CONFIRM] test' })}>confirm</button>
    </div>
  ),
}))

function resultInvocation(
  toolName: string,
  result: unknown,
): {
  toolCallId: string
  toolName: string
  args: Record<string, never>
  state: 'result'
  result: unknown
} {
  return { toolCallId: `${toolName}-1`, toolName, args: {}, state: 'result', result }
}

describe('QuickScheduleInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pathnameMock.mockReturnValue('/calendar')
    messagesState = []
    errorState = undefined
    capturedUseChatOptions = undefined
  })

  it('renders the quick-add input with the expected placeholder', () => {
    render(<QuickScheduleInput />)
    expect(screen.getByPlaceholderText('Quick add — "dinner Fri 7pm"')).toBeInTheDocument()
  })

  it('renders a submit control', () => {
    render(<QuickScheduleInput />)
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })

  it('configures useChat with the quick-schedule mode, no conversationId, and a fresh id', () => {
    render(<QuickScheduleInput />)
    expect(capturedUseChatOptions?.api).toBe('/api/chat')
    expect(capturedUseChatOptions?.body).toEqual({ mode: 'quick-schedule' })
    expect(capturedUseChatOptions?.body).not.toHaveProperty('conversationId')
    expect(typeof capturedUseChatOptions?.id).toBe('string')
    expect(capturedUseChatOptions?.id).not.toHaveLength(0)
  })

  it('calls append with the typed text on submit', () => {
    render(<QuickScheduleInput />)
    const input = screen.getByPlaceholderText('Quick add — "dinner Fri 7pm"')
    fireEvent.change(input, { target: { value: 'dinner Fri 7pm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(appendMock).toHaveBeenCalledWith({ role: 'user', content: 'dinner Fri 7pm' })
  })

  it('clears the input value after submit', () => {
    render(<QuickScheduleInput />)
    const input = screen.getByPlaceholderText('Quick add — "dinner Fri 7pm"') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'dinner Fri 7pm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(input.value).toBe('')
  })

  it('does not call append when the input is blank, even on a direct form submit', () => {
    const { container } = render(<QuickScheduleInput />)
    const form = container.querySelector('form') as HTMLFormElement
    fireEvent.submit(form)
    expect(appendMock).not.toHaveBeenCalled()
  })

  it('does not call append when the input is only whitespace, even on a direct form submit', () => {
    const { container } = render(<QuickScheduleInput />)
    const input = screen.getByPlaceholderText('Quick add — "dinner Fri 7pm"')
    fireEvent.change(input, { target: { value: '   ' } })
    const form = container.querySelector('form') as HTMLFormElement
    fireEvent.submit(form)
    expect(appendMock).not.toHaveBeenCalled()
  })

  it('dispatches token-balance-changed on finish', () => {
    const listener = vi.fn()
    window.addEventListener('token-balance-changed', listener)
    render(<QuickScheduleInput />)
    act(() => {
      capturedUseChatOptions?.onFinish?.({ id: 'm1', role: 'assistant', content: '' }, {})
    })
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener('token-balance-changed', listener)
  })

  it('renders a proposeAction tool invocation through ToolResultRenderer with its data', () => {
    messagesState = [
      {
        id: '1',
        role: 'assistant',
        content: '',
        toolInvocations: [
          resultInvocation('proposeAction', {
            action: 'Add dinner',
            entityType: 'event',
            date: '2026-07-10',
            time: '19:00',
          }),
        ],
      },
    ]
    render(<QuickScheduleInput />)
    expect(screen.getByTestId('tool-name')).toHaveTextContent('proposeAction')
    expect(screen.getByTestId('tool-result-data')).toHaveTextContent('Add dinner')
    expect(screen.getByTestId('tool-result-data')).toHaveTextContent('2026-07-10')
  })

  it('passes append through to ToolResultRenderer for confirm/deny wiring', () => {
    messagesState = [
      {
        id: '1',
        role: 'assistant',
        content: '',
        toolInvocations: [resultInvocation('proposeAction', { action: 'Add dinner' })],
      },
    ]
    render(<QuickScheduleInput />)
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }))
    expect(appendMock).toHaveBeenCalledWith({ role: 'user', content: '[CONFIRM] test' })
  })

  it('shows a success state after a createCalendarEvent tool result appears', () => {
    messagesState = [
      {
        id: '1',
        role: 'assistant',
        content: '',
        toolInvocations: [resultInvocation('createCalendarEvent', { id: 'evt-1' })],
      },
    ]
    render(<QuickScheduleInput />)
    expect(screen.getByText(/added/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add another' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Quick add — "dinner Fri 7pm"')).not.toBeInTheDocument()
  })

  it('shows a success state after a createTask tool result appears', () => {
    messagesState = [
      {
        id: '1',
        role: 'assistant',
        content: '',
        toolInvocations: [resultInvocation('createTask', { id: 'task-1' })],
      },
    ]
    render(<QuickScheduleInput />)
    expect(screen.getByText(/added/i)).toBeInTheDocument()
  })

  it('reset clears the transcript via setMessages([]) and restores the input form', () => {
    messagesState = [
      {
        id: '1',
        role: 'assistant',
        content: '',
        toolInvocations: [resultInvocation('createTask', { id: 'task-1' })],
      },
    ]
    render(<QuickScheduleInput />)
    fireEvent.click(screen.getByRole('button', { name: 'Add another' }))
    expect(setMessagesMock).toHaveBeenCalledWith([])
  })

  it('blocks further submission once the transcript reaches the 6-message cap', () => {
    messagesState = [
      { id: '1', role: 'user', content: 'a' },
      { id: '2', role: 'assistant', content: 'b' },
      { id: '3', role: 'user', content: 'c' },
      { id: '4', role: 'assistant', content: 'd' },
      { id: '5', role: 'user', content: 'e' },
      { id: '6', role: 'assistant', content: 'f' },
    ]
    const { container } = render(<QuickScheduleInput />)
    const input = screen.getByPlaceholderText('Quick add — "dinner Fri 7pm"') as HTMLInputElement
    expect(input).toBeDisabled()
    const form = container.querySelector('form') as HTMLFormElement
    fireEvent.submit(form)
    expect(appendMock).not.toHaveBeenCalled()
  })

  it('offers a reset once the transcript is at capacity', () => {
    messagesState = [
      { id: '1', role: 'user', content: 'a' },
      { id: '2', role: 'assistant', content: 'b' },
      { id: '3', role: 'user', content: 'c' },
      { id: '4', role: 'assistant', content: 'd' },
      { id: '5', role: 'user', content: 'e' },
      { id: '6', role: 'assistant', content: 'f' },
    ]
    render(<QuickScheduleInput />)
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(setMessagesMock).toHaveBeenCalledWith([])
  })

  it('renders nothing on the /chat route', () => {
    pathnameMock.mockReturnValue('/chat')
    const { container } = render(<QuickScheduleInput />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing on a /chat/<conversationId> route', () => {
    pathnameMock.mockReturnValue('/chat/9f1c2b3a-1111-2222-3333-444455556666')
    const { container } = render(<QuickScheduleInput />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders normally on other routes', () => {
    pathnameMock.mockReturnValue('/activities')
    render(<QuickScheduleInput />)
    expect(screen.getByPlaceholderText('Quick add — "dinner Fri 7pm"')).toBeInTheDocument()
  })

  describe('error state', () => {
    it('renders the error message and a Retry button when useChat reports an error', () => {
      errorState = new Error('boom')
      render(<QuickScheduleInput />)
      expect(screen.getByText("Cy couldn't respond. Try again.")).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    })

    it('calls reload once when Retry is clicked', () => {
      errorState = new Error('boom')
      render(<QuickScheduleInput />)
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(reloadMock).toHaveBeenCalledTimes(1)
    })

    it('does not render error UI when there is no error', () => {
      render(<QuickScheduleInput />)
      expect(screen.queryByText("Cy couldn't respond. Try again.")).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    })

    it('error takes precedence over the success state', () => {
      errorState = new Error('boom')
      messagesState = [
        {
          id: '1',
          role: 'assistant',
          content: '',
          toolInvocations: [resultInvocation('createTask', { id: 'task-1' })],
        },
      ]
      render(<QuickScheduleInput />)
      expect(screen.getByText("Cy couldn't respond. Try again.")).toBeInTheDocument()
      expect(screen.queryByText(/added/i)).not.toBeInTheDocument()
    })

    it('still allows typing and submitting again after an error is shown', () => {
      errorState = new Error('boom')
      render(<QuickScheduleInput />)
      const input = screen.getByPlaceholderText('Quick add — "dinner Fri 7pm"') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'dinner Fri 7pm' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      expect(appendMock).toHaveBeenCalledWith({ role: 'user', content: 'dinner Fri 7pm' })
    })
  })
})
