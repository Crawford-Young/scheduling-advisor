// One-off: encrypt plaintext OAuth tokens in accounts. Idempotent via v1: prefix.
// Run: node --env-file=.env.local scripts/encrypt-account-tokens.mjs
import { neon } from '@neondatabase/serverless'
import { createCipheriv, randomBytes } from 'node:crypto'

const PREFIX = 'v1:'
const key = Buffer.from(process.env.TOKEN_ENC_KEY ?? '', 'base64')
if (key.length !== 32) throw new Error('TOKEN_ENC_KEY must decode to 32 bytes')
const sql = neon(process.env.DATABASE_URL)

function encrypt(plain) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `${PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`
}

const rows = await sql`
  SELECT provider, provider_account_id, access_token, refresh_token FROM accounts
`
let updated = 0
for (const row of rows) {
  const set = {}
  if (row.access_token && !row.access_token.startsWith(PREFIX))
    set.access_token = encrypt(row.access_token)
  if (row.refresh_token && !row.refresh_token.startsWith(PREFIX))
    set.refresh_token = encrypt(row.refresh_token)
  if (Object.keys(set).length === 0) continue
  await sql`
    UPDATE accounts
    SET access_token = ${set.access_token ?? row.access_token},
        refresh_token = ${set.refresh_token ?? row.refresh_token}
    WHERE provider = ${row.provider} AND provider_account_id = ${row.provider_account_id}
  `
  updated += 1
}
console.log(`encrypted token fields on ${updated} of ${rows.length} account rows`)
