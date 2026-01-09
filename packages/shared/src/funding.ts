/**
 * Funding helper functions
 *
 * Utilities for normalizing and displaying funding data from
 * OpenCollective and GitHub Sponsors.
 */

export interface TopSponsor {
  name: string
  imageUrl: string | null
  profileUrl: string
}

export interface FundingSummary {
  platform: 'opencollective' | 'github'
  profileUrl: string
  balanceRange: string | null
  monthlyIncomeRange: string | null
  sponsorCount: number
  goalProgress: number | null // 0-100 or null if no goal
  topSponsors: TopSponsor[]
}

/**
 * Formats a dollar amount as a range string.
 * Example: 1234 -> "$1K-2K"
 */
export function formatAmountRange(amount: number | null | undefined): string | null {
  if (amount == null || amount <= 0) return null

  // Define ranges
  const ranges = [
    { min: 0, max: 100, label: '<$100' },
    { min: 100, max: 500, label: '$100-500' },
    { min: 500, max: 1000, label: '$500-1K' },
    { min: 1000, max: 5000, label: '$1K-5K' },
    { min: 5000, max: 10000, label: '$5K-10K' },
    { min: 10000, max: 25000, label: '$10K-25K' },
    { min: 25000, max: 50000, label: '$25K-50K' },
    { min: 50000, max: 100000, label: '$50K-100K' },
    { min: 100000, max: 250000, label: '$100K-250K' },
    { min: 250000, max: 500000, label: '$250K-500K' },
    { min: 500000, max: 1000000, label: '$500K-1M' },
    { min: 1000000, max: Infinity, label: '>$1M' },
  ]

  for (const range of ranges) {
    if (amount >= range.min && amount < range.max) {
      return range.label
    }
  }

  return '>$1M'
}

/**
 * Formats monthly income as a range with "/mo" suffix.
 */
export function formatMonthlyRange(yearlyAmount: number | null | undefined): string | null {
  if (yearlyAmount == null || yearlyAmount <= 0) return null

  const monthly = yearlyAmount / 12
  const range = formatAmountRange(monthly)
  return range ? `${range}/mo` : null
}

interface PackageWithFunding {
  // OC fields
  ocSlug?: string | null
  ocBalance?: number | null
  ocYearlyIncome?: number | null
  ocBackersCount?: number | null
  ocGoalAmount?: number | null
  ocGoalProgress?: number | null
  ocTopSponsors?: TopSponsor[] | null

  // GH fields
  ghHasSponsorsListing?: boolean | null
  ghSponsorsCount?: number | null
  ghTopSponsors?: TopSponsor[] | null

  // Repo owner for GH sponsors URL
  repositoryOwner?: string | null
}

/**
 * Builds a normalized FundingSummary from package data.
 * Returns null if no funding data is available.
 */
export function buildFundingSummary(pkg: PackageWithFunding): FundingSummary | null {
  // Prefer OpenCollective if we have data
  if (pkg.ocSlug) {
    return {
      platform: 'opencollective',
      profileUrl: `https://opencollective.com/${pkg.ocSlug}`,
      balanceRange: formatAmountRange(pkg.ocBalance),
      monthlyIncomeRange: formatMonthlyRange(pkg.ocYearlyIncome),
      sponsorCount: pkg.ocBackersCount || 0,
      goalProgress: pkg.ocGoalProgress ?? null,
      topSponsors: (pkg.ocTopSponsors as TopSponsor[]) || [],
    }
  }

  // Fall back to GitHub Sponsors
  if (pkg.ghHasSponsorsListing && pkg.repositoryOwner) {
    // Normalize GitHub sponsors (avatarUrl -> imageUrl)
    // GitHub crawler stores avatarUrl, but we normalize to imageUrl for consistency
    const rawSponsors = pkg.ghTopSponsors as unknown
    const ghSponsors = (Array.isArray(rawSponsors) ? rawSponsors : []) as Array<{
      name: string
      avatarUrl?: string | null
      imageUrl?: string | null
      profileUrl: string
    }>
    const normalizedSponsors: TopSponsor[] = ghSponsors.map((s) => ({
      name: s.name,
      imageUrl: s.avatarUrl ?? s.imageUrl ?? null,
      profileUrl: s.profileUrl,
    }))

    return {
      platform: 'github',
      profileUrl: `https://github.com/sponsors/${pkg.repositoryOwner}`,
      balanceRange: null, // GH doesn't expose balance
      monthlyIncomeRange: null, // GH doesn't expose income
      sponsorCount: pkg.ghSponsorsCount || 0,
      goalProgress: null, // GH goals not readily available
      topSponsors: normalizedSponsors,
    }
  }

  return null
}

/**
 * Checks if a package has any meaningful funding data to display.
 */
export function hasFundingData(pkg: PackageWithFunding): boolean {
  return !!(
    pkg.ocSlug ||
    (pkg.ghHasSponsorsListing && pkg.repositoryOwner)
  )
}
