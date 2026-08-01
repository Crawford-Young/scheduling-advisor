import * as React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'jest-axe'
import { AddFriendDialog } from './add-friend-dialog'
import { FriendsTabs } from './friends-tabs'
import { FriendButton } from '@/components/profile/friend-button'
import type { FriendRequestEntry, FriendUser } from '@/server/queries/friends'

// Real lists (not the mocked stand-ins friends-tabs.test.tsx uses) — the rows,
// their stretched overlay links, and the ⋯ menu trigger are exactly what an
// a11y sweep needs to see.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/server/actions/friends', () => ({
  sendFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  declineFriendRequest: vi.fn(),
  cancelFriendRequest: vi.fn(),
  removeFriend: vi.fn(),
}))
vi.mock('@/server/actions/search', () => ({
  searchUsersGlobal: vi.fn().mockResolvedValue({
    data: [
      { id: 'u-add', username: 'dana', name: 'Dana Reyes', image: null },
      { id: 'u-friend', username: 'ada', name: 'Ada Lovelace', image: null },
      { id: 'u-out', username: 'sam', name: 'Sam Ortiz', image: null },
      { id: 'u-in', username: 'zoe', name: 'Zoe Park', image: null },
    ],
  }),
}))

const THEMES = ['dark', 'light'] as const

function makeUser(overrides: Partial<FriendUser> = {}): FriendUser {
  return {
    friendshipId: 'f-1',
    userId: 'u-1',
    username: 'ada',
    name: 'Ada Lovelace',
    image: null,
    ...overrides,
  }
}

function makeRequest(overrides: Partial<FriendRequestEntry> = {}): FriendRequestEntry {
  return { ...makeUser(overrides), createdAt: new Date('2026-01-01T00:00:00.000Z'), ...overrides }
}

afterEach(() => {
  document.documentElement.className = ''
  cleanup()
})

async function expectNoViolationsInBothThemes(): Promise<void> {
  for (const theme of THEMES) {
    document.documentElement.className = theme
    expect(await axe(document.body)).toHaveNoViolations()
  }
}

// The page renders inside AppShell's <main>; rendering a bare fragment trips
// axe's `region` rule on the harness, not on the component (same reason
// global-search.test.tsx wraps its subject in a <header>).
function renderInMain(ui: React.ReactNode): void {
  render(<main>{ui}</main>)
}

describe('friends surfaces accessibility', () => {
  it('the friends page tabs have no violations in either theme', async () => {
    renderInMain(
      <FriendsTabs
        friends={[makeUser()]}
        incoming={[makeRequest({ friendshipId: 'f-2', userId: 'u-2', username: 'grace' })]}
        outgoing={[makeRequest({ friendshipId: 'f-3', userId: 'u-3', username: 'alan' })]}
      />,
    )
    await expectNoViolationsInBothThemes()
  })

  it('the Requests tab has no violations in either theme', async () => {
    const user = userEvent.setup()
    renderInMain(
      <FriendsTabs
        friends={[]}
        incoming={[makeRequest({ friendshipId: 'f-2', userId: 'u-2', username: 'grace' })]}
        outgoing={[]}
      />,
    )
    await user.click(screen.getByRole('tab', { name: /Requests/ }))
    await expectNoViolationsInBothThemes()
  })

  it('the Sent tab has no violations in either theme', async () => {
    const user = userEvent.setup()
    renderInMain(
      <FriendsTabs
        friends={[]}
        incoming={[]}
        outgoing={[makeRequest({ friendshipId: 'f-3', userId: 'u-3', username: 'alan' })]}
      />,
    )
    await user.click(screen.getByRole('tab', { name: /Sent/ }))
    await expectNoViolationsInBothThemes()
  })

  it('the empty states have no violations in either theme', async () => {
    renderInMain(<FriendsTabs friends={[]} incoming={[]} outgoing={[]} />)
    await expectNoViolationsInBothThemes()
  })

  for (const view of ['none', 'outgoing', 'incoming', 'friends'] as const) {
    it(`FriendButton in the ${view} state has no violations in either theme`, async () => {
      renderInMain(<FriendButton profileUserId="u-9" view={view} friendshipId="f-9" />)
      await expectNoViolationsInBothThemes()
    })
  }

  it('the add-friend dialog with every row state has no violations in either theme', async () => {
    const user = userEvent.setup()
    // The dialog portals to document.body, so it needs no <main> wrapper —
    // role="dialog" is its own top-level container for axe's region rule.
    render(
      <AddFriendDialog
        open
        onOpenChange={vi.fn()}
        relations={
          new Map([
            ['u-friend', 'friends'],
            ['u-in', 'incoming'],
            ['u-out', 'outgoing'],
          ] as const)
        }
      />,
    )
    await user.type(screen.getByRole('searchbox', { name: 'Search people' }), 'ad')
    // One result row per relation state: Add button, Friends, Requested, Sent
    // you a request — waiting on the debounced search (real timers here).
    expect(await screen.findByRole('button', { name: 'Add' })).toBeInTheDocument()
    // `aria-hidden-focus` is disabled for Radix Dialog focus guards only — the
    // sentinel spans are aria-hidden + tabindex=0 BY DESIGN (focus trap), and
    // the same disable existed in the old global-search dialog test for the
    // same reason (see global-search.test.tsx's history note).
    for (const theme of THEMES) {
      document.documentElement.className = theme
      expect(
        await axe(document.body, { rules: { 'aria-hidden-focus': { enabled: false } } }),
      ).toHaveNoViolations()
    }
  })
})
