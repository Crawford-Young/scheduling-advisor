# Cybond

Consistency-first scheduling app. The week calendar is home: plan tasks, goals, and habits; check in on what you did; keep per-task streaks and a weekly consistency score. Cybond's AI assistant helps you find time and reschedule around your real calendar.

## Features

- **Week calendar (home)** — full CRUD on calendar events:
  - Drag-create: drag an empty slot to open a pre-filled new-task dialog
  - Edit: open the type-matched dialog (task / goal / habit) from an event's edit control
  - Reschedule: drag or resize events; completed events are locked and snap back
  - Delete: confirm dialog, optimistic UI with automatic restore on error or cancel
- **Activities** — one `/activities` destination unifying goals, habits, and tasks (backed by the single polymorphic `tasks` table). Filter by type (`?type=goal|habit|task`), quick-add, or create any type via the morphing `ActivityFormDialog`. Replaces the former separate `/goals`, `/habits`, and `/tasks` routes.
- **Check-in flow** — tap an event to log Done / Skipped; perfect weeks get a celebration
- **Ask Cybond** — "Ask Cybond" on a check-in opens the chat panel pre-filled with a reschedule request; the assistant proposes times via tools you confirm or deny
- **Streaks + consistency** — per-task streak badges and a weekly consistency bar
- **Activity settings** — visibility and joinability per activity
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
- `TaskFormDialog` speaks UTC wall-clock for date + time props; callers convert with `getUTC*` (see `toUTCTimeSlot` in `calendar-client.tsx`). `GoalFormDialog.initialTargetDate` requires date-only `YYYY-MM-DD`.
- The shared task scheduling field group (`TaskTimeFields`) and the UTC helpers (`buildIso` / `toTimeSlot`) live in `@crawfordyoung/ui` (≥0.12.1) and are consumed by both `TaskFormDialog` and the Activities surface. UTC semantics are load-bearing — local `HH:MM` is a timezone bug UTC CI masks.
- The chat panel listens for an `open-chat` CustomEvent; dispatchers may pass `detail.prefill` to seed the input (used by Ask Cybond).

## Testing

- Vitest unit/integration suite under `tests/unit/` — coverage gates: 100% statements, functions, lines; ≥97% branches.
- Playwright e2e under `tests/e2e/` — currently unauthenticated flows only (login, redirects); authenticated e2e (seeded DB + session cookie) is planned as its own wave.
