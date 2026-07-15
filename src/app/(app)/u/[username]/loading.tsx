import * as React from 'react'

export default function ProfileLoading(): React.JSX.Element {
  return <div className="mx-auto max-w-2xl animate-pulse space-y-4 p-4" aria-busy="true" />
}
