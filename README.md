# Cybond

Consistency-first scheduling app. The week calendar is home: plan tasks and goals (recurring tasks cover what used to be "habits"); check in on what you did; keep per-task streaks and a weekly consistency score. Cybond's AI assistant helps you find time and reschedule around your real calendar.

## Features

- **Week calendar (home)** — full CRUD on calendar events:
  - Drag-create: drag an empty slot to open the library's inline create popover (title, color, times, all-day, location, description, repeat) — saves straight to a task
  - Edit / + New: the app-owned `ActivityFormDialog` (morphs task ↔ goal)
  - Reschedule: drag or resize events; completed events are locked and snap back
  - Delete: confirm dialog, optimistic UI with automatic restore on error or cancel
  - Wake→sleep window by default (hours from Settings, default 9–17); the Sleep mode toggle switches to a full 24h grid with shaded sleep zones where drag-create is blocked
- **Activities** — one `/activities` destination unifying goals and tasks (backed by the single polymorphic `tasks` table; type taxonomy is `task` + `goal`). Search (`?q=`, debounced), type/status filters, a recurring-only toggle, and a `+ New` button opening the morphing dialog. Replaces the former separate `/goals`, `/habits`, and `/tasks` routes.
- **Check-in flow** — tap an event to log Done / Skipped; perfect weeks get a celebration
- **Ask Cybond** — "Ask Cybond" on a check-in opens the chat panel pre-filled with a reschedule request; the assistant proposes times via tools you confirm or deny
- **Streaks + consistency** — per-task streak badges and a weekly consistency bar
- **Activity settings** — visibility and joinability per activity; wake/sleep hours under Settings → Calendar
- **Tokens** — the app is free to use; tokens purchase AI assistance (Cy chat, AI reflections). Buy a monthly subscription (Starter/Growth/Pro) or one-off token packs at `/tokens`

## Stack

Next.js (App Router, RSC-first) · TypeScript strict · Tailwind CSS · Radix-based component library (`@crawfordyoung/ui`) · Neon Postgres + Drizzle · Auth.js v5 (Google, database sessions) · Vercel AI SDK chat · Upstash rate limiting · Pino logging · Sentry

## Development

```bash
pnpm install
just dev          # dev server at :3000
just test         # vitest with coverage (100% statements/functions/lines enforced)
just e2e          # playwright
just lint         # eslint + prettier
just typecheck    # tsc --noEmit
just check        # full CI suite: lint, typecheck, test, e2e
```

Copy `.env.example` to `.env.local` and fill in all values — `t3-env` validates at startup.

## Architecture notes

- Mutations are Server Actions with Zod validation at every boundary; API routes exist only for externally-consumed endpoints (chat, webhooks, health).
- `WeekCalendarView` (library) applies moves/resizes/deletes optimistically and never resyncs from props. `CalendarClient` owns the workaround: a `resetKey` remount restores server truth on cancel/error paths, and a dedicated transition delays the remount after create until `router.refresh()` has delivered fresh data.
- The app owns `ActivityFormDialog` (`src/components/activity/activity-form-dialog.tsx`) — the single create/edit dialog for both Activities and the calendar (edit locks the type). Goal target dates are emitted date-only and converted to noon-UTC ISO (`T12:00:00.000Z`) before `createTaskSchema` — the `.datetime()` schema rejects date-only, and this avoids the goal-date-wipe trap. The former per-type `TaskFormDialog`/`GoalFormDialog`/`HabitFormDialog` were deleted in Wave 2.1.
- The shared task scheduling field group (`TaskTimeFields`) and the UTC helpers (`buildIso` / `toTimeSlot`) live in `@crawfordyoung/ui` (≥0.13.1) and are consumed by `ActivityFormDialog`. UTC semantics are load-bearing — local `HH:MM` is a timezone bug UTC CI masks.
- The chat panel listens for an `open-chat` CustomEvent; dispatchers may pass `detail.prefill` to seed the input (used by Ask Cybond).

## Testing

- Vitest unit/integration suite lives in TWO trees, both picked up (vitest has no `include` glob): co-located `src/**/*.test.tsx` and `tests/unit/**`. Deleting or renaming a component must clean both. Coverage gates: 100% statements, functions, lines; ≥97% branches.
- Playwright e2e under `tests/e2e/` — currently unauthenticated flows only (login, redirects); authenticated e2e (seeded DB + session cookie) is planned as its own wave.
