import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { UpgradeBanners } from '@/components/upgrade/upgrade-banners'

describe('UpgradeBanners', () => {
  it('shows success banner when success=true', () => {
    render(<UpgradeBanners success canceled={false} />)
    expect(screen.getByText(/now on Pro/)).toBeInTheDocument()
  })

  it('shows canceled banner when canceled=true', () => {
    render(<UpgradeBanners success={false} canceled />)
    expect(screen.getByText(/Upgrade canceled/)).toBeInTheDocument()
  })

  it('dismisses canceled banner on X click', async () => {
    render(<UpgradeBanners success={false} canceled />)
    await userEvent.click(screen.getByLabelText('Dismiss'))
    expect(screen.queryByText(/Upgrade canceled/)).not.toBeInTheDocument()
  })

  it('success banner has no dismiss button', () => {
    render(<UpgradeBanners success canceled={false} />)
    expect(screen.queryByLabelText('Dismiss')).not.toBeInTheDocument()
  })

  it('renders nothing when both false', () => {
    const { container } = render(<UpgradeBanners success={false} canceled={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('passes axe accessibility check', async () => {
    const { container } = render(<UpgradeBanners success canceled={false} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
