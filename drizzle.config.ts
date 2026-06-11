import { defineConfig } from 'drizzle-kit'
import { config } from 'dotenv'

config({ path: '.env.local' })

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL not set — ensure .env.local exists')

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
})
