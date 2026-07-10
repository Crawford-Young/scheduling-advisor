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
  unique,
  index,
  boolean,
} from 'drizzle-orm/pg-core'
import type { CalendarDayOverrides } from '@/lib/schemas/calendar-prefs'
import type { DayOfWeek } from '@/lib/schemas/task'

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
  plan: text('plan', { enum: ['starter', 'growth', 'pro', 'comped'] }),
  stripeCustomerId: text('stripe_customer_id').unique(),
  tokenResetAt: timestamp('token_reset_at'),
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

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  type: text('type', { enum: ['task', 'goal'] }).notNull(),
  recurrence: text('recurrence'),
  // Shared identity for every row produced by a single fan-out/create call —
  // null for a non-recurring single insert. See src/server/actions/tasks.ts.
  recurrenceGroupId: uuid('recurrence_group_id'),
  recurrenceDays: jsonb('recurrence_days').$type<readonly DayOfWeek[]>(),
  recurrenceCount: integer('recurrence_count'),
  status: text('status', { enum: ['pending', 'in_progress', 'completed'] })
    .notNull()
    .default('pending'),
  targetDate: timestamp('target_date', { mode: 'date' }),
  startAt: timestamp('start_at', { withTimezone: true, mode: 'date' }),
  endAt: timestamp('end_at', { withTimezone: true, mode: 'date' }),
  location: text('location'),
  description: text('description'),
  color: text('color'),
  allDay: boolean('all_day').notNull().default(false),
  activityType: text('activity_type', { enum: ['solo', 'group'] })
    .notNull()
    .default('solo'),
  visibility: text('visibility', {
    enum: ['everyone', 'friends', 'busy', 'only_me'],
  })
    .notNull()
    .default('only_me'),
  joinability: text('joinability', { enum: ['open', 'request', 'closed'] }),
  maxParticipants: integer('max_participants'),
  locked: boolean('locked').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Records a series occurrence that the user explicitly deleted, so the rolling
// auto-extend sweep (src/server/actions/series-mutations.ts `extendSeries`) never
// resurrects it. Keyed by (recurrence_group_id, slot_start) — one tombstone per
// deleted slot. Cleared wholesale when the series is deleted or its pattern is
// rewritten (a fresh start voids old per-slot deletions).
export const seriesSlotTombstones = pgTable(
  'series_slot_tombstones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recurrenceGroupId: uuid('recurrence_group_id').notNull(),
    slotStart: timestamp('slot_start', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => [unique().on(t.recurrenceGroupId, t.slotStart)],
)

export const checkIns = pgTable(
  'check_ins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    scheduledAt: timestamp('scheduled_at', { mode: 'date' }).notNull(),
    completedAt: timestamp('completed_at', { mode: 'date' }),
    skippedAt: timestamp('skipped_at', { mode: 'date' }),
    reflectionText: text('reflection_text'),
    rating: integer('rating'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.taskId, t.scheduledAt)],
)

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
