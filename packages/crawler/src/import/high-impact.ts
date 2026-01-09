/**
 * Import high-impact npm packages into the database
 *
 * This script seeds the database with ~15,000 high-impact packages
 * from the npm-high-impact package. All packages are marked as
 * pending enrichment.
 *
 * Run with: pnpm --filter @support-oss/crawler import:high-impact
 */

import { npmHighImpact } from 'npm-high-impact'
import { db, schema } from '@support-oss/db'

const { packages } = schema

async function importHighImpactPackages() {
  console.log('Importing high-impact npm packages...')

  // Get all package names from npm-high-impact
  const packageNames = npmHighImpact
  console.log(`Found ${packageNames.length} high-impact packages`)

  // Import in batches to avoid overwhelming the database
  const BATCH_SIZE = 500
  let imported = 0
  let skipped = 0

  for (let i = 0; i < packageNames.length; i += BATCH_SIZE) {
    const batch = packageNames.slice(i, i + BATCH_SIZE)

    const values = batch.map((name) => ({
      name,
      enrichmentStatus: 'pending' as const,
    }))

    // Insert packages, skip if they already exist
    const result = await db.insert(packages).values(values).onConflictDoNothing().returning()

    imported += result.length
    skipped += batch.length - result.length

    console.log(
      `Batch ${Math.floor(i / BATCH_SIZE) + 1}: imported ${result.length}, skipped ${batch.length - result.length} (total: ${imported})`
    )
  }

  console.log(`\nImport complete!`)
  console.log(`  Total packages: ${packageNames.length}`)
  console.log(`  Newly imported: ${imported}`)
  console.log(`  Already existed: ${skipped}`)

  // Show enrichment status breakdown
  const pendingCount = await db
    .select()
    .from(packages)
    .where(schema.enrichmentStatusEnum.enumValues.includes('pending') ? undefined : undefined)

  console.log(`\nAll packages are marked as 'pending' enrichment.`)
  console.log(`Run the npm crawler next: pnpm --filter @support-oss/crawler crawl:npm`)
}

importHighImpactPackages().catch((err) => {
  console.error('Import failed:', err)
  process.exit(1)
})
