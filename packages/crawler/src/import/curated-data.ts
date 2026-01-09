/**
 * Import Curated Data
 *
 * Imports corporate backing and AI disruption flags into the database.
 *
 * Run with: pnpm --filter @support-oss/crawler import:curated
 */

import { db, schema } from '@support-oss/db'
import { eq } from 'drizzle-orm'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const { packages } = schema

const __dirname = dirname(fileURLToPath(import.meta.url))

interface CorporateBackingData {
  packages: Array<{
    name: string
    company: string
  }>
}

interface AIDisruptionData {
  packages: Array<{
    name: string
    disruptionType: string
    note: string
    source?: string
  }>
}

async function importCorporateBacking() {
  console.log('Importing corporate backing data...')

  const dataPath = join(__dirname, '../data/corporate-backing.json')
  const data: CorporateBackingData = JSON.parse(readFileSync(dataPath, 'utf-8'))

  let updated = 0
  let notFound = 0

  for (const pkg of data.packages) {
    const result = await db
      .update(packages)
      .set({
        corporateBacking: pkg.company,
        updatedAt: new Date(),
      })
      .where(eq(packages.name, pkg.name))
      .returning()

    if (result.length > 0) {
      updated++
    } else {
      // Package doesn't exist yet - create it
      await db
        .insert(packages)
        .values({
          name: pkg.name,
          corporateBacking: pkg.company,
          enrichmentStatus: 'pending',
        })
        .onConflictDoNothing()
      updated++
    }
  }

  console.log(`Corporate backing: ${updated} packages updated`)
}

async function importAIDisruption() {
  console.log('Importing AI disruption data...')

  const dataPath = join(__dirname, '../data/ai-disruption.json')
  const data: AIDisruptionData = JSON.parse(readFileSync(dataPath, 'utf-8'))

  let updated = 0

  for (const pkg of data.packages) {
    const result = await db
      .update(packages)
      .set({
        aiDisruptionFlag: true,
        aiDisruptionNote: `[${pkg.disruptionType}] ${pkg.note}`,
        updatedAt: new Date(),
      })
      .where(eq(packages.name, pkg.name))
      .returning()

    if (result.length > 0) {
      updated++
    } else {
      // Package doesn't exist yet - create it
      await db
        .insert(packages)
        .values({
          name: pkg.name,
          aiDisruptionFlag: true,
          aiDisruptionNote: `[${pkg.disruptionType}] ${pkg.note}`,
          enrichmentStatus: 'pending',
        })
        .onConflictDoNothing()
      updated++
    }
  }

  console.log(`AI disruption: ${updated} packages flagged`)
}

async function main() {
  console.log('Importing curated data...\n')

  await importCorporateBacking()
  await importAIDisruption()

  console.log('\nCurated data import complete!')
}

main().catch((err) => {
  console.error('Import failed:', err)
  process.exit(1)
})
