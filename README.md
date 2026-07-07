# Cybond

Consistency-first scheduling app. The week calendar is home: plan tasks and goals (recurring tasks cover what used to be "habits"); check in on what you did; keep streaks per activity and a weekly consistency score. Cybond's AI assistant helps you find time and reschedule around your real calendar.

## Features

- **Week calendar (home)** — full CRUD on calendar events:
  - Drag-create: drag an empty slot to open the library's inline create popover (title, color, times, all-day, location, description, repeat with weekday picker + repeat count) — saves straight to a task
  - Edit / + New: the library's `ActivityFormDialog` dialog (morphs task ↔ goal)
  - Reschedule: drag or resize events; completed events are locked and snap back
  - Delete: confirm dialog, optimistic UI with automatic restore on error or cancel
  - Repeat: setting Repeat on any event — at create or later via edit — materializes a series of distinct occurrence rows sharing the event's info; weekly series take a weekday picker (seeded from the row on edit) and a repeat count in weeks; series edits apply to this-and-following occurrences and never touch the past
  - Wake→sleep window by default (hours from Settings, default 9–17); the Sleep mode toggle switches to a full 24h grid with shaded sleep zones where drag-create is blocked
- **Activities** — one `/activities` destination unifying goals and tasks as a sortable 5-column DataTable: Title (incl. color dot + type badge) · When (date + recurrence) · Status (badge + streak flame) · Social (activityType + visibility) · Actions (complete check-icon, edit, delete). Search (`?q=`, debounced), type/status filters, recurring-only toggle, and a `+ New` button. Replaces the former separate `/goals`, `/habits`, and `/tasks` routes.
- **Check-in flow** — tap an event to log Done / Skipped; perfect weeks get a celebration
- **Ask Cybond** — "Ask Cybond" on a check-in opens the chat panel pre-filled with a reschedule request; the assistant proposes times via tools you confirm or deny
- **Streaks + consistency** — streak badges and a weekly consistency bar; a recurring series keeps one shared streak across its occurrences (derived on read from the group's completion history — no stored counter), while completion itself is always per-occurrence. A pending occurrence dated today doesn't break the streak (the day isn't over); any older missed occurrence resets it
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
- `ActivityFormDialog` (library, `@crawfordyoung/ui` ≥0.18.0) is the single create/edit dialog for both Activities and the calendar (app wires data only; edit passes `lockType` and seeds the weekday picker + repeat count from the row). Goal target dates are emitted date-only and converted to noon-UTC ISO (`T12:00:00.000Z`) before `createTaskSchema` — the `.datetime()` schema rejects date-only, and this avoids the goal-date-wipe trap. The app-owned per-type dialogs were deleted in Wave 2.1.
- `TaskTimeFields`, `buildIso`, and `toTimeSlot` are bundled in `@crawfordyoung/ui` (≥0.17.0) and used by the library's `ActivityFormDialog`; the app does not duplicate them. UTC semantics are load-bearing — local `HH:MM` is a timezone bug UTC CI masks.
- The chat panel listens for an `open-chat` CustomEvent; dispatchers may pass `detail.prefill` to seed the input (used by Ask Cybond).

## Testing

- Vitest unit/integration suite lives in TWO trees, both picked up (vitest has no `include` glob): co-located `src/**/*.test.tsx` and `tests/unit/**`. Deleting or renaming a component must clean both. Coverage gates: 100% statements, functions, lines; ≥97% branches.
- Playwright e2e under `tests/e2e/` — currently unauthenticated flows only (login, redirects); authenticated e2e (seeded DB + session cookie) is planned as its own wave.
