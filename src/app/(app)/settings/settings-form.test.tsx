import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SettingsForm } from './settings-form'
import * as profileActions from '@/server/actions/profile'

vi.mock('@/server/actions/profile', () => ({
  setUsername: vi.fn(),
}))

describe('SettingsForm', () => {
  beforeEach(() => {
    vi.mocked(profileActions.setUsername).mockReset()
  })

  it('renders the initial username value', () => {
    render(<SettingsForm initialUsername="crawford_young" />)
    expect(screen.getByDisplayValue('crawford_young')).toBeInTheDocument()
  })

  it('renders empty input when initialUsername is empty', () => {
    render(<SettingsForm initialUsername="" />)
    const input = screen.getByPlaceholderText('your_username')
    expect(input).toHaveValue('')
  })

  it('save button is disabled when value equals initialUsername', () => {
    render(<SettingsForm initialUsername="same_name" />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('save button becomes enabled after typing a new value', async () => {
    const user = userEvent.setup()
    render(<SettingsForm initialUsername="old_name" />)
    const input = screen.getByDisplayValue('old_name')
    await user.clear(input)
    await user.type(input, 'new_name')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('calls setUsername with the current input value when save is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(profileActions.setUsername).mockResolvedValueOnce(undefined)
    render(<SettingsForm initialUsername="old_name" />)
    const input = screen.getByDisplayValue('old_name')
    await user.clear(input)
    await user.type(input, 'new_name')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(profileActions.setUsername).toHaveBeenCalledWith('new_name')
  })

  it('shows success message after successful save', async () => {
    const user = userEvent.setup()
    vi.mocked(profileActions.setUsername).mockResolvedValueOnce(undefined)
    render(<SettingsForm initialUsername="old_name" />)
    const input = screen.getByDisplayValue('old_name')
    await user.clear(input)
    await user.type(input, 'new_name')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(await screen.findByText('Username saved.')).toBeInTheDocument()
  })

  it('shows error message when setUsername rejects', async () => {
    const user = userEvent.setup()
    vi.mocked(profileActions.setUsername).mockRejectedValueOnce(new Error('taken'))
    render(<SettingsForm initialUsername="old_name" />)
    const input = screen.getByDisplayValue('old_name')
    await user.clear(input)
    await user.type(input, 'bad_name')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(await screen.findByText('Invalid or taken username — try another.')).toBeInTheDocument()
  })
})
