/**
 * GitHub Enrichment Crawler
 *
 * For packages with GitHub repos, fetches:
 * - FUNDING.yml contents (funding links)
 * - Contributor list + commit counts (identify primary maintainer)
 * - Last commit date
 * - Open issues count
 * - Stars, forks
 * - Whether repo is archived
 *
 * Run with: pnpm --filter @support-oss/crawler crawl:github
 *
 * Requires GITHUB_TOKEN environment variable for higher rate limits.
 */

import { db, schema } from '@support-oss/db'
import { eq, isNotNull, and, isNull, or, lt } from 'drizzle-orm'

const { packages, maintainers, packageMaintainers, fundingSources } = schema

// GitHub API
const GITHUB_API = 'https://api.github.com'
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

// Rate limiting
const DELAY_MS = GITHUB_TOKEN ? 100 : 1000 // Much faster with token
const BATCH_SIZE = 50

// Stale threshold
const STALE_DAYS = 7

interface GitHubRepoData {
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  archived: boolean
  pushed_at: string
  default_branch: string
}

interface GitHubContributor {
  login: string
  totalCommits: number
  recentCommits: number // last 6 months
  lastCommitAt: Date | null
}

interface FundingYml {
  github?: string | string[]
  open_collective?: string
  ko_fi?: string
  patreon?: string
  custom?: string | string[]
}

interface GHSponsor {
  name: string
  avatarUrl: string | null
  profileUrl: string
}

interface GHSponsorsData {
  hasSponsorsListing: boolean
  sponsorCount: number
  topSponsors: GHSponsor[]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'support-oss-crawler',
  }
  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`
  }
  return headers
}

async function fetchRepoData(owner: string, repo: string): Promise<GitHubRepoData | null> {
  try {
    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
      headers: getHeaders(),
    })

    if (!response.ok) {
      if (response.status === 404) return null
      if (response.status === 403) {
        console.warn('GitHub rate limit hit, waiting...')
        await sleep(60000) // Wait 1 minute
        return fetchRepoData(owner, repo)
      }
      throw new Error(`GitHub API error: ${response.status}`)
    }

    return (await response.json()) as GitHubRepoData
  } catch (error) {
    console.error(`Failed to fetch repo ${owner}/${repo}:`, error)
    return null
  }
}

interface GitHubStatsContributor {
  author: { login: string }
  total: number
  weeks: Array<{
    w: number // Unix timestamp (seconds)
    a: number // additions
    d: number // deletions
    c: number // commits
  }>
}

async function fetchContributorStats(owner: string, repo: string): Promise<GitHubContributor[]> {
  try {
    const response = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/stats/contributors`,
      { headers: getHeaders() }
    )

    // GitHub returns 202 if stats are being computed - need to retry
    if (response.status === 202) {
      await sleep(2000)
      const retryResponse = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/stats/contributors`,
        { headers: getHeaders() }
      )
      if (!retryResponse.ok) return []
      const data = (await retryResponse.json()) as GitHubStatsContributor[]
      return parseContributorStats(data)
    }

    if (!response.ok) return []
    const data = (await response.json()) as GitHubStatsContributor[]
    return parseContributorStats(data)
  } catch {
    return []
  }
}

function parseContributorStats(stats: GitHubStatsContributor[]): GitHubContributor[] {
  if (!Array.isArray(stats)) return []

  const now = Date.now()
  const sixMonthsAgo = now - (6 * 30 * 24 * 60 * 60 * 1000) // ~6 months in ms

  return stats
    .filter((s) => s.author?.login)
    .map((s) => {
      // Find recent commits (last 6 months) and last commit date
      let recentCommits = 0
      let lastCommitTimestamp = 0

      for (const week of s.weeks) {
        const weekTimestamp = week.w * 1000 // Convert to ms
        if (week.c > 0) {
          // Track last commit (most recent week with commits)
          if (weekTimestamp > lastCommitTimestamp) {
            lastCommitTimestamp = weekTimestamp
          }
          // Count recent commits
          if (weekTimestamp >= sixMonthsAgo) {
            recentCommits += week.c
          }
        }
      }

      return {
        login: s.author.login,
        totalCommits: s.total,
        recentCommits,
        lastCommitAt: lastCommitTimestamp > 0 ? new Date(lastCommitTimestamp) : null,
      }
    })
    // Sort by last commit date (most recent first), then by total commits
    .sort((a, b) => {
      const aTime = a.lastCommitAt?.getTime() || 0
      const bTime = b.lastCommitAt?.getTime() || 0
      if (bTime !== aTime) return bTime - aTime
      return b.totalCommits - a.totalCommits
    })
    .slice(0, 10) // Top 10 contributors
}

async function fetchFundingYml(
  owner: string,
  repo: string,
  branch: string
): Promise<FundingYml | null> {
  try {
    // Try .github/FUNDING.yml
    const response = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/.github/FUNDING.yml`,
      { headers: { 'User-Agent': 'support-oss-crawler' } }
    )

    if (!response.ok) return null

    const content = await response.text()
    return parseFundingYml(content)
  } catch {
    return null
  }
}

// GitHub GraphQL API for sponsors data
const GITHUB_GRAPHQL = 'https://api.github.com/graphql'

const SPONSORS_QUERY = `
  query GetSponsors($login: String!) {
    user(login: $login) {
      hasSponsorsListing
      sponsors(first: 5) {
        totalCount
        nodes {
          ... on User {
            login
            name
            avatarUrl(size: 64)
          }
          ... on Organization {
            login
            name
            avatarUrl(size: 64)
          }
        }
      }
    }
    organization(login: $login) {
      hasSponsorsListing
      sponsors(first: 5) {
        totalCount
        nodes {
          ... on User {
            login
            name
            avatarUrl(size: 64)
          }
          ... on Organization {
            login
            name
            avatarUrl(size: 64)
          }
        }
      }
    }
  }
`

async function fetchSponsorsData(owner: string): Promise<GHSponsorsData | null> {
  if (!GITHUB_TOKEN) {
    // GraphQL requires auth
    return null
  }

  try {
    const response = await fetch(GITHUB_GRAPHQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'support-oss-crawler',
      },
      body: JSON.stringify({
        query: SPONSORS_QUERY,
        variables: { login: owner },
      }),
    })

    if (!response.ok) {
      console.warn(`GitHub GraphQL error for ${owner}: ${response.status}`)
      return null
    }

    const result = await response.json() as {
      data: {
        user: {
          hasSponsorsListing: boolean
          sponsors: {
            totalCount: number
            nodes: Array<{ login: string; name: string | null; avatarUrl: string }>
          }
        } | null
        organization: {
          hasSponsorsListing: boolean
          sponsors: {
            totalCount: number
            nodes: Array<{ login: string; name: string | null; avatarUrl: string }>
          }
        } | null
      }
    }

    // Try user first, then organization
    const entity = result.data?.user || result.data?.organization
    if (!entity) {
      return null
    }

    return {
      hasSponsorsListing: entity.hasSponsorsListing,
      sponsorCount: entity.sponsors?.totalCount || 0,
      topSponsors: (entity.sponsors?.nodes || [])
        .filter((n) => n && n.login)
        .slice(0, 3)
        .map((n) => ({
          name: n.name || n.login,
          avatarUrl: n.avatarUrl || null,
          profileUrl: `https://github.com/${n.login}`,
        })),
    }
  } catch (error) {
    console.error(`Failed to fetch sponsors for ${owner}:`, error)
    return null
  }
}

function parseFundingYml(content: string): FundingYml {
  const funding: FundingYml = {}
  const lines = content.split('\n')

  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/)
    if (!match) continue

    const [, key, value] = match
    if (!key || !value) continue

    const cleanValue = value.trim().replace(/^["']|["']$/g, '')

    // Handle array syntax
    if (cleanValue.startsWith('[')) {
      try {
        const arr = JSON.parse(cleanValue.replace(/'/g, '"'))
        ;(funding as Record<string, unknown>)[key] = arr
      } catch {
        ;(funding as Record<string, unknown>)[key] = cleanValue
      }
    } else {
      ;(funding as Record<string, unknown>)[key] = cleanValue
    }
  }

  return funding
}

async function getOrCreateMaintainer(githubUsername: string): Promise<string> {
  const existing = await db
    .select()
    .from(maintainers)
    .where(eq(maintainers.githubUsername, githubUsername))
    .limit(1)

  if (existing[0]) {
    return existing[0].id
  }

  const id = githubUsername.toLowerCase()
  await db
    .insert(maintainers)
    .values({
      id,
      githubUsername,
      name: githubUsername,
    })
    .onConflictDoNothing()

  return id
}

async function addFundingSource(
  packageName: string,
  maintainerId: string | null,
  platform: 'github' | 'opencollective' | 'kofi' | 'patreon' | 'custom',
  url: string
): Promise<void> {
  const id = `${packageName}-${platform}-${Date.now()}`
  await db
    .insert(fundingSources)
    .values({
      id,
      packageName,
      maintainerId,
      platform,
      url,
      verified: false,
    })
    .onConflictDoNothing()
}

async function enrichPackageGitHub(
  packageName: string,
  owner: string,
  repo: string
): Promise<boolean> {
  console.log(`Enriching GitHub: ${owner}/${repo} for ${packageName}`)

  const repoData = await fetchRepoData(owner, repo)
  if (!repoData) return false

  // Fetch contributors, funding, and sponsors in parallel
  const [contributors, funding, sponsors] = await Promise.all([
    fetchContributorStats(owner, repo),
    fetchFundingYml(owner, repo, repoData.default_branch),
    fetchSponsorsData(owner),
  ])

  // Update package with GitHub data including sponsors
  await db
    .update(packages)
    .set({
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      openIssues: repoData.open_issues_count,
      isArchived: repoData.archived,
      lastCommit: new Date(repoData.pushed_at),
      // Sponsors data
      ghHasSponsorsListing: sponsors?.hasSponsorsListing || false,
      ghSponsorsCount: sponsors?.sponsorCount || null,
      ghTopSponsors: sponsors?.topSponsors && sponsors.topSponsors.length > 0
        ? sponsors.topSponsors
        : null,
      updatedAt: new Date(),
    })
    .where(eq(packages.name, packageName))

  // Process contributors (sorted by recent activity)
  if (contributors.length > 0) {
    const totalCommits = contributors.reduce((sum, c) => sum + c.totalCommits, 0)

    for (let i = 0; i < Math.min(contributors.length, 5); i++) {
      const contributor = contributors[i]
      if (!contributor) continue

      const maintainerId = await getOrCreateMaintainer(contributor.login)
      const percentage = (contributor.totalCommits / totalCommits) * 100

      await db
        .insert(packageMaintainers)
        .values({
          packageName,
          maintainerId,
          isPrimary: i === 0,
          commitPercentage: Math.round(percentage * 10) / 10,
          recentCommits: contributor.recentCommits,
          lastCommitAt: contributor.lastCommitAt,
          source: 'github',
        })
        .onConflictDoNothing()
    }
  }

  // Process funding.yml
  if (funding) {
    // GitHub Sponsors
    if (funding.github) {
      const sponsors = Array.isArray(funding.github) ? funding.github : [funding.github]
      for (const sponsor of sponsors) {
        await addFundingSource(
          packageName,
          null,
          'github',
          `https://github.com/sponsors/${sponsor}`
        )
      }
    }

    // OpenCollective
    if (funding.open_collective) {
      await addFundingSource(
        packageName,
        null,
        'opencollective',
        `https://opencollective.com/${funding.open_collective}`
      )
    }

    // Ko-fi
    if (funding.ko_fi) {
      await addFundingSource(packageName, null, 'kofi', `https://ko-fi.com/${funding.ko_fi}`)
    }

    // Patreon
    if (funding.patreon) {
      await addFundingSource(
        packageName,
        null,
        'patreon',
        `https://patreon.com/${funding.patreon}`
      )
    }

    // Custom
    if (funding.custom) {
      const customs = Array.isArray(funding.custom) ? funding.custom : [funding.custom]
      for (const url of customs) {
        if (url.startsWith('http')) {
          await addFundingSource(packageName, null, 'custom', url)
        }
      }
    }
  }

  return true
}

async function crawl() {
  console.log('Starting GitHub enrichment crawler...')
  if (!GITHUB_TOKEN) {
    console.warn('Warning: No GITHUB_TOKEN set. Rate limits will be very restrictive.')
  }

  const staleDate = new Date()
  staleDate.setDate(staleDate.getDate() - STALE_DAYS)

  // Get packages with GitHub repos that haven't been GitHub-enriched
  const packagesToEnrich = await db
    .select({
      name: packages.name,
      owner: packages.repositoryOwner,
      repo: packages.repositoryName,
    })
    .from(packages)
    .where(
      and(
        isNotNull(packages.repositoryOwner),
        isNotNull(packages.repositoryName),
        or(isNull(packages.stars), lt(packages.updatedAt, staleDate))
      )
    )
    .limit(500)

  console.log(`Found ${packagesToEnrich.length} packages to enrich from GitHub`)

  let success = 0
  let failed = 0

  for (let i = 0; i < packagesToEnrich.length; i++) {
    const pkg = packagesToEnrich[i]
    if (!pkg?.owner || !pkg?.repo) continue

    const ok = await enrichPackageGitHub(pkg.name, pkg.owner, pkg.repo)
    if (ok) {
      success++
    } else {
      failed++
    }

    if ((i + 1) % BATCH_SIZE === 0) {
      console.log(`Progress: ${i + 1}/${packagesToEnrich.length} (${success} success, ${failed} failed)`)
    }

    await sleep(DELAY_MS)
  }

  console.log(`\nGitHub crawl complete!`)
  console.log(`  Success: ${success}`)
  console.log(`  Failed: ${failed}`)

  process.exit(0)
}

crawl().catch((err) => {
  console.error('GitHub Crawler failed:', err)
  process.exit(1)
})
