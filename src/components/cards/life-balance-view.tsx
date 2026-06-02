'use client'
import { z } from 'zod'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card, CardHeader, CardContent } from '@/lib/ui'

export const lifeBalanceViewPropsSchema = z.object({
  categories: z.array(
    z.object({
      label: z.string(),
      minutes: z.number().min(0),
      color: z.string(),
    }),
  ),
})

export type LifeBalanceViewProps = z.infer<typeof lifeBalanceViewPropsSchema>

function minutesToHours(minutes: number) {
  return (minutes / 60).toFixed(1) + 'h'
}

export function LifeBalanceView({ categories }: LifeBalanceViewProps) {
  const data = categories.map((c) => ({ name: c.label, value: c.minutes, color: c.color }))

  return (
    <Card>
      <CardHeader>
        <p className="font-medium">Life Balance</p>
        <p className="text-muted-foreground text-sm">How your time is spent this week</p>
      </CardHeader>
      <CardContent>
        <div aria-label="Life balance chart" role="img">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => minutesToHours(value as number)}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <table className="sr-only">
          <caption>Time spent per category</caption>
          <thead>
            <tr>
              <th>Category</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.label}>
                <td>{c.label}</td>
                <td>{minutesToHours(c.minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
