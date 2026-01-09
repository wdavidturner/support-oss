import { describe, it, expect } from 'vitest'
import {
  formatAmountRange,
  formatMonthlyRange,
  buildFundingSummary,
  hasFundingData,
} from './funding.js'

describe('formatAmountRange', () => {
  describe('null and invalid inputs', () => {
    it('should return null for null input', () => {
      expect(formatAmountRange(null)).toBeNull()
    })

    it('should return null for undefined input', () => {
      expect(formatAmountRange(undefined)).toBeNull()
    })

    it('should return null for zero amount', () => {
      expect(formatAmountRange(0)).toBeNull()
    })

    it('should return null for negative amounts', () => {
      expect(formatAmountRange(-100)).toBeNull()
    })
  })

  describe('range boundaries', () => {
    it('should return "<$100" for amounts under 100', () => {
      expect(formatAmountRange(50)).toBe('<$100')
      expect(formatAmountRange(99)).toBe('<$100')
    })

    it('should return "$100-500" for amounts 100-499', () => {
      expect(formatAmountRange(100)).toBe('$100-500')
      expect(formatAmountRange(250)).toBe('$100-500')
      expect(formatAmountRange(499)).toBe('$100-500')
    })

    it('should return "$500-1K" for amounts 500-999', () => {
      expect(formatAmountRange(500)).toBe('$500-1K')
      expect(formatAmountRange(750)).toBe('$500-1K')
      expect(formatAmountRange(999)).toBe('$500-1K')
    })

    it('should return "$1K-5K" for amounts 1000-4999', () => {
      expect(formatAmountRange(1000)).toBe('$1K-5K')
      expect(formatAmountRange(2500)).toBe('$1K-5K')
      expect(formatAmountRange(4999)).toBe('$1K-5K')
    })

    it('should return "$5K-10K" for amounts 5000-9999', () => {
      expect(formatAmountRange(5000)).toBe('$5K-10K')
      expect(formatAmountRange(7500)).toBe('$5K-10K')
    })

    it('should return "$10K-25K" for amounts 10000-24999', () => {
      expect(formatAmountRange(10000)).toBe('$10K-25K')
      expect(formatAmountRange(20000)).toBe('$10K-25K')
    })

    it('should return "$25K-50K" for amounts 25000-49999', () => {
      expect(formatAmountRange(25000)).toBe('$25K-50K')
      expect(formatAmountRange(40000)).toBe('$25K-50K')
    })

    it('should return "$50K-100K" for amounts 50000-99999', () => {
      expect(formatAmountRange(50000)).toBe('$50K-100K')
      expect(formatAmountRange(75000)).toBe('$50K-100K')
    })

    it('should return "$100K-250K" for amounts 100000-249999', () => {
      expect(formatAmountRange(100000)).toBe('$100K-250K')
      expect(formatAmountRange(200000)).toBe('$100K-250K')
    })

    it('should return "$250K-500K" for amounts 250000-499999', () => {
      expect(formatAmountRange(250000)).toBe('$250K-500K')
      expect(formatAmountRange(400000)).toBe('$250K-500K')
    })

    it('should return "$500K-1M" for amounts 500000-999999', () => {
      expect(formatAmountRange(500000)).toBe('$500K-1M')
      expect(formatAmountRange(750000)).toBe('$500K-1M')
    })

    it('should return ">$1M" for amounts 1000000 and above', () => {
      expect(formatAmountRange(1000000)).toBe('>$1M')
      expect(formatAmountRange(5000000)).toBe('>$1M')
      expect(formatAmountRange(100000000)).toBe('>$1M')
    })
  })

  describe('edge cases', () => {
    it('should handle decimal amounts', () => {
      expect(formatAmountRange(99.99)).toBe('<$100')
      expect(formatAmountRange(100.01)).toBe('$100-500')
    })

    it('should handle very small positive amounts', () => {
      expect(formatAmountRange(0.01)).toBe('<$100')
      expect(formatAmountRange(1)).toBe('<$100')
    })
  })
})

describe('formatMonthlyRange', () => {
  describe('null and invalid inputs', () => {
    it('should return null for null input', () => {
      expect(formatMonthlyRange(null)).toBeNull()
    })

    it('should return null for undefined input', () => {
      expect(formatMonthlyRange(undefined)).toBeNull()
    })

    it('should return null for zero yearly amount', () => {
      expect(formatMonthlyRange(0)).toBeNull()
    })

    it('should return null for negative yearly amount', () => {
      expect(formatMonthlyRange(-12000)).toBeNull()
    })
  })

  describe('monthly conversion', () => {
    it('should divide yearly amount by 12 and format with /mo suffix', () => {
      // $12,000/year = $1,000/month -> "$1K-5K/mo" (1000 is in the $1K-5K range)
      expect(formatMonthlyRange(12000)).toBe('$1K-5K/mo')
    })

    it('should handle yearly amounts that result in small monthly values', () => {
      // $600/year = $50/month -> "<$100/mo"
      expect(formatMonthlyRange(600)).toBe('<$100/mo')
    })

    it('should handle large yearly amounts', () => {
      // $120,000/year = $10,000/month -> "$10K-25K/mo" (10000 is in the $10K-25K range)
      expect(formatMonthlyRange(120000)).toBe('$10K-25K/mo')
    })

    it('should handle yearly amounts over $12M', () => {
      // $24,000,000/year = $2,000,000/month -> ">$1M/mo"
      expect(formatMonthlyRange(24000000)).toBe('>$1M/mo')
    })
  })
})

describe('buildFundingSummary', () => {
  describe('OpenCollective funding', () => {
    it('should build summary for package with OC data', () => {
      const pkg = {
        ocSlug: 'webpack',
        ocBalance: 50000,
        ocYearlyIncome: 120000,
        ocBackersCount: 500,
        ocGoalProgress: 75,
        ocTopSponsors: [
          {
            name: 'Sponsor1',
            imageUrl: 'https://example.com/img1.png',
            profileUrl: 'https://oc.com/sponsor1',
          },
        ],
      }

      const result = buildFundingSummary(pkg)

      expect(result).not.toBeNull()
      expect(result?.platform).toBe('opencollective')
      expect(result?.profileUrl).toBe('https://opencollective.com/webpack')
      expect(result?.balanceRange).toBe('$50K-100K')
      expect(result?.monthlyIncomeRange).toBe('$10K-25K/mo')
      expect(result?.sponsorCount).toBe(500)
      expect(result?.goalProgress).toBe(75)
      expect(result?.topSponsors).toHaveLength(1)
    })

    it('should handle missing optional OC fields', () => {
      const pkg = {
        ocSlug: 'minimal-pkg',
      }

      const result = buildFundingSummary(pkg)

      expect(result).not.toBeNull()
      expect(result?.platform).toBe('opencollective')
      expect(result?.balanceRange).toBeNull()
      expect(result?.monthlyIncomeRange).toBeNull()
      expect(result?.sponsorCount).toBe(0)
      expect(result?.goalProgress).toBeNull()
      expect(result?.topSponsors).toEqual([])
    })

    it('should prefer OpenCollective over GitHub Sponsors when both exist', () => {
      const pkg = {
        ocSlug: 'dual-funding',
        ocBalance: 10000,
        ghHasSponsorsListing: true,
        repositoryOwner: 'some-owner',
      }

      const result = buildFundingSummary(pkg)

      expect(result?.platform).toBe('opencollective')
    })
  })

  describe('GitHub Sponsors funding', () => {
    it('should build summary for package with GH Sponsors data', () => {
      // Use 'as any' because real data from GitHub has avatarUrl, not imageUrl
      // The buildFundingSummary function normalizes this
      const pkg = {
        ghHasSponsorsListing: true,
        repositoryOwner: 'sindresorhus',
        ghSponsorsCount: 200,
        ghTopSponsors: [
          {
            name: 'GHSponsor1',
            imageUrl: 'https://github.com/avatar1.png',
            profileUrl: 'https://github.com/sponsor1',
          },
        ],
      }

      const result = buildFundingSummary(pkg)

      expect(result).not.toBeNull()
      expect(result?.platform).toBe('github')
      expect(result?.profileUrl).toBe('https://github.com/sponsors/sindresorhus')
      expect(result?.balanceRange).toBeNull() // GH doesn't expose balance
      expect(result?.monthlyIncomeRange).toBeNull() // GH doesn't expose income
      expect(result?.sponsorCount).toBe(200)
      expect(result?.goalProgress).toBeNull()
    })

    it('should normalize avatarUrl to imageUrl in sponsor data', () => {
      // Real GitHub data has avatarUrl, so we cast to test the normalization behavior
      const pkg = {
        ghHasSponsorsListing: true,
        repositoryOwner: 'owner',
        ghTopSponsors: [
          {
            name: 'Sponsor',
            avatarUrl: 'https://avatar.url',
            profileUrl: 'https://profile.url',
          },
        ] as unknown,
      }

      const result = buildFundingSummary(pkg as Parameters<typeof buildFundingSummary>[0])

      expect(result?.topSponsors[0]?.imageUrl).toBe('https://avatar.url')
    })

    it('should handle imageUrl if already normalized', () => {
      const pkg = {
        ghHasSponsorsListing: true,
        repositoryOwner: 'owner',
        ghTopSponsors: [
          {
            name: 'Sponsor',
            imageUrl: 'https://image.url',
            profileUrl: 'https://profile.url',
          },
        ],
      }

      const result = buildFundingSummary(pkg)

      expect(result?.topSponsors[0]?.imageUrl).toBe('https://image.url')
    })

    it('should return null without repositoryOwner', () => {
      const pkg = {
        ghHasSponsorsListing: true,
        ghSponsorsCount: 100,
      }

      const result = buildFundingSummary(pkg)

      expect(result).toBeNull()
    })
  })

  describe('no funding data', () => {
    it('should return null for package with no funding data', () => {
      const pkg = {}

      const result = buildFundingSummary(pkg)

      expect(result).toBeNull()
    })

    it('should return null for package with only partial GH data', () => {
      const pkg = {
        ghSponsorsCount: 50, // Has count but no listing enabled
      }

      const result = buildFundingSummary(pkg)

      expect(result).toBeNull()
    })
  })
})

describe('hasFundingData', () => {
  it('should return true for package with OC slug', () => {
    expect(hasFundingData({ ocSlug: 'webpack' })).toBe(true)
  })

  it('should return true for package with GH Sponsors and owner', () => {
    expect(
      hasFundingData({
        ghHasSponsorsListing: true,
        repositoryOwner: 'sindresorhus',
      })
    ).toBe(true)
  })

  it('should return false for package with no funding data', () => {
    expect(hasFundingData({})).toBe(false)
  })

  it('should return false for GH Sponsors without owner', () => {
    expect(
      hasFundingData({
        ghHasSponsorsListing: true,
      })
    ).toBe(false)
  })

  it('should return false for owner without GH Sponsors enabled', () => {
    expect(
      hasFundingData({
        repositoryOwner: 'some-owner',
      })
    ).toBe(false)
  })
})
