import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OpenChatButton } from './open-chat-button'

vi.mock('@/lib/ui', () => ({
  Button: ({ children, onClick, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}))

describe('OpenChatButton', () => {
  it('renders label', () => {
    render(<OpenChatButton label="Ask AI" />)
    expect(screen.getByRole('button', { name: 'Ask AI' })).toBeInTheDocument()
  })

  it('dispatches open-chat event on click', () => {
    const listener = vi.fn()
    window.addEventListener('open-chat', listener)
    render(<OpenChatButton label="Ask AI" />)
    fireEvent.click(screen.getByRole('button'))
    expect(listener).toHaveBeenCalled()
    window.removeEventListener('open-chat', listener)
  })
})
