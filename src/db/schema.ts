import { pgTable, text, timestamp, integer, uuid, primaryKey, json } from 'drizzle-orm/pg-core'

// ── Auth.js v5 required tables ────────────────────────────────────────────────

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  anthropicApiKey: text('anthropic_api_key'),
  preferredModel: text('preferred_model').notNull().default('claude-sonnet-4-6'),
  timezone: text('timezone').notNull().default('UTC'),
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
  type: text('type', { enum: ['task', 'goal', 'habit'] }).notNull(),
  recurrence: text('recurrence'),
  status: text('status', { enum: ['pending', 'in_progress', 'completed'] })
    .notNull()
    .default('pending'),
  targetDate: timestamp('target_date', { mode: 'date' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const checkIns = pgTable('check_ins', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  scheduledAt: timestamp('scheduled_at', { mode: 'date' }).notNull(),
  completedAt: timestamp('completed_at', { mode: 'date' }),
  reflectionText: text('reflection_text'),
  rating: integer('rating'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

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
  workingHoursStart: integer('working_hours_start').notNull().default(9),
  workingHoursEnd: integer('working_hours_end').notNull().default(17),
  maxDailyTaskMinutes: integer('max_daily_task_minutes').notNull().default(120),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: json('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
