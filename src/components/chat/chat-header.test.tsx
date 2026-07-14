import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChatHeader } from './chat-header'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

describe('ChatHeader', () => {
  it('renders conversation title', () => {
    render(<ChatHeader title="My chat" onBack={() => {}} />)
    expect(screen.getByText('My chat')).toBeInTheDocument()
  })

  it('renders Untitled when title is null', () => {
    render(<ChatHeader title={null} onBack={() => {}} />)
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })

  it('calls onBack when back button clicked', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<ChatHeader title="Chat" onBack={onBack} />)
    await user.click(screen.getByRole('button', { name: 'Back to reflections' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('does not render a token chip', () => {
    render(<ChatHeader title="Chat" onBack={() => {}} />)
    expect(screen.queryByLabelText(/token balance/i)).not.toBeInTheDocument()
  })

  it('shows the full title in a tooltip on hover', async () => {
    const user = userEvent.setup()
    const longTitle =
      'An extremely long conversation title that would otherwise overflow the header bar entirely'
    render(<ChatHeader title={longTitle} onBack={() => {}} />)
    await user.hover(screen.getByText(longTitle))
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(longTitle)
  })

  it('truncates the title with a flexible width instead of a fixed max-width', () => {
    render(<ChatHeader title="Chat" onBack={() => {}} />)
    const titleEl = screen.getByText('Chat')
    expect(titleEl.className).toContain('truncate')
    expect(titleEl.className).not.toContain('max-w-xs')
  })
})
