import * as React from 'react'
import { render, screen, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import { TravelSection } from './travel-section'
import * as placeActions from '@/server/actions/places'
import type { PlaceRow } from '@/lib/schemas/place'

vi.mock('@/server/actions/places', () => ({
  savePlace: vi.fn(),
  deletePlace: vi.fn(),
  setTravelMode: vi.fn(),
}))

vi.mock('@/lib/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ui')>()
  return {
    ...actual,
    Select: ({
      value,
      onValueChange,
      disabled,
      children,
    }: {
      value: string
      onValueChange: (value: string) => void
      disabled?: boolean
      children: React.ReactNode
    }) => (
      <select
        aria-label="Default travel mode"
        value={value}
        disabled={disabled}
        onChange={(e) => onValueChange(e.target.value)}
      >
        {children}
      </select>
    ),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  }
})

function place(overrides: Partial<PlaceRow> = {}): PlaceRow {
  return {
    id: 'place-1',
    userId: 'user-1',
    name: 'Office',
    address: '123 Work Ave',
    lat: 40.7128,
    lng: -74.006,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as PlaceRow
}

function select(): HTMLSelectElement {
  return screen.getByRole('combobox', { name: 'Default travel mode' }) as HTMLSelectElement
}

describe('TravelSection', () => {
  beforeEach(() => {
    vi.mocked(placeActions.savePlace).mockReset()
    vi.mocked(placeActions.deletePlace).mockReset()
    vi.mocked(placeActions.setTravelMode).mockReset()
  })

  describe('locked (free plan)', () => {
    it('renders upsell copy and no form/list interactions', () => {
      render(<TravelSection places={[]} travelMode="driving" locked />)
      expect(screen.getByText(/upgrade/i)).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('passes axe accessibility check', async () => {
      const { container } = render(<TravelSection places={[]} travelMode="driving" locked />)
      expect(await axe(container)).toHaveNoViolations()
    })
  })

  describe('unlocked', () => {
    it('renders the place list with name and address', () => {
      render(
        <TravelSection
          places={[place({ id: 'p1', name: 'Office', address: '123 Work Ave' })]}
          travelMode="driving"
          locked={false}
        />,
      )
      expect(screen.getByText('Office')).toBeInTheDocument()
      expect(screen.getByText('123 Work Ave')).toBeInTheDocument()
    })

    it('renders an add-place form with name and address inputs', () => {
      render(<TravelSection places={[]} travelMode="driving" locked={false} />)
      expect(screen.getByLabelText('Name')).toBeInTheDocument()
      expect(screen.getByLabelText('Address')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add place' })).toBeInTheDocument()
    })

    it('renders a delete button per row', () => {
      render(
        <TravelSection
          places={[place({ id: 'p1', name: 'Office' }), place({ id: 'p2', name: 'Gym' })]}
          travelMode="driving"
          locked={false}
        />,
      )
      expect(screen.getByRole('button', { name: 'Delete Office' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete Gym' })).toBeInTheDocument()
    })

    it('calls deletePlace with the row id when its delete button is clicked', async () => {
      const user = userEvent.setup()
      vi.mocked(placeActions.deletePlace).mockResolvedValueOnce({ ok: true })
      render(
        <TravelSection
          places={[place({ id: 'p1', name: 'Office' })]}
          travelMode="driving"
          locked={false}
        />,
      )
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Delete Office' }))
      })
      expect(placeActions.deletePlace).toHaveBeenCalledWith({ id: 'p1' })
    })

    it('removes the row from the list after a successful delete', async () => {
      const user = userEvent.setup()
      vi.mocked(placeActions.deletePlace).mockResolvedValueOnce({ ok: true })
      render(
        <TravelSection
          places={[place({ id: 'p1', name: 'Office' })]}
          travelMode="driving"
          locked={false}
        />,
      )
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Delete Office' }))
      })
      expect(screen.queryByText('Office')).not.toBeInTheDocument()
    })

    it('sorts a place named "home" (case-insensitive) first', () => {
      render(
        <TravelSection
          places={[
            place({ id: 'p1', name: 'Office', address: '1 Work Way' }),
            place({ id: 'p2', name: 'HOME', address: '2 Home Way' }),
          ]}
          travelMode="driving"
          locked={false}
        />,
      )
      const items = screen.getAllByRole('listitem')
      expect(within(items[0]!).getByText('HOME')).toBeInTheDocument()
    })

    it('shows a pinned "Set your home address" prompt when no home place exists', () => {
      render(
        <TravelSection
          places={[place({ id: 'p1', name: 'Office' })]}
          travelMode="driving"
          locked={false}
        />,
      )
      const items = screen.getAllByRole('listitem')
      expect(within(items[0]!).getByText('Set your home address')).toBeInTheDocument()
    })

    it('does not show the home prompt when a home place exists', () => {
      render(
        <TravelSection
          places={[place({ id: 'p1', name: 'home' })]}
          travelMode="driving"
          locked={false}
        />,
      )
      expect(screen.queryByText('Set your home address')).not.toBeInTheDocument()
    })

    it('saves a new place and shows the resolved address as confirmation', async () => {
      const user = userEvent.setup()
      vi.mocked(placeActions.savePlace).mockResolvedValueOnce({
        ok: true,
        place: place({ id: 'new-1', name: 'Gym', address: '456 Fit St' }),
      })
      render(<TravelSection places={[]} travelMode="driving" locked={false} />)
      await user.type(screen.getByLabelText('Name'), 'Gym')
      await user.type(screen.getByLabelText('Address'), '456 Fit St')
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Add place' }))
      })
      expect(placeActions.savePlace).toHaveBeenCalledWith({ name: 'Gym', address: '456 Fit St' })
      expect(await screen.findByText('Saved: 456 Fit St')).toBeInTheDocument()
    })

    it('surfaces "address not found" inline on geocode failure', async () => {
      const user = userEvent.setup()
      vi.mocked(placeActions.savePlace).mockResolvedValueOnce({
        ok: false,
        error: 'address not found',
      })
      render(<TravelSection places={[]} travelMode="driving" locked={false} />)
      await user.type(screen.getByLabelText('Name'), 'Nowhere')
      await user.type(screen.getByLabelText('Address'), 'asdkjaslkdj')
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Add place' }))
      })
      expect(await screen.findByText('address not found')).toBeInTheDocument()
    })

    it('renders the travel-mode select with the 4 modes and the current value', () => {
      render(<TravelSection places={[]} travelMode="walking" locked={false} />)
      expect(select().value).toBe('walking')
      expect(screen.getByRole('option', { name: 'Driving' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Walking' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Bicycling' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Transit' })).toBeInTheDocument()
    })

    it('calls setTravelMode when the travel mode select changes', async () => {
      const user = userEvent.setup()
      vi.mocked(placeActions.setTravelMode).mockResolvedValueOnce({ ok: true })
      render(<TravelSection places={[]} travelMode="driving" locked={false} />)
      await act(async () => {
        await user.selectOptions(select(), 'transit')
      })
      expect(placeActions.setTravelMode).toHaveBeenCalledWith({ travelMode: 'transit' })
    })

    it('passes axe accessibility check', async () => {
      const { container } = render(
        <TravelSection
          places={[place({ id: 'p1', name: 'home' })]}
          travelMode="driving"
          locked={false}
        />,
      )
      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
