import { sql } from 'drizzle-orm'
import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  primaryKey,
  json,
  jsonb,
  index,
  boolean,
} from 'drizzle-orm/pg-core'
import type { CalendarDayOverrides } from '@/lib/schemas/calendar-prefs'

// ── Auth.js v5 required tables ────────────────────────────────────────────────

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  timezone: text('timezone').notNull().default('UTC'),
  username: text('username').unique(),
  bio: text('bio'),
  plan: text('plan', { enum: ['starter', 'growth', 'pro', 'comped'] }),
  stripeCustomerId: text('stripe_customer_id').unique(),
  tokenResetAt: timestamp('token_reset_at'),
  // Stamped on EVERY successful setUsername write, including the first-ever
  // set (STRICT rule, approved 2026-07-27). NULL on rows that predate the
  // username-boundaries wave — those users get exactly one un-gated rename,
  // which stamps the column and puts them on the normal clock from then on.
  lastUsernameChangeAt: timestamp('last_username_change_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })],
)

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
)

// ── App tables ─────────────────────────────────────────────────────────────────

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const calendarPrefs = pgTable('calendar_prefs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  // Minutes-since-midnight: 540 = 09:00, 1020 = 17:00.
  workingHoursStart: integer('working_hours_start').notNull().default(540),
  workingHoursEnd: integer('working_hours_end').notNull().default(1020),
  maxDailyTaskMinutes: integer('max_daily_task_minutes').notNull().default(120),
  dayOverrides: jsonb('day_overrides').$type<CalendarDayOverrides>(),
  use24h: boolean('use_24h').notNull().default(false),
  // TTL auto-delete window in days; null = disabled.
  ttlDays: integer('ttl_days'),
  defaultVisibility: text('default_visibility', { enum: ['public', 'busy', 'private'] })
    .notNull()
    .default('private'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['check_in', 'general'] })
      .notNull()
      .default('general'),
    model: text('model', { enum: ['sonnet', 'opus'] })
      .notNull()
      .default('sonnet'),
    title: text('title'),
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
    expiresAt: timestamp('expires_at', { mode: 'date' })
      .notNull()
      .default(sql`now() + interval '30 days'`),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('conversations_user_id_idx').on(t.userId),
    index('conversations_expires_at_idx').on(t.expiresAt),
    index('conversations_deleted_at_idx').on(t.deletedAt),
  ],
)

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: json('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const tokenLedger = pgTable(
  'token_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['monthly_grant', 'purchase', 'usage'] }).notNull(),
    amount: integer('amount').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('token_ledger_user_id_idx').on(t.userId)],
)

// ── Activity model (Wave 3) ──────────────────────────────────────────────────
// The old `tasks`/`seriesSlotTombstones`/`checkIns` model was dropped in the
// A8 teardown migration (0019). `activities` is a metadata-only TEMPLATE
// (min/max session length, weekly session target); `events` are independent
// originals — no shared-field sync, no grouped deletes. The activity's own
// `schedule`/`timeZone`/`generatedThrough` columns were dropped in migration
// 0022 (event-series wave, A9) — generation is series-driven (`eventSeries`
// below) now. See
// docs/scheduling-advisor/specs/2026-07-15-activity-abstraction-design.md.

export const activities = pgTable('activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  color: text('color'),
  description: text('description'),
  defaultLocation: text('default_location'),
  minDurationMin: integer('min_duration_min').notNull(),
  maxDurationMin: integer('max_duration_min').notNull(),
  weeklyTargetSessions: integer('weekly_target_sessions').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ── Event series (Wave 4) ────────────────────────────────────────────────────
// A recurrence RULE plus fill fields and a `generatedThrough` high-water mark.
// The sliding-window sweep materialises independent `events` rows from it — no
// field sync, no tombstones; a deleted occurrence never resurrects. See
// docs/scheduling-advisor/specs/2026-07-21-event-series-recurrence-design.md.

export const eventSeries = pgTable('event_series', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  activityId: uuid('activity_id').references(() => activities.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  location: text('location'),
  color: text('color'),
  visibility: text('visibility', { enum: ['public', 'busy', 'private'] })
    .notNull()
    .default('private'),
  freq: text('freq', { enum: ['daily', 'weekly', 'monthly', 'yearly'] }).notNull(),
  // Weekly: selected weekdays 0–6 Sun-first.
  weekdays: jsonb('weekdays').$type<readonly number[]>(),
  // Monthly day-of-month mode (1–31, clamped to short months); yearly day-within-month.
  dayOfMonth: integer('day_of_month'),
  // Monthly nth-weekday mode: 1–4, -1 = last.
  nthOrdinal: integer('nth_ordinal'),
  nthWeekday: integer('nth_weekday'),
  // Yearly: 1–12.
  month: integer('month'),
  startMinutes: integer('start_minutes').notNull(),
  durationMin: integer('duration_min').notNull(),
  timeZone: text('time_zone'),
  until: timestamp('until', { withTimezone: true, mode: 'date' }),
  generatedThrough: timestamp('generated_through', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Nullable: null = standalone event. Deleting the parent activity orphans
  // (SET NULL) rather than cascades — an original event outlives its template.
  activityId: uuid('activity_id').references(() => activities.id, { onDelete: 'set null' }),
  // Parent recurrence rule that materialised this occurrence; null = one-off.
  // SET NULL on series delete-keep unlinks occurrences without removing them.
  seriesId: uuid('series_id').references(() => eventSeries.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  location: text('location'),
  startAt: timestamp('start_at', { withTimezone: true, mode: 'date' }),
  endAt: timestamp('end_at', { withTimezone: true, mode: 'date' }),
  allDay: boolean('all_day').notNull().default(false),
  status: text('status', { enum: ['pending', 'completed'] })
    .notNull()
    .default('pending'),
  locked: boolean('locked').notNull().default(false),
  color: text('color'),
  visibility: text('visibility', { enum: ['public', 'busy', 'private'] })
    .notNull()
    .default('private'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
