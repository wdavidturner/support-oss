/**
 * npm Registry Enrichment Crawler
 *
 * Fetches package data from the npm registry API:
 * - Latest version + publish date
 * - All versions with dates (for version adoption tracking)
 * - Maintainers list (npm usernames)
 * - funding field from package.json
 * - repository URL
 * - Weekly download count
 *
 * Run with: pnpm --filter @support-oss/crawler crawl:npm
 */

import { db, schema } from '@support-oss/db'
import { eq, and, or, isNull, lt } from 'drizzle-orm'

const { packages, maintainers, packageMaintainers } = schema

// npm registry API
const NPM_REGISTRY = 'https://registry.npmjs.org'
const NPM_DOWNLOADS_API = 'https://api.npmjs.org/downloads/point/last-week'

// Rate limiting
const DELAY_MS = 100 // 100ms between requests = ~10 req/sec
const BATCH_SIZE = 50

// Stale threshold - re-enrich packages older than this
const STALE_DAYS = 7

interface NpmPackageData {
  name: string
  'dist-tags'?: {
    latest?: string
  }
  time?: Record<string, string>
  maintainers?: Array<{ name: string; email?: string }>
  repository?: {
    type?: string
    url?: string
  }
  funding?:
    | string
    | { type?: string; url?: string }
    | Array<{ type?: string; url?: string }>
}

interface NpmDownloadsData {
  downloads: number
  package: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseRepositoryUrl(repo: NpmPackageData['repository']): {
  url: string | null
  owner: string | null
  name: string | null
} {
  if (!repo?.url) return { url: null, owner: null, name: null }

  let url = repo.url
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/\.git$/, '')
    .replace(/^ssh:\/\/git@github\.com/, 'https://github.com')
    .replace(/^git@github\.com:/, 'https://github.com/')

  // Extract owner/name from GitHub URLs
  const githubMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)/)
  if (githubMatch) {
    return {
      url,
      owner: githubMatch[1] ?? null,
      name: githubMatch[2] ?? null,
    }
  }

  return { url, owner: null, name: null }
}

function parseFundingUrl(
  funding: NpmPackageData['funding']
): string | null {
  if (!funding) return null
  if (typeof funding === 'string') return funding
  if (Array.isArray(funding)) return funding[0]?.url ?? null
  return funding.url ?? null
}

async function fetchPackageData(packageName: string): Promise<NpmPackageData | null> {
  try {
    const response = await fetch(`${NPM_REGISTRY}/${encodeURIComponent(packageName)}`)
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`Package not found: ${packageName}`)
        return null
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return (await response.json()) as NpmPackageData
  } catch (error) {
    console.error(`Failed to fetch ${packageName}:`, error)
    return null
  }
}

async function fetchDownloads(packageName: string): Promise<number | null> {
  try {
    const response = await fetch(`${NPM_DOWNLOADS_API}/${encodeURIComponent(packageName)}`)
    if (!response.ok) return null
    const data = (await response.json()) as NpmDownloadsData
    return data.downloads
  } catch {
    return null
  }
}

async function getOrCreateMaintainer(
  npmUsername: string
): Promise<string> {
  // Check if maintainer exists
  const existing = await db
    .select()
    .from(maintainers)
    .where(eq(maintainers.npmUsername, npmUsername))
    .limit(1)

  if (existing[0]) {
    return existing[0].id
  }

  // Create new maintainer
  const id = npmUsername.toLowerCase()
  await db
    .insert(maintainers)
    .values({
      id,
      npmUsername,
      name: npmUsername, // Will be enriched later from GitHub
    })
    .onConflictDoNothing()

  return id
}

async function enrichPackage(packageName: string): Promise<boolean> {
  console.log(`Enriching: ${packageName}`)

  // Fetch data in parallel
  const [npmData, downloads] = await Promise.all([
    fetchPackageData(packageName),
    fetchDownloads(packageName),
  ])

  if (!npmData) {
    // Mark as failed
    await db
      .update(packages)
      .set({
        enrichmentStatus: 'failed',
        updatedAt: new Date(),
      })
      .where(eq(packages.name, packageName))
    return false
  }

  // Parse repository info
  const { url: repoUrl, owner: repoOwner, name: repoName } = parseRepositoryUrl(npmData.repository)

  // Parse funding
  const fundingUrl = parseFundingUrl(npmData.funding)

  // Get latest version info
  const latestVersion = npmData['dist-tags']?.latest
  const lastPublishStr = latestVersion ? npmData.time?.[latestVersion] : null
  const lastPublish = lastPublishStr ? new Date(lastPublishStr) : null

  // Update package
  await db
    .update(packages)
    .set({
      latestVersion,
      lastPublish,
      weeklyDownloads: downloads,
      repositoryUrl: repoUrl,
      repositoryOwner: repoOwner,
      repositoryName: repoName,
      npmFundingUrl: fundingUrl,
      enrichmentStatus: 'completed',
      lastEnrichedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(packages.name, packageName))

  // Link maintainers
  if (npmData.maintainers?.length) {
    for (let i = 0; i < npmData.maintainers.length; i++) {
      const maintainer = npmData.maintainers[i]
      if (!maintainer?.name) continue

      const maintainerId = await getOrCreateMaintainer(maintainer.name)

      await db
        .insert(packageMaintainers)
        .values({
          packageName,
          maintainerId,
          isPrimary: i === 0, // First maintainer is primary
          source: 'npm',
        })
        .onConflictDoNothing()
    }
  }

  return true
}

async function crawl() {
  console.log('Starting npm registry crawler...')

  // Get packages that need enrichment
  const staleDate = new Date()
  staleDate.setDate(staleDate.getDate() - STALE_DAYS)

  const packagesToEnrich = await db
    .select({ name: packages.name })
    .from(packages)
    .where(
      or(
        eq(packages.enrichmentStatus, 'pending'),
        and(
          eq(packages.enrichmentStatus, 'completed'),
          lt(packages.lastEnrichedAt, staleDate)
        ),
        and(
          eq(packages.enrichmentStatus, 'completed'),
          isNull(packages.lastEnrichedAt)
        )
      )
    )
    .limit(20000) // Process all packages (increase if needed)

  console.log(`Found ${packagesToEnrich.length} packages to enrich`)

  let success = 0
  let failed = 0

  for (let i = 0; i < packagesToEnrich.length; i++) {
    const pkg = packagesToEnrich[i]
    if (!pkg) continue

    // Mark as in progress
    await db
      .update(packages)
      .set({ enrichmentStatus: 'in_progress' })
      .where(eq(packages.name, pkg.name))

    const ok = await enrichPackage(pkg.name)
    if (ok) {
      success++
    } else {
      failed++
    }

    // Progress update every batch
    if ((i + 1) % BATCH_SIZE === 0) {
      console.log(`Progress: ${i + 1}/${packagesToEnrich.length} (${success} success, ${failed} failed)`)
    }

    // Rate limiting
    await sleep(DELAY_MS)
  }

  console.log(`\nCrawl complete!`)
  console.log(`  Success: ${success}`)
  console.log(`  Failed: ${failed}`)

  process.exit(0)
}

// Run if called directly
crawl().catch((err) => {
  console.error('Crawler failed:', err)
  process.exit(1)
})
