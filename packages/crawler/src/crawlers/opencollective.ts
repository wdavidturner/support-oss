/**
 * OpenCollective Enrichment Crawler
 *
 * For each package, checks if an OpenCollective collective exists and fetches:
 * - Balance
 * - Yearly income
 * - Backers count
 *
 * Run with: pnpm --filter @support-oss/crawler crawl:oc
 */

import { db, schema } from '@support-oss/db'
import { eq, isNotNull, or, isNull, lt, and } from 'drizzle-orm'

const { packages, fundingSources } = schema

// OpenCollective GraphQL API
const OC_GRAPHQL = 'https://api.opencollective.com/graphql/v2'

// Rate limiting - OC is more restrictive
const DELAY_MS = 500 // 500ms between requests
const BATCH_SIZE = 20

// Stale threshold
const STALE_DAYS = 7

interface OCTopSponsor {
  name: string
  imageUrl: string | null
  profileUrl: string
}

interface OCCollectiveData {
  collective: {
    slug: string
    stats: {
      balance: { valueInCents: number }
      yearlyBudget: { valueInCents: number }
      backers: { all: number }
    }
    goals: Array<{
      amount: { valueInCents: number }
      percentCompleted: number
    }> | null
    members: {
      nodes: Array<{
        role: string
        account: {
          name: string
          slug: string
          imageUrl: string | null
        }
        totalDonations: { valueInCents: number }
      }>
    }
  } | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const COLLECTIVE_QUERY = `
  query GetCollective($slug: String!) {
    collective(slug: $slug) {
      slug
      stats {
        balance {
          valueInCents
        }
        yearlyBudget {
          valueInCents
        }
        backers {
          all
        }
      }
      goals {
        amount {
          valueInCents
        }
        percentCompleted
      }
      members(role: BACKER, limit: 5, orderBy: {field: TOTAL_CONTRIBUTED, direction: DESC}) {
        nodes {
          role
          account {
            name
            slug
            imageUrl(height: 64)
          }
          totalDonations {
            valueInCents
          }
        }
      }
    }
  }
`

async function fetchCollective(slug: string): Promise<OCCollectiveData['collective'] | null> {
  try {
    const response = await fetch(OC_GRAPHQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: COLLECTIVE_QUERY,
        variables: { slug },
      }),
    })

    if (!response.ok) {
      console.warn(`OC API error for ${slug}: ${response.status}`)
      return null
    }

    const data = (await response.json()) as { data: OCCollectiveData }
    return data.data.collective
  } catch (error) {
    console.error(`Failed to fetch OC data for ${slug}:`, error)
    return null
  }
}

// Extract OC slug from funding URL
function extractOCSlug(fundingUrl: string | null): string | null {
  if (!fundingUrl) return null

  // Match opencollective.com/SLUG patterns
  const match = fundingUrl.match(/opencollective\.com\/([a-zA-Z0-9_-]+)/)
  if (match && match[1]) {
    return match[1]
  }
  return null
}

// Common slug variations to try (only used when no direct URL)
function getSlugVariations(packageName: string): string[] {
  const slugs = [packageName]

  // Remove scope
  if (packageName.startsWith('@')) {
    const unscoped = packageName.split('/')[1]
    if (unscoped) slugs.push(unscoped)
  }

  return [...new Set(slugs)]
}

function extractTopSponsors(collective: NonNullable<OCCollectiveData['collective']>): OCTopSponsor[] {
  if (!collective.members?.nodes) return []

  return collective.members.nodes
    .filter((m) => m.account && m.totalDonations.valueInCents > 0)
    .slice(0, 3)
    .map((m) => ({
      name: m.account.name || m.account.slug,
      imageUrl: m.account.imageUrl,
      profileUrl: `https://opencollective.com/${m.account.slug}`,
    }))
}

async function enrichPackageOC(packageName: string, fundingUrl: string | null): Promise<boolean> {
  // First, try direct slug from funding URL
  const directSlug = extractOCSlug(fundingUrl)
  if (directSlug) {
    const collective = await fetchCollective(directSlug)
    if (collective) {
      console.log(`Found OC collective for ${packageName}: ${directSlug} (from funding URL)`)

      // Extract goal info (use first goal if multiple)
      const goal = collective.goals?.[0]
      const topSponsors = extractTopSponsors(collective)

      await db
        .update(packages)
        .set({
          ocSlug: collective.slug,
          ocBalance: collective.stats.balance.valueInCents / 100,
          ocYearlyIncome: collective.stats.yearlyBudget.valueInCents / 100,
          ocBackersCount: collective.stats.backers.all,
          ocGoalAmount: goal ? goal.amount.valueInCents / 100 : null,
          ocGoalProgress: goal ? goal.percentCompleted : null,
          ocTopSponsors: topSponsors.length > 0 ? topSponsors : null,
          updatedAt: new Date(),
        })
        .where(eq(packages.name, packageName))

      return true
    }
  }

  // If no direct URL, try package name variations (but be conservative)
  if (!directSlug) {
    const slugsToTry = getSlugVariations(packageName)

    for (const slug of slugsToTry) {
      const collective = await fetchCollective(slug)

      if (collective) {
        console.log(`Found OC collective for ${packageName}: ${slug} (by name)`)

        const goal = collective.goals?.[0]
        const topSponsors = extractTopSponsors(collective)

        await db
          .update(packages)
          .set({
            ocSlug: collective.slug,
            ocBalance: collective.stats.balance.valueInCents / 100,
            ocYearlyIncome: collective.stats.yearlyBudget.valueInCents / 100,
            ocBackersCount: collective.stats.backers.all,
            ocGoalAmount: goal ? goal.amount.valueInCents / 100 : null,
            ocGoalProgress: goal ? goal.percentCompleted : null,
            ocTopSponsors: topSponsors.length > 0 ? topSponsors : null,
            updatedAt: new Date(),
          })
          .where(eq(packages.name, packageName))

        return true
      }

      await sleep(DELAY_MS)
    }
  }

  // No collective found - that's okay, not an error
  return false
}

async function crawl() {
  console.log('Starting OpenCollective crawler...')

  const staleDate = new Date()
  staleDate.setDate(staleDate.getDate() - STALE_DAYS)

  // Get packages with OC funding sources from GitHub FUNDING.yml
  const ocFundingEntries = await db
    .select({ packageName: fundingSources.packageName, url: fundingSources.url })
    .from(fundingSources)
    .where(eq(fundingSources.platform, 'opencollective'))

  const packagesWithOCFromGithub = new Map(
    ocFundingEntries
      .filter((e) => e.packageName)
      .map((e) => [e.packageName!, e.url])
  )

  console.log(`Found ${packagesWithOCFromGithub.size} packages with OC links from GitHub FUNDING.yml`)

  // Get packages that haven't been OC-checked recently
  const packagesToEnrich = await db
    .select({ name: packages.name, npmFundingUrl: packages.npmFundingUrl })
    .from(packages)
    .where(
      or(
        // Not yet checked for OC
        isNull(packages.ocSlug),
        // Or stale
        lt(packages.updatedAt, staleDate)
      )
    )
    .limit(2000)

  // Build list with OC URLs from multiple sources
  const enrichList: { name: string; ocUrl: string | null }[] = []

  for (const pkg of packagesToEnrich) {
    // Check GitHub FUNDING.yml first
    const githubOCUrl = packagesWithOCFromGithub.get(pkg.name)
    if (githubOCUrl) {
      enrichList.push({ name: pkg.name, ocUrl: githubOCUrl })
      continue
    }

    // Check npm funding URL
    if (pkg.npmFundingUrl?.includes('opencollective')) {
      enrichList.push({ name: pkg.name, ocUrl: pkg.npmFundingUrl })
      continue
    }
  }

  // Only try name-guessing for first 50 packages without URLs (to avoid rate limits)
  const withoutOCUrl = packagesToEnrich.filter(
    (p) => !packagesWithOCFromGithub.has(p.name) && !p.npmFundingUrl?.includes('opencollective')
  )
  const toGuess = withoutOCUrl.slice(0, 50).map((p) => ({ name: p.name, ocUrl: null }))

  const sorted = [...enrichList, ...toGuess]

  console.log(`Processing ${sorted.length} packages:`)
  console.log(`  ${enrichList.length} have OC URLs (from GitHub or npm)`)
  console.log(`  ${toGuess.length} will try by name`)

  let found = 0
  let notFound = 0

  for (let i = 0; i < sorted.length; i++) {
    const pkg = sorted[i]
    if (!pkg) continue

    const hasOC = await enrichPackageOC(pkg.name, pkg.ocUrl)
    if (hasOC) {
      found++
    } else {
      notFound++
    }

    if ((i + 1) % BATCH_SIZE === 0) {
      console.log(`Progress: ${i + 1}/${sorted.length} (${found} found, ${notFound} not found)`)
    }

    await sleep(DELAY_MS)
  }

  console.log(`\nOpenCollective crawl complete!`)
  console.log(`  Found: ${found}`)
  console.log(`  Not found: ${notFound}`)

  process.exit(0)
}

crawl().catch((err) => {
  console.error('OC Crawler failed:', err)
  process.exit(1)
})
