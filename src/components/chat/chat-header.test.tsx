import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChatHeader } from './chat-header'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('./model-tier-select', () => ({
  ModelTierSelect: ({ value, onChange }: { value: string; onChange: (tier: string) => void }) => (
    <button data-testid="model-tier-select" data-value={value} onClick={() => onChange('opus')}>
      model:{value}
    </button>
  ),
}))

const baseProps = {
  onBack: () => {},
  model: 'sonnet' as const,
  onModelChange: () => {},
}

describe('ChatHeader', () => {
  it('renders conversation title', () => {
    render(<ChatHeader title="My chat" {...baseProps} />)
    expect(screen.getByText('My chat')).toBeInTheDocument()
  })

  it('renders Untitled when title is null', () => {
    render(<ChatHeader title={null} {...baseProps} />)
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })

  it('calls onBack when back button clicked', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<ChatHeader title="Chat" {...baseProps} onBack={onBack} />)
    await user.click(screen.getByRole('button', { name: 'Back to reflections' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('does not render a token chip', () => {
    render(<ChatHeader title="Chat" {...baseProps} />)
    expect(screen.queryByLabelText(/token balance/i)).not.toBeInTheDocument()
  })

  it('shows the full title in a tooltip on hover', async () => {
    const user = userEvent.setup()
    const longTitle =
      'An extremely long conversation title that would otherwise overflow the header bar entirely'
    render(<ChatHeader title={longTitle} {...baseProps} />)
    await user.hover(screen.getByText(longTitle))
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(longTitle)
  })

  it('truncates the title with a flexible width instead of a fixed max-width', () => {
    render(<ChatHeader title="Chat" {...baseProps} />)
    const titleEl = screen.getByText('Chat')
    expect(titleEl.className).toContain('truncate')
    expect(titleEl.className).not.toContain('max-w-xs')
  })

  it('renders the model selector seeded with the current model', () => {
    render(<ChatHeader title="Chat" {...baseProps} model="opus" />)
    expect(screen.getByTestId('model-tier-select')).toHaveAttribute('data-value', 'opus')
  })

  it('calls onModelChange when the model selector changes', async () => {
    const user = userEvent.setup()
    const onModelChange = vi.fn()
    render(<ChatHeader title="Chat" {...baseProps} onModelChange={onModelChange} />)
    await user.click(screen.getByTestId('model-tier-select'))
    expect(onModelChange).toHaveBeenCalledWith('opus')
  })
})
