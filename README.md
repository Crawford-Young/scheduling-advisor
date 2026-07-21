# Cybond

Scheduling app built around activities and events. An **activity** is a template (min/max session length, a weekly session target, and a per-day schedule); the app generates independent **events** from it on a rolling 8-week horizon. A **weekly fit** score (completed sessions ÷ weekly target, derived on read) replaces streaks. Cybond's AI assistant helps you find time and reschedule around your real calendar.

## Features

- **Week calendar (home)** — full CRUD on calendar events:
  - Drag-create: drag an empty slot to open the library's picker — pick an existing activity, "No activity" (standalone event), or "New activity…" (opens the activity template dialog, then creates the drawn slot as its first event)
  - Edit: the library's `EventFormDialog` for any event; editing one event never touches another (events are independent originals — no shared-field sync, no grouped writes)
  - Reschedule: drag or resize events; completed events are locked and snap back
  - Lock: click the padlock icon on a chip to pin it in place — locked events can't be dragged or resized (resize handles disappear), but stay fully editable otherwise (complete, delete, edit all still work)
  - Delete: confirm dialog, optimistic UI with automatic restore on error or cancel. Deleting a generated event never resurrects it later — the generator only ever creates events after the activity's high-water mark (`generatedThrough`), so there are no tombstones to maintain
  - Wake→sleep window by default (hours from Settings, default 9–17); the Sleep mode toggle switches to a full 24h grid with shaded sleep zones where drag-create is blocked
- **Activities** — `/activities` lists your activity templates: title, pattern (e.g. "Mon/Wed/Fri · 3×/wk"), this week's fit ("2 of 3" + a progress bar), and the next upcoming event. Edit opens the template dialog (a pattern change resets generation and regenerates forward from now — past events are never rewritten); delete removes future pending events for that activity but keeps past ones. A one-off events section below the table lists standalone (non-activity) upcoming events with the same edit/delete/complete affordances. Search (`?q=`) and a `+ New` button that opens the template dialog.
- **Cy chat popup** — a chat bubble on every app page opens an in-place popup that resumes your latest conversation; the assistant can read your activities and this week's schedule, create activities and events (including a bulk "create N events" tool for one-off batches), and propose actions you confirm or deny. New chat starts fresh (no conversation is saved until you send), and Expand hands the same conversation off to the full `/chat` page. Drag the bubble to any screen edge — it snaps in place and remembers its position
- **Event approval cards** — when Cy proposes a calendar event, an approval card shows it dashed on that day's schedule preview; ✓ creates it instantly (and it appears on the `/chat` page's live week calendar), ✗ sends your reason back so Cy revises. Ask for a repeated event ("work every weekday 9–5", "gym daily for a month") and Cy proposes ONE recurring series — the card summarizes the cadence ("Repeats weekly · Mon–Fri · 8 weeks") and the anchor-day preview carries a "repeats" badge; ✓ creates every occurrence at once as independent events. Expanding the popup while a proposal is still pending carries the card to `/chat`, where it re-renders fully actionable (still ✓/✗)
- **Model picker per conversation** — choose Sonnet (×1) or Opus (×2) from the chat header; the choice is saved on the conversation and priced into every reply
- **Quick add** — a one-line topbar input ("dinner Fri 7pm") that creates a single event through a fast, ephemeral AI lane: nothing lands in chat history, and you confirm before anything is created
- **Tokens** — the app is free to use; tokens purchase AI assistance (Cy chat, quick add). Buy a monthly subscription (Starter/Growth/Pro) or one-off token packs at `/tokens`; cached prompt input is billed at a discount
- **Auto-delete (TTL)** — pending, standalone (non-activity) events older than `calendarPrefs.ttlDays` days past their end are hard-deleted on read; events generated from an activity are never auto-deleted
- **Public profiles** — every user gets an identity card at `/u/[username]` (name, avatar, bio, member-since) and can be found via search on `/feed`; edit your own name, bio, and username from Settings. A richer profile (activity/event visibility, stats) is a planned follow-up wave

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
- `WeekCalendarView` (library, `@crawfordyoung/ui` ≥0.23.0) applies moves/resizes/deletes optimistically and re-seeds from the `events` prop in place when its `resyncToken` prop changes — no remounts. `CalendarClient` bumps the token after `router.refresh()` settles (`refreshAndResync()`, all server-mutating paths) and immediately via `resyncNow()` on the no-server delete-cancel path.
- `ActivityTemplateDialog` (create/edit an activity template) and `EventFormDialog` (create/edit a single event) ship from `@crawfordyoung/ui` ≥0.23.0; the app wires data only.
- Generation is a pure, TZ-aware, sliding-window core (`src/lib/event-generation.ts`): on an 8-week horizon, it creates only events with `slotStart > activity.generatedThrough`, then advances the high-water mark to the window end. A pattern edit resets `generatedThrough = now` and regenerates inline. Per-day schedule times are local wall-clock in the activity's IANA time zone.
- Weekly fit (`src/lib/weekly-fit.ts`) is derived on read: completed events with a given `activityId`, in the local wall-clock week, divided by that activity's `weeklyTargetSessions`. Local `Date` getters only — never UTC substrings.
- `TaskTimeFields`, `buildIso`, and `toTimeSlot` are bundled in `@crawfordyoung/ui` and used by the library's dialogs; the app does not duplicate them. Typed/displayed times are LOCAL wall-clock throughout the calendar and dialogs — the persisted ISO on an event's start/end is always a real UTC instant, only the local reading of that instant changed.
- Calendar chip locking (`@crawfordyoung/ui` ≥0.19.0): the `locked` boolean on `events` seeds the chip's lock icon; toggling it flips the persisted flag via `updateEvent({ id, locked })`. Lock scope is move/resize only — complete-toggle, edit, and delete all stay available on a locked event, and there is no server-side time-guard (client-side gating only, by design).
- The chat popup (`ChatPopup`, mounted app-wide) listens for an `open-chat` CustomEvent; dispatchers may pass `detail.prefill` to seed the input. All chat surfaces compose the single `ChatSurface` wiring.
- Error boundaries (`@crawfordyoung/ui` ≥0.22.0): every route segment ships an `error.tsx` rendering `RouteErrorFallback` with Sentry capture — root `error.tsx`, `global-error.tsx` (own html/body, imports globals.css), `(app)/error.tsx`, and all 8 segments with per-segment titles ("Failed to load calendar" etc.). Each boundary has a co-located test.

## Testing

- Vitest unit/integration suite lives in TWO trees, both picked up (vitest has no `include` glob): co-located `src/**/*.test.tsx` and `tests/unit/**`. Deleting or renaming a component must clean both. Coverage gates: 100% statements, functions, lines; ≥97% branches.
- Playwright e2e under `tests/e2e/` — currently unauthenticated flows only (login, redirects); authenticated e2e (seeded DB + session cookie) is planned as its own wave.
