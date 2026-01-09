import { defineConfig } from 'drizzle-kit'

// Use non-pooled connection for migrations (Vercel) or DATABASE_URL (local)
const connectionString =
  process.env.POSTGRES_URL_NON_POOLED || process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('Set POSTGRES_URL_NON_POOLED (Vercel) or DATABASE_URL (local)')
}

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: connectionString,
  },
})
