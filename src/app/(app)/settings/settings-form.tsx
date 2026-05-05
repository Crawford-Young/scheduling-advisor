'use client'
import { useState, useTransition } from 'react'
import { saveApiKey, clearApiKey, saveModelPreference } from '@/server/actions/user-settings'

const MODELS = [
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    description: 'Fast, cost-efficient. Recommended for daily use.',
  },
  {
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    description: 'Most capable. Better for complex scheduling and reflection.',
  },
] as const

interface SettingsFormProps {
  maskedApiKey: string | null
  currentModel: string
}

export function SettingsForm({ maskedApiKey, currentModel }: SettingsFormProps) {
  const [model, setModel] = useState(currentModel)
  const [, startTransition] = useTransition()

  return (
    <div className="space-y-10">
      <section className="space-y-6">
        <h2 className="border-border border-b pb-2 text-lg font-semibold">AI Configuration</h2>

        <div className="space-y-3">
          <label htmlFor="apiKey" className="text-sm font-medium">
            Anthropic API Key
          </label>
          {maskedApiKey && (
            <p className="text-muted-foreground font-mono text-sm">{maskedApiKey}</p>
          )}
          <form action={saveApiKey} className="flex gap-2">
            <input
              id="apiKey"
              name="apiKey"
              type="password"
              placeholder="sk-ant-api01-..."
              className="border-input bg-background flex-1 rounded-md border px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
            >
              Save
            </button>
          </form>
          {maskedApiKey && (
            <form action={clearApiKey}>
              <button
                type="submit"
                className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
              >
                Clear key
              </button>
            </form>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Model</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setModel(m.id)
                  startTransition(async () => {
                    await saveModelPreference(m.id)
                  })
                }}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  model === m.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <p className="text-sm font-medium">{m.label}</p>
                <p className="text-muted-foreground mt-1 text-xs">{m.description}</p>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
