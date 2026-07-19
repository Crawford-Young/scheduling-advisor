import * as React from 'react'

/** Decorative background glow for the login scene — cinematic surface only. */
export function LoginAmbient(): React.JSX.Element {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="bg-accent-subtle absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full opacity-60 blur-3xl" />
      <div className="bg-accent-subtle absolute -bottom-52 -left-24 h-80 w-80 rounded-full opacity-40 blur-3xl" />
    </div>
  )
}
