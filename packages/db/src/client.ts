import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

/**
 * Database client configuration
 *
 * Supports two environments:
 * 1. Vercel Postgres: Uses POSTGRES_URL (pooled) and POSTGRES_URL_NON_POOLED (direct)
 * 2. Local/other: Uses DATABASE_URL
 */

// Vercel Postgres uses POSTGRES_URL, local dev uses DATABASE_URL
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL

if (!connectionString) {
  throw new Error(
    'Database connection string required. Set POSTGRES_URL (Vercel) or DATABASE_URL (local).'
  )
}

// For query purposes (use pooled connection on Vercel)
const queryClient = postgres(connectionString, {
  // Vercel Postgres needs SSL in production
  ssl: process.env.POSTGRES_URL ? 'require' : undefined,
  // Limit connections in serverless environment
  max: process.env.VERCEL ? 1 : 10,
})

export const db = drizzle(queryClient, { schema })

// For migrations (use non-pooled/direct connection)
export function createMigrationClient() {
  // Vercel provides a non-pooled URL for migrations
  const migrationUrl =
    process.env.POSTGRES_URL_NON_POOLED || process.env.DATABASE_URL || connectionString!

  const migrationClient = postgres(migrationUrl, {
    ssl: process.env.POSTGRES_URL_NON_POOLED ? 'require' : undefined,
    max: 1,
  })

  return drizzle(migrationClient)
}

export { schema }
