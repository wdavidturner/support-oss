import { describe, it, expect } from 'vitest'
import {
  calculateScore,
  calculateAllocation,
  DEFAULT_WEIGHTS,
  type ScoringInputs,
  type AllocationInput,
} from './scoring.js'

describe('calculateScore', () => {
  describe('maintainer status override', () => {
    it('should return predetermined score when maintainerStatus is "critical"', () => {
      const inputs: ScoringInputs = {
        maintainerStatus: 'critical',
        weeklyDownloads: 1000000,
      }
      const result = calculateScore(inputs)

      expect(result.score).toBe(15)
      expect(result.category).toBe('critical')
      expect(result.explanation).toContain('Score based on maintainer self-reported status')
    })

    it('should return predetermined score when maintainerStatus is "thriving"', () => {
      const inputs: ScoringInputs = { maintainerStatus: 'thriving' }
      const result = calculateScore(inputs)

      expect(result.score).toBe(85)
      expect(result.category).toBe('thriving')
    })

    it('should return predetermined score when maintainerStatus is "corporate"', () => {
      const inputs: ScoringInputs = { maintainerStatus: 'corporate' }
      const result = calculateScore(inputs)

      expect(result.score).toBe(95)
      expect(result.category).toBe('corporate')
    })

    it('should return predetermined score for all maintainer statuses', () => {
      const statusExpectations: Array<{
        status: NonNullable<ScoringInputs['maintainerStatus']>
        score: number
      }> = [
        { status: 'critical', score: 15 },
        { status: 'needs-support', score: 40 },
        { status: 'stable', score: 65 },
        { status: 'thriving', score: 85 },
        { status: 'corporate', score: 95 },
      ]

      for (const { status, score } of statusExpectations) {
        const result = calculateScore({ maintainerStatus: status })
        expect(result.score).toBe(score)
      }
    })
  })

  describe('corporate backing', () => {
    it('should return score 95 and "corporate" category for corporate-backed packages', () => {
      const inputs: ScoringInputs = {
        corporateBacking: 'Meta',
        weeklyDownloads: 50000000,
      }
      const result = calculateScore(inputs)

      expect(result.score).toBe(95)
      expect(result.category).toBe('corporate')
      expect(result.explanation[0]).toContain('Meta')
    })

    it('should include company name in factor reason', () => {
      const inputs: ScoringInputs = { corporateBacking: 'Google' }
      const result = calculateScore(inputs)

      expect(result.factors[0]?.reason).toContain('Google')
    })
  })

  describe('funding factors', () => {
    it('should increase score with OpenCollective balance', () => {
      const baseInputs: ScoringInputs = {}
      const fundedInputs: ScoringInputs = { ocBalance: 50000 }

      const baseResult = calculateScore(baseInputs)
      const fundedResult = calculateScore(fundedInputs)

      expect(fundedResult.score).toBeGreaterThan(baseResult.score)
    })

    it('should increase score with OpenCollective yearly income', () => {
      const baseInputs: ScoringInputs = {}
      const incomeInputs: ScoringInputs = { ocYearlyIncome: 30000 }

      const baseResult = calculateScore(baseInputs)
      const incomeResult = calculateScore(incomeInputs)

      expect(incomeResult.score).toBeGreaterThan(baseResult.score)
    })

    it('should increase score when GitHub Sponsors is enabled', () => {
      const baseInputs: ScoringInputs = {}
      const sponsorsInputs: ScoringInputs = { githubSponsors: true }

      const baseResult = calculateScore(baseInputs)
      const sponsorsResult = calculateScore(sponsorsInputs)

      expect(sponsorsResult.score).toBeGreaterThan(baseResult.score)
    })

    it('should cap balance normalization at $100k', () => {
      const result100k = calculateScore({ ocBalance: 100000 })
      const result200k = calculateScore({ ocBalance: 200000 })

      // Both should have the same contribution from balance (capped at 1.0)
      expect(result100k.score).toBe(result200k.score)
    })
  })

  describe('maintainer count factor', () => {
    it('should penalize solo maintainer (bus factor)', () => {
      const soloInputs: ScoringInputs = { maintainerCount: 1 }
      const multiInputs: ScoringInputs = { maintainerCount: 3 }

      const soloResult = calculateScore(soloInputs)
      const multiResult = calculateScore(multiInputs)

      expect(soloResult.score).toBeLessThan(multiResult.score)
    })

    it('should not penalize packages with no maintainer data', () => {
      const noDataInputs: ScoringInputs = {}
      const result = calculateScore(noDataInputs)

      // Should not have solo maintainer penalty
      expect(result.factors.find((f) => f.name === 'Solo Maintainer')).toBeUndefined()
    })

    it('should add bonus for multiple maintainers', () => {
      const result3 = calculateScore({ maintainerCount: 3 })

      expect(result3.factors.find((f) => f.name === 'Maintainer Count')).toBeDefined()
    })

    it('should cap maintainer bonus at 5 maintainers', () => {
      const result5 = calculateScore({ maintainerCount: 5 })
      const result10 = calculateScore({ maintainerCount: 10 })

      // Math.min(1, (count - 1) / 4) caps at count = 5
      expect(result5.score).toBe(result10.score)
    })
  })

  describe('activity penalty', () => {
    it('should not penalize packages with recent activity', () => {
      const recentInputs: ScoringInputs = { daysSinceLastPublish: 30 }
      const result = calculateScore(recentInputs)

      expect(result.factors.find((f) => f.name === 'Inactivity')).toBeUndefined()
    })

    it('should not penalize packages with activity under a year', () => {
      const inputs: ScoringInputs = { daysSinceLastPublish: 365 }
      const result = calculateScore(inputs)

      expect(result.factors.find((f) => f.name === 'Inactivity')).toBeUndefined()
    })

    it('should penalize packages with no releases for over a year', () => {
      const inactiveInputs: ScoringInputs = { daysSinceLastPublish: 500 }
      const result = calculateScore(inactiveInputs)

      expect(result.factors.find((f) => f.name === 'Inactivity')).toBeDefined()
    })

    it('should increase penalty with longer inactivity', () => {
      const result2Years = calculateScore({ daysSinceLastPublish: 730 })
      const result3Years = calculateScore({ daysSinceLastPublish: 1095 })

      expect(result3Years.score).toBeLessThan(result2Years.score)
    })
  })

  describe('AI disruption factor', () => {
    it('should penalize packages flagged for AI disruption', () => {
      const baseInputs: ScoringInputs = {}
      const aiInputs: ScoringInputs = { aiDisruptionFlag: true }

      const baseResult = calculateScore(baseInputs)
      const aiResult = calculateScore(aiInputs)

      expect(aiResult.score).toBeLessThan(baseResult.score)
    })

    it('should add AI Disruption factor', () => {
      const inputs: ScoringInputs = { aiDisruptionFlag: true }
      const result = calculateScore(inputs)

      expect(result.factors.find((f) => f.name === 'AI Disruption')).toBeDefined()
    })
  })

  describe('ecosystem importance penalty', () => {
    it('should penalize high-impact packages with low funding', () => {
      const highImpactLowFunding: ScoringInputs = {
        weeklyDownloads: 10000000,
        dependentCount: 5000,
        ocBalance: 0,
      }
      const result = calculateScore(highImpactLowFunding)

      expect(result.factors.find((f) => f.name === 'High Impact, Low Funding')).toBeDefined()
    })

    it('should not penalize high-impact packages with good funding', () => {
      const highImpactGoodFunding: ScoringInputs = {
        weeklyDownloads: 10000000,
        dependentCount: 5000,
        ocBalance: 100000,
        ocYearlyIncome: 50000,
      }
      const result = calculateScore(highImpactGoodFunding)

      // Should not have the penalty because score is high enough
      expect(result.factors.find((f) => f.name === 'High Impact, Low Funding')).toBeUndefined()
    })
  })

  describe('category assignment', () => {
    it('should assign "critical" for scores 0-30', () => {
      const inputs: ScoringInputs = {
        weeklyDownloads: 50000000,
        dependentCount: 10000,
        aiDisruptionFlag: true,
        maintainerCount: 1,
        daysSinceLastPublish: 1000,
      }
      const result = calculateScore(inputs)

      expect(result.category).toBe('critical')
      expect(result.score).toBeLessThanOrEqual(30)
    })

    it('should assign "needs-support" for scores 31-50', () => {
      // Start at 50, add small penalty to get into 31-50 range
      const inputs: ScoringInputs = {
        maintainerCount: 1, // -2.5 penalty
      }
      const result = calculateScore(inputs)

      expect(result.category).toBe('needs-support')
      expect(result.score).toBeGreaterThan(30)
      expect(result.score).toBeLessThanOrEqual(50)
    })

    it('should assign "stable" for scores 51-75', () => {
      const inputs: ScoringInputs = {
        ocBalance: 30000,
        githubSponsors: true,
        maintainerCount: 3,
      }
      const result = calculateScore(inputs)

      expect(result.category).toBe('stable')
      expect(result.score).toBeGreaterThan(50)
      expect(result.score).toBeLessThanOrEqual(75)
    })

    it('should assign "thriving" for scores 76-90', () => {
      const inputs: ScoringInputs = {
        ocBalance: 80000,
        ocYearlyIncome: 60000,
        githubSponsors: true,
        maintainerCount: 5,
      }
      const result = calculateScore(inputs)

      expect(result.category).toBe('thriving')
      expect(result.score).toBeGreaterThan(75)
      expect(result.score).toBeLessThanOrEqual(90)
    })
  })

  describe('custom weights', () => {
    it('should respect custom weight configuration', () => {
      const inputs: ScoringInputs = { githubSponsors: true }
      const customWeights = { ...DEFAULT_WEIGHTS, githubSponsors: 20 }

      const defaultResult = calculateScore(inputs)
      const customResult = calculateScore(inputs, customWeights)

      expect(customResult.score).toBeGreaterThan(defaultResult.score)
    })
  })

  describe('score clamping', () => {
    it('should clamp score to minimum 0', () => {
      const extremeNegativeInputs: ScoringInputs = {
        weeklyDownloads: 100000000,
        dependentCount: 50000,
        aiDisruptionFlag: true,
        maintainerCount: 1,
        daysSinceLastPublish: 2000,
      }
      const result = calculateScore(extremeNegativeInputs)

      expect(result.score).toBeGreaterThanOrEqual(0)
    })

    it('should clamp score to maximum 100', () => {
      const inputs: ScoringInputs = {
        ocBalance: 500000,
        ocYearlyIncome: 500000,
        githubSponsors: true,
        maintainerCount: 10,
      }
      const result = calculateScore(inputs)

      expect(result.score).toBeLessThanOrEqual(100)
    })
  })

  describe('explanation generation', () => {
    it('should include top 3 factors in explanation', () => {
      const inputs: ScoringInputs = {
        weeklyDownloads: 1000000,
        dependentCount: 1000,
        ocBalance: 10000,
        githubSponsors: true,
        maintainerCount: 2,
      }
      const result = calculateScore(inputs)

      expect(result.explanation.length).toBeLessThanOrEqual(3)
    })

    it('should use sorted factors for explanation (top 3 by impact)', () => {
      const inputs: ScoringInputs = {
        weeklyDownloads: 10000000,
        ocBalance: 50000,
      }
      const result = calculateScore(inputs)

      // Explanation should contain reasons from the highest-impact factors
      // The factors array itself is not sorted, but explanation uses sorted factors
      expect(result.explanation.length).toBeLessThanOrEqual(3)
      expect(result.explanation.length).toBeGreaterThan(0)
    })
  })

  describe('base score', () => {
    it('should start at 50 for empty inputs', () => {
      const result = calculateScore({})
      expect(result.score).toBe(50)
    })
  })
})

describe('calculateAllocation', () => {
  describe('basic allocation', () => {
    it('should allocate more to lower-scored packages', () => {
      const packages: AllocationInput[] = [
        { packageName: 'critical-pkg', score: 20, category: 'critical' },
        { packageName: 'stable-pkg', score: 60, category: 'stable' },
      ]

      const result = calculateAllocation(packages, 1000)

      const criticalAlloc = result.find((r) => r.packageName === 'critical-pkg')
      const stableAlloc = result.find((r) => r.packageName === 'stable-pkg')

      expect(criticalAlloc?.suggestedAmount).toBeGreaterThan(stableAlloc?.suggestedAmount ?? 0)
    })

    it('should allocate zero to corporate packages', () => {
      const packages: AllocationInput[] = [
        { packageName: 'corp-pkg', score: 95, category: 'corporate' },
        { packageName: 'needy-pkg', score: 30, category: 'critical' },
      ]

      const result = calculateAllocation(packages, 1000)

      const corpAlloc = result.find((r) => r.packageName === 'corp-pkg')
      expect(corpAlloc?.suggestedAmount).toBe(0)
      expect(corpAlloc?.percentage).toBe(0)
    })

    it('should allocate minimal amount to thriving packages', () => {
      const packages: AllocationInput[] = [
        { packageName: 'thriving-pkg', score: 85, category: 'thriving' },
        { packageName: 'needy-pkg', score: 30, category: 'critical' },
      ]

      const result = calculateAllocation(packages, 1000)

      const thrivingAlloc = result.find((r) => r.packageName === 'thriving-pkg')
      const needyAlloc = result.find((r) => r.packageName === 'needy-pkg')

      // Thriving gets weight 0.1, needy gets weight 70 (100-30)
      expect(thrivingAlloc?.suggestedAmount).toBeLessThan(needyAlloc?.suggestedAmount ?? Infinity)
    })
  })

  describe('budget distribution', () => {
    it('should distribute entire budget across eligible packages', () => {
      const packages: AllocationInput[] = [
        { packageName: 'pkg1', score: 30, category: 'critical' },
        { packageName: 'pkg2', score: 50, category: 'needs-support' },
      ]

      const result = calculateAllocation(packages, 1000)
      const totalAllocated = result.reduce((sum, r) => sum + r.suggestedAmount, 0)

      // Allow for rounding differences
      expect(totalAllocated).toBeCloseTo(1000, 0)
    })

    it('should handle all-corporate packages gracefully', () => {
      const packages: AllocationInput[] = [
        { packageName: 'corp1', score: 95, category: 'corporate' },
        { packageName: 'corp2', score: 95, category: 'corporate' },
      ]

      const result = calculateAllocation(packages, 1000)

      expect(result.every((r) => r.suggestedAmount === 0)).toBe(true)
      expect(result.every((r) => r.percentage === 0)).toBe(true)
    })

    it('should handle empty package list', () => {
      const result = calculateAllocation([], 1000)
      expect(result).toEqual([])
    })
  })

  describe('percentage calculation', () => {
    it('should return percentages that sum to approximately 100 for eligible packages', () => {
      const packages: AllocationInput[] = [
        { packageName: 'pkg1', score: 20, category: 'critical' },
        { packageName: 'pkg2', score: 40, category: 'needs-support' },
        { packageName: 'pkg3', score: 60, category: 'stable' },
      ]

      const result = calculateAllocation(packages, 1000)
      const totalPercentage = result.reduce((sum, r) => sum + r.percentage, 0)

      expect(totalPercentage).toBeCloseTo(100, 0)
    })

    it('should round percentages to one decimal place', () => {
      const packages: AllocationInput[] = [
        { packageName: 'pkg1', score: 33, category: 'needs-support' },
        { packageName: 'pkg2', score: 66, category: 'stable' },
      ]

      const result = calculateAllocation(packages, 1000)

      for (const allocation of result) {
        const decimalPlaces = (allocation.percentage.toString().split('.')[1] || '').length
        expect(decimalPlaces).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('amount calculation', () => {
    it('should round suggested amounts to two decimal places', () => {
      const packages: AllocationInput[] = [
        { packageName: 'pkg1', score: 33, category: 'needs-support' },
      ]

      const result = calculateAllocation(packages, 1000)

      for (const allocation of result) {
        const decimalPlaces = (allocation.suggestedAmount.toString().split('.')[1] || '').length
        expect(decimalPlaces).toBeLessThanOrEqual(2)
      }
    })

    it('should scale with budget amount', () => {
      const packages: AllocationInput[] = [
        { packageName: 'pkg1', score: 30, category: 'critical' },
      ]

      const result100 = calculateAllocation(packages, 100)
      const result1000 = calculateAllocation(packages, 1000)

      expect(result1000[0]?.suggestedAmount).toBe(result100[0]!.suggestedAmount * 10)
    })
  })
})
