import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockConnect = vi.hoisted(() => vi.fn())
const mockDisconnect = vi.hoisted(() => vi.fn())
vi.mock('@/server/actions/google-calendar', () => ({
  connectGoogleCalendar: mockConnect,
  disconnectGoogleCalendar: mockDisconnect,
}))
const mockRefresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

import { IntegrationsSection } from '@/app/(app)/settings/integrations-section'

describe('IntegrationsSection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('not_connected: shows status + Connect button, fires connect action with /settings', async () => {
    render(<IntegrationsSection status="not_connected" />)
    expect(screen.getByText('Not connected')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Cy uses your Google Calendar to check availability and add accepted events.',
      ),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }))
    expect(mockConnect).toHaveBeenCalledWith('/settings')
  })

  it('connected: shows status + Disconnect button, fires disconnect then refresh', async () => {
    mockDisconnect.mockResolvedValue(undefined)
    render(<IntegrationsSection status="connected" />)
    expect(screen.getByText('Connected')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(mockDisconnect).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('axe clean', async () => {
    const { container } = render(<IntegrationsSection status="connected" />)
    const { axe } = await import('jest-axe')
    expect(await axe(container)).toHaveNoViolations()
  })
})
