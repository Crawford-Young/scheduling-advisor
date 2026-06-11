'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { tasks, checkIns } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

interface ActionResult {
  readonly error?: string
}

interface MarkItemInput {
  readonly taskId: string
  readonly date: string
}

interface RescheduleInput {
  readonly taskId: string
  readonly newDate: string
  readonly newTime?: string
}

interface CreateHabitInput {
  readonly title: string
  readonly startDate: string
  readonly time?: string
  readonly visibility: 'everyone' | 'friends' | 'busy' | 'only_me'
}

interface CreateGoalInput {
  readonly title: string
  readonly targetDate: string
  readonly visibility: 'everyone' | 'friends' | 'busy' | 'only_me'
}

interface CreateTaskInput {
  readonly title: string
  readonly dueDate: string
  readonly dueTime?: string
  readonly visibility: 'everyone' | 'friends' | 'busy' | 'only_me'
}

interface UpdateItemInput {
  readonly taskId: string
  readonly fields: Partial<{
    title: string
    status: 'pending' | 'in_progress' | 'completed'
    targetDate: string
    visibility: 'everyone' | 'friends' | 'busy' | 'only_me'
  }>
}

export async function markItemComplete(input: MarkItemInput): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, input.taskId), eq(tasks.userId, session.user.id)))
    .limit(1)
  if (!task) return { error: 'Not found' }

  const scheduledAt = new Date(input.date)
  const now = new Date()

  await db
    .insert(checkIns)
    .values({
      userId: session.user.id,
      taskId: input.taskId,
      scheduledAt,
      completedAt: now,
    })
    .onConflictDoUpdate({
      target: [checkIns.userId, checkIns.taskId, checkIns.scheduledAt],
      set: { completedAt: now, skippedAt: null },
    })

  revalidatePath('/calendar')
  return {}
}

export async function markItemSkipped(input: MarkItemInput): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, input.taskId), eq(tasks.userId, session.user.id)))
    .limit(1)
  if (!task) return { error: 'Not found' }

  const scheduledAt = new Date(input.date)
  const now = new Date()

  await db
    .insert(checkIns)
    .values({
      userId: session.user.id,
      taskId: input.taskId,
      scheduledAt,
      skippedAt: now,
    })
    .onConflictDoUpdate({
      target: [checkIns.userId, checkIns.taskId, checkIns.scheduledAt],
      set: { skippedAt: now, completedAt: null },
    })

  revalidatePath('/calendar')
  return {}
}

export async function rescheduleItem(input: RescheduleInput): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const targetDate = new Date(input.newDate)
  await db
    .update(tasks)
    .set({ targetDate, updatedAt: new Date() })
    .where(and(eq(tasks.id, input.taskId), eq(tasks.userId, session.user.id)))

  revalidatePath('/calendar')
  return {}
}

export async function createHabit(input: CreateHabitInput): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  await db.insert(tasks).values({
    userId: session.user.id,
    title: input.title,
    type: 'habit',
    recurrence: 'daily',
    targetDate: new Date(input.startDate),
    visibility: input.visibility,
  })

  revalidatePath('/habits')
  return {}
}

export async function createGoal(input: CreateGoalInput): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  await db.insert(tasks).values({
    userId: session.user.id,
    title: input.title,
    type: 'goal',
    targetDate: new Date(input.targetDate),
    visibility: input.visibility,
  })

  revalidatePath('/goals')
  return {}
}

export async function createTask(input: CreateTaskInput): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  await db.insert(tasks).values({
    userId: session.user.id,
    title: input.title,
    type: 'task',
    targetDate: new Date(input.dueDate),
    visibility: input.visibility,
  })

  revalidatePath('/tasks')
  return {}
}

export async function updateItem(input: UpdateItemInput): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (input.fields.title !== undefined) updates.title = input.fields.title
  if (input.fields.status !== undefined) updates.status = input.fields.status
  if (input.fields.targetDate !== undefined) updates.targetDate = new Date(input.fields.targetDate)
  if (input.fields.visibility !== undefined) updates.visibility = input.fields.visibility

  await db
    .update(tasks)
    .set(updates)
    .where(and(eq(tasks.id, input.taskId), eq(tasks.userId, session.user.id)))

  revalidatePath('/calendar')
  return {}
}
