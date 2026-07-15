import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ProfileSection } from './profile-section'
import * as profileActions from '@/server/actions/profile'

vi.mock('@/server/actions/profile', () => ({
  updateProfile: vi.fn(),
  setUsername: vi.fn(),
}))

describe('ProfileSection', () => {
  beforeEach(() => {
    vi.mocked(profileActions.updateProfile).mockReset()
    vi.mocked(profileActions.setUsername).mockReset()
  })

  it('renders initial name, bio, and username values', () => {
    render(
      <ProfileSection
        initialName="Crawford Young"
        initialBio="Hello there"
        initialUsername="crawford_young"
      />,
    )
    expect(screen.getByDisplayValue('Crawford Young')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Hello there')).toBeInTheDocument()
    expect(screen.getByDisplayValue('crawford_young')).toBeInTheDocument()
  })

  it('bio character count reflects the initial bio length', () => {
    render(
      <ProfileSection
        initialName="Crawford Young"
        initialBio="Hello"
        initialUsername="crawford_young"
      />,
    )
    expect(screen.getByText('5/280')).toBeInTheDocument()
  })

  it('typing in the bio updates the character count', async () => {
    const user = userEvent.setup()
    render(
      <ProfileSection
        initialName="Crawford Young"
        initialBio=""
        initialUsername="crawford_young"
      />,
    )
    const bio = screen.getByLabelText('Bio')
    await user.type(bio, 'hi there')
    expect(screen.getByText('8/280')).toBeInTheDocument()
  })

  it('profile save button is disabled when name and bio both equal initial values', () => {
    render(
      <ProfileSection
        initialName="Crawford Young"
        initialBio="Hello"
        initialUsername="crawford_young"
      />,
    )
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled()
  })

  it('profile save button is enabled when name differs from initial', async () => {
    const user = userEvent.setup()
    render(
      <ProfileSection
        initialName="Crawford Young"
        initialBio="Hello"
        initialUsername="crawford_young"
      />,
    )
    const name = screen.getByLabelText('Name')
    await user.type(name, ' Jr')
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled()
  })

  it('profile save button is enabled when bio differs from initial', async () => {
    const user = userEvent.setup()
    render(
      <ProfileSection
        initialName="Crawford Young"
        initialBio="Hello"
        initialUsername="crawford_young"
      />,
    )
    const bio = screen.getByLabelText('Bio')
    await user.type(bio, '!')
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled()
  })

  it('calls updateProfile with current name and bio when profile save is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(profileActions.updateProfile).mockResolvedValueOnce(undefined)
    render(
      <ProfileSection
        initialName="Crawford Young"
        initialBio="Hello"
        initialUsername="crawford_young"
      />,
    )
    const name = screen.getByLabelText('Name')
    await user.type(name, ' Jr')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Save profile' }))
    })
    expect(profileActions.updateProfile).toHaveBeenCalledWith({
      name: 'Crawford Young Jr',
      bio: 'Hello',
    })
  })

  it('shows "Profile saved." after a successful profile save', async () => {
    const user = userEvent.setup()
    vi.mocked(profileActions.updateProfile).mockResolvedValueOnce(undefined)
    render(
      <ProfileSection
        initialName="Crawford Young"
        initialBio="Hello"
        initialUsername="crawford_young"
      />,
    )
    const name = screen.getByLabelText('Name')
    await user.type(name, ' Jr')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Save profile' }))
    })
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument()
  })

  it('shows "Could not save profile — try again." when updateProfile rejects', async () => {
    const user = userEvent.setup()
    vi.mocked(profileActions.updateProfile).mockRejectedValueOnce(new Error('boom'))
    render(
      <ProfileSection
        initialName="Crawford Young"
        initialBio="Hello"
        initialUsername="crawford_young"
      />,
    )
    const name = screen.getByLabelText('Name')
    await user.type(name, ' Jr')
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Save profile' }))
    })
    expect(await screen.findByText('Could not save profile — try again.')).toBeInTheDocument()
  })

  it('calls updateProfile with bio: "" when bio is cleared', async () => {
    const user = userEvent.setup()
    vi.mocked(profileActions.updateProfile).mockResolvedValueOnce(undefined)
    render(
      <ProfileSection
        initialName="Crawford Young"
        initialBio="Hello"
        initialUsername="crawford_young"
      />,
    )
    const bio = screen.getByLabelText('Bio')
    await user.clear(bio)
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Save profile' }))
    })
    expect(profileActions.updateProfile).toHaveBeenCalledWith({
      name: 'Crawford Young',
      bio: '',
    })
  })

  describe('username block', () => {
    it('username save button is disabled when value equals initialUsername', () => {
      render(
        <ProfileSection
          initialName="Crawford Young"
          initialBio="Hello"
          initialUsername="crawford_young"
        />,
      )
      expect(screen.getByDisplayValue('crawford_young')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save username' })).toBeDisabled()
    })

    it('calls setUsername with the current input value when username save is clicked', async () => {
      const user = userEvent.setup()
      vi.mocked(profileActions.setUsername).mockResolvedValueOnce(undefined)
      render(
        <ProfileSection
          initialName="Crawford Young"
          initialBio="Hello"
          initialUsername="old_name"
        />,
      )
      const usernameInput = screen.getByDisplayValue('old_name')
      await user.clear(usernameInput)
      await user.type(usernameInput, 'new_name')
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Save username' }))
      })
      expect(profileActions.setUsername).toHaveBeenCalledWith('new_name')
    })

    it('shows "Username saved." after a successful username save', async () => {
      const user = userEvent.setup()
      vi.mocked(profileActions.setUsername).mockResolvedValueOnce(undefined)
      render(
        <ProfileSection
          initialName="Crawford Young"
          initialBio="Hello"
          initialUsername="old_name"
        />,
      )
      const usernameInput = screen.getByDisplayValue('old_name')
      await user.clear(usernameInput)
      await user.type(usernameInput, 'new_name')
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Save username' }))
      })
      expect(await screen.findByText('Username saved.')).toBeInTheDocument()
    })

    it('shows "Invalid or taken username — try another." when setUsername rejects', async () => {
      const user = userEvent.setup()
      vi.mocked(profileActions.setUsername).mockRejectedValueOnce(new Error('taken'))
      render(
        <ProfileSection
          initialName="Crawford Young"
          initialBio="Hello"
          initialUsername="old_name"
        />,
      )
      const usernameInput = screen.getByDisplayValue('old_name')
      await user.clear(usernameInput)
      await user.type(usernameInput, 'bad_name')
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Save username' }))
      })
      expect(
        await screen.findByText('Invalid or taken username — try another.'),
      ).toBeInTheDocument()
    })

    it('renders the "Friends find you by username" help copy', () => {
      render(
        <ProfileSection
          initialName="Crawford Young"
          initialBio="Hello"
          initialUsername="old_name"
        />,
      )
      expect(
        screen.getByText(
          'Friends find you by username. 3–20 characters, lowercase letters, numbers, underscores.',
        ),
      ).toBeInTheDocument()
    })
  })

  describe('public profile link', () => {
    it('shows a "View public profile" link to /u/<username> when initialUsername is set', () => {
      render(
        <ProfileSection
          initialName="Crawford Young"
          initialBio="Hello"
          initialUsername="crawford_young"
        />,
      )
      const link = screen.getByRole('link', { name: 'View public profile' })
      expect(link).toHaveAttribute('href', '/u/crawford_young')
    })

    it('shows "Set a username to get your profile page." and no link when initialUsername is empty', () => {
      render(<ProfileSection initialName="Crawford Young" initialBio="Hello" initialUsername="" />)
      expect(screen.getByText('Set a username to get your profile page.')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'View public profile' })).not.toBeInTheDocument()
    })
  })
})
