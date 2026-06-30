<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Project notes (Cybond)

- Workspace standards live in `~/code/CLAUDE.md` — pnpm only, TDD, 100% statements/functions/lines coverage (branches ≥97%), Conventional Commits, rebase-only git.
- **`WeekCalendarView` never resyncs from props.** It seeds internal state once and applies move/resize/delete/drag-create optimistically. `CalendarClient` restores server truth by remounting via `key={weekStart-resetKey}`; after create, a dedicated `useTransition` + `resyncQueuedRef` delays the `resetKey` bump until `router.refresh()` completes (bumping synchronously remounts with stale props). Do not "simplify" this machinery.
- **`TaskFormDialog` date+time props are UTC wall-clock** (`toTimeSlot`/`buildIso` use `getUTC*`). Any caller must convert with `getUTC*` (see `toUTCTimeSlot` in `calendar-client.tsx`). Local `HH:MM` here is a timezone bug that UTC CI will mask.
- **`GoalFormDialog.initialTargetDate` must be date-only `YYYY-MM-DD`** — it appends `T12:00:00`; a full ISO datetime yields Invalid Date and silently wipes the goal's target date on save.
- **`TaskTimeFields` + `buildIso`/`toTimeSlot` live in `@crawfordyoung/ui` (≥0.12.1), not in the app.** `TaskFormDialog` and the Activities surface both consume them; don't reintroduce a local copy. `TaskTimeFields` takes optional `repeatMin`/`repeatMax` (the calendar form passes `2`/`52`) — changing those bounds is a save-path behavior change.
- **Goals/Habits/Tasks are unified into one `/activities` destination** backed by the single polymorphic `tasks` table (no per-type table, no migration). The `/goals`, `/habits`, `/tasks` routes were removed (Wave 2); the auth proxy redirects every unauthenticated path to `/login`, so a removed route is indistinguishable from a protected one in the unauthenticated e2e suite (a 404 is unobservable there — assert the `/login` redirect instead). The library `ActivityFormDialog`/`ActivityCard` are presentational; the app wraps them with server-action handlers (`activity/activity-card-actions.tsx`, `activity/activity-create.tsx`). Goal `targetDate` is emitted date-only by the dialog and converted to noon-UTC ISO (`T12:00:00.000Z`) before `createTaskSchema` (the `.datetime()` schema rejects date-only; this avoids the goal-date-wipe trap).
- The calendar still uses the app's local `GoalFormDialog`/`HabitFormDialog` (its add/edit flows) — those were deliberately **kept**, not deleted in the Wave 2 cleanup.
- **Dialog mocks in tests must surface data props** (render the values), not just component identity — identity-only mocks have hidden real contract bugs.
- Chat panel opens via `open-chat` CustomEvent; optional `detail.prefill` seeds the input. Listener must stay null-safe (`detail?.prefill`) — older dispatchers send no detail.
- E2E suite is deliberately unauthenticated (dummy `DATABASE_URL`, never touches the DB). Auth.js uses database sessions — authenticated e2e requires seeded postgres + forged session cookie and is its own planned wave.
- Vitest auth-mock gotcha: `vi.mocked(auth).mockResolvedValueOnce(null as never)` — plain `null` fails type-check.
- **AI gating is token-balance-only.** `plan` is display-only (highlights the current tier on `/tokens`); no plan-based feature gates remain. Unauthenticated or zero-balance users see the app fully — only Cy chat and AI reflections require tokens.
- **`token-balance-changed` CustomEvent contract.** Dispatched on `window` after any token spend (chat `onFinish` callback). `TokenChipLive` in the app layout listens and refetches the balance via `getTokenBalanceAction`. Any new token-spending feature **must** dispatch `new CustomEvent('token-balance-changed')` on `window` so the topbar stays in sync.
