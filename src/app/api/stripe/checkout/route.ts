import { NextResponse } from 'next/server'

export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Not implemented — see Task 8' }, { status: 501 })
}
