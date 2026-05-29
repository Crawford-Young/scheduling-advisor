'use client'
import { useState, useTransition } from 'react'
import {
  saveAnthropicKey,
  clearAnthropicKey,
  saveGoogleAiKey,
  clearGoogleAiKey,
  saveProvider,
  saveModelPreference,
} from '@/server/actions/user-settings'
import { MODELS_BY_PROVIDER } from '@/lib/schemas/user-settings'
import type { Provider } from '@/lib/schemas/user-settings'

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: 'Anthropic',
  google: 'Google AI Studio',
}

const MODEL_DESCRIPTIONS: Record<string, string> = {
  'claude-sonnet-4-6': 'Fast, cost-efficient. Recommended for daily use.',
  'claude-opus-4-7': 'Most capable. Better for complex scheduling.',
  'claude-haiku-4-5': 'Fastest and cheapest Anthropic model.',
  'gemini-2.5-pro': 'Most capable Google model.',
  'gemini-2.0-flash': 'Fast, efficient. Good for daily use.',
  'gemini-2.0-flash-lite': 'Fastest and cheapest Google model.',
}

interface SettingsFormProps {
  readonly maskedAnthropicKey: string | null
  readonly maskedGoogleKey: string | null
  readonly activeProvider: Provider
  readonly currentModel: string
}

export function SettingsForm({
  maskedAnthropicKey,
  maskedGoogleKey,
  activeProvider,
  currentModel,
}: SettingsFormProps) {
  const [provider, setProvider] = useState<Provider>(activeProvider)
  const [model, setModel] = useState(currentModel)
  const [, startTransition] = useTransition()

  const models = MODELS_BY_PROVIDER[provider]

  function handleProviderChange(p: Provider) {
    setProvider(p)
    startTransition(async () => {
      await saveProvider(p)
    })
  }

  function handleModelChange(m: string) {
    setModel(m)
    startTransition(async () => {
      await saveModelPreference(m)
    })
  }

  return (
    <div className="space-y-10">
      {/* Provider selection */}
      <section className="space-y-4">
        <h2 className="border-border text-foreground border-b pb-2 text-lg font-semibold">
          AI Provider
        </h2>
        <div className="flex gap-2">
          {(['anthropic', 'google'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handleProviderChange(p)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                provider === p
                  ? 'border-accent bg-accent-subtle text-foreground'
                  : 'border-border text-muted-foreground hover:border-accent/50 hover:text-foreground bg-transparent'
              }`}
            >
              {PROVIDER_LABELS[p]}
            </button>
          ))}
        </div>
      </section>

      {/* Anthropic API key */}
      {provider === 'anthropic' && (
        <section className="space-y-4">
          <h2 className="border-border text-foreground border-b pb-2 text-lg font-semibold">
            Anthropic API Key
          </h2>
          {maskedAnthropicKey && (
            <p className="text-muted-foreground font-mono text-sm">{maskedAnthropicKey}</p>
          )}
          <form action={(fd) => void saveAnthropicKey(fd)} className="flex gap-2">
            <input
              name="apiKey"
              type="password"
              placeholder="sk-ant-api01-..."
              className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring flex-1 rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
            <button
              type="submit"
              className="bg-accent text-accent-foreground hover:bg-accent-hover rounded-md px-4 py-2 text-sm font-medium"
            >
              Save
            </button>
          </form>
          {maskedAnthropicKey && (
            <form action={() => void clearAnthropicKey()}>
              <button
                type="submit"
                className="border-border text-muted-foreground hover:bg-surface-raised rounded-md border px-3 py-1.5 text-sm"
              >
                Clear key
              </button>
            </form>
          )}
        </section>
      )}

      {/* Google AI Studio API key */}
      {provider === 'google' && (
        <section className="space-y-4">
          <h2 className="border-border text-foreground border-b pb-2 text-lg font-semibold">
            Google AI Studio API Key
          </h2>
          {maskedGoogleKey && (
            <p className="text-muted-foreground font-mono text-sm">{maskedGoogleKey}</p>
          )}
          <form action={(fd) => void saveGoogleAiKey(fd)} className="flex gap-2">
            <input
              name="apiKey"
              type="password"
              placeholder="AIza..."
              className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring flex-1 rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
            <button
              type="submit"
              className="bg-accent text-accent-foreground hover:bg-accent-hover rounded-md px-4 py-2 text-sm font-medium"
            >
              Save
            </button>
          </form>
          {maskedGoogleKey && (
            <form action={() => void clearGoogleAiKey()}>
              <button
                type="submit"
                className="border-border text-muted-foreground hover:bg-surface-raised rounded-md border px-3 py-1.5 text-sm"
              >
                Clear key
              </button>
            </form>
          )}
        </section>
      )}

      {/* Model selection */}
      <section className="space-y-4">
        <h2 className="border-border text-foreground border-b pb-2 text-lg font-semibold">Model</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {models.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleModelChange(m)}
              className={`rounded-lg border p-4 text-left transition-colors ${
                model === m
                  ? 'border-accent bg-accent-subtle'
                  : 'border-border hover:border-accent/50'
              }`}
            >
              <p className="text-foreground text-sm font-medium">{m}</p>
              <p className="text-muted-foreground mt-1 text-xs">{MODEL_DESCRIPTIONS[m] ?? ''}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
