/**
 * Sustainability Scoring Algorithm ("Robin Hood")
 *
 * Calculates a sustainability score for npm packages based on multiple signals.
 * Higher scores indicate LESS need for support (counter-intuitive but consistent with health).
 *
 * Priority = (Ecosystem Impact × Usage) ÷ Funding Health
 * Score 0-100 where lower = needs more support
 */

import type { SustainabilityCategory } from './index.js'

export interface ScoringInputs {
  // Ecosystem importance
  weeklyDownloads?: number | null
  dependentCount?: number | null

  // Funding health (higher = healthier)
  ocBalance?: number | null // OpenCollective balance in USD
  ocYearlyIncome?: number | null // OpenCollective yearly income
  githubSponsors?: boolean | null // Has GitHub sponsors

  // Risk factors
  corporateBacking?: string | null // Company name if corporate-backed
  maintainerCount?: number | null // Bus factor
  daysSinceLastPublish?: number | null // Activity signal

  // Special flags
  aiDisruptionFlag?: boolean | null // Business model at risk from AI

  // Maintainer self-report (overrides algorithm if set)
  maintainerStatus?: SustainabilityCategory | null
}

export interface ScoringWeights {
  downloads: number
  dependents: number
  ocBalance: number
  ocIncome: number
  githubSponsors: number
  corporateBacking: number
  maintainerCount: number
  activityPenalty: number
  aiDisruption: number
}

export interface ScoringResult {
  score: number // 0-100
  category: SustainabilityCategory
  explanation: string[]
  factors: {
    name: string
    impact: number // positive = healthier, negative = needier
    reason: string
  }[]
}

// Default weights (can be tuned)
export const DEFAULT_WEIGHTS: ScoringWeights = {
  downloads: 10, // High downloads = high impact = should be funded
  dependents: 15, // Many dependents = critical infrastructure
  ocBalance: 20, // Has money = less urgent
  ocIncome: 15, // Regular income = sustainable
  githubSponsors: 5, // Alternative funding source
  corporateBacking: 30, // Corporate = doesn't need community support
  maintainerCount: 5, // More maintainers = lower bus factor risk
  activityPenalty: 10, // Inactive = might be abandoned
  aiDisruption: 15, // AI disruption = urgent need
}

// Thresholds for categorization
const CATEGORY_THRESHOLDS = {
  critical: 30, // 0-30: Critical need
  needsSupport: 50, // 31-50: Needs support
  stable: 75, // 51-75: Stable
  thriving: 90, // 76-90: Thriving
  // 91-100: Corporate (or explicitly marked)
}

function normalizeDownloads(downloads: number | null | undefined): number {
  if (!downloads) return 0
  // Log scale: 1M downloads = ~0.7, 10M = ~0.8, 100M = ~0.9
  return Math.min(1, Math.log10(downloads + 1) / 9)
}

function normalizeDependents(dependents: number | null | undefined): number {
  if (!dependents) return 0
  // Log scale: 100 dependents = ~0.5, 1000 = ~0.75, 10000 = ~1.0
  return Math.min(1, Math.log10(dependents + 1) / 4)
}

function normalizeBalance(balance: number | null | undefined): number {
  if (!balance) return 0
  // $10k = 0.5, $50k = 0.8, $100k+ = 1.0
  return Math.min(1, balance / 100000)
}

function normalizeIncome(income: number | null | undefined): number {
  if (!income) return 0
  // $10k/year = 0.5, $50k = 0.8, $100k+ = 1.0
  return Math.min(1, income / 100000)
}

export function calculateScore(
  inputs: ScoringInputs,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): ScoringResult {
  const factors: ScoringResult['factors'] = []
  let score = 50 // Start at neutral

  // If maintainer explicitly set their status, use that
  if (inputs.maintainerStatus) {
    const statusScores: Record<SustainabilityCategory, number> = {
      critical: 15,
      'needs-support': 40,
      stable: 65,
      thriving: 85,
      corporate: 95,
    }
    return {
      score: statusScores[inputs.maintainerStatus],
      category: inputs.maintainerStatus,
      explanation: ['Score based on maintainer self-reported status'],
      factors: [
        {
          name: 'Maintainer Status',
          impact: 0,
          reason: `Maintainer marked as "${inputs.maintainerStatus}"`,
        },
      ],
    }
  }

  // Corporate backing = very high score (doesn't need community support)
  if (inputs.corporateBacking) {
    return {
      score: 95,
      category: 'corporate',
      explanation: [`Backed by ${inputs.corporateBacking} - does not need community funding`],
      factors: [
        {
          name: 'Corporate Backing',
          impact: weights.corporateBacking,
          reason: `Maintained by ${inputs.corporateBacking}`,
        },
      ],
    }
  }

  // Factor: Ecosystem importance (downloads)
  const downloadsFactor = normalizeDownloads(inputs.weeklyDownloads)
  if (downloadsFactor > 0) {
    // High downloads but no funding = critical
    // We'll add this to importance, not directly to score
    factors.push({
      name: 'Weekly Downloads',
      impact: -downloadsFactor * weights.downloads, // Negative because high impact without funding = needs support
      reason: `${(inputs.weeklyDownloads ?? 0).toLocaleString()} weekly downloads`,
    })
  }

  // Factor: Ecosystem importance (dependents)
  const dependentsFactor = normalizeDependents(inputs.dependentCount)
  if (dependentsFactor > 0) {
    factors.push({
      name: 'Dependent Packages',
      impact: -dependentsFactor * weights.dependents,
      reason: `${(inputs.dependentCount ?? 0).toLocaleString()} packages depend on this`,
    })
  }

  // Factor: OpenCollective balance (positive = healthier)
  const balanceFactor = normalizeBalance(inputs.ocBalance)
  if (balanceFactor > 0) {
    factors.push({
      name: 'OC Balance',
      impact: balanceFactor * weights.ocBalance,
      reason: `$${(inputs.ocBalance ?? 0).toLocaleString()} in OpenCollective`,
    })
    score += balanceFactor * weights.ocBalance
  }

  // Factor: OpenCollective income (positive = healthier)
  const incomeFactor = normalizeIncome(inputs.ocYearlyIncome)
  if (incomeFactor > 0) {
    factors.push({
      name: 'OC Income',
      impact: incomeFactor * weights.ocIncome,
      reason: `$${(inputs.ocYearlyIncome ?? 0).toLocaleString()}/year from OpenCollective`,
    })
    score += incomeFactor * weights.ocIncome
  }

  // Factor: GitHub Sponsors
  if (inputs.githubSponsors) {
    factors.push({
      name: 'GitHub Sponsors',
      impact: weights.githubSponsors,
      reason: 'Has GitHub Sponsors enabled',
    })
    score += weights.githubSponsors
  }

  // Factor: Maintainer count (more = healthier)
  if (inputs.maintainerCount && inputs.maintainerCount > 1) {
    const maintainerBonus = Math.min(1, (inputs.maintainerCount - 1) / 4) * weights.maintainerCount
    factors.push({
      name: 'Maintainer Count',
      impact: maintainerBonus,
      reason: `${inputs.maintainerCount} maintainers (lower bus factor)`,
    })
    score += maintainerBonus
  } else if (inputs.maintainerCount === 1) {
    factors.push({
      name: 'Solo Maintainer',
      impact: -weights.maintainerCount / 2,
      reason: 'Single maintainer (bus factor risk)',
    })
    score -= weights.maintainerCount / 2
  }

  // Factor: Activity (penalty for inactivity)
  if (inputs.daysSinceLastPublish && inputs.daysSinceLastPublish > 365) {
    const inactivityPenalty =
      Math.min(1, (inputs.daysSinceLastPublish - 365) / 730) * weights.activityPenalty
    factors.push({
      name: 'Inactivity',
      impact: -inactivityPenalty,
      reason: `No releases in ${Math.floor(inputs.daysSinceLastPublish / 365)} years`,
    })
    score -= inactivityPenalty
  }

  // Factor: AI Disruption (major penalty)
  if (inputs.aiDisruptionFlag) {
    factors.push({
      name: 'AI Disruption',
      impact: -weights.aiDisruption,
      reason: 'Business model at risk from AI tools',
    })
    score -= weights.aiDisruption
  }

  // Apply ecosystem importance as inverse factor
  // High impact packages with low funding score = critical
  const ecosystemImportance = downloadsFactor * 0.6 + dependentsFactor * 0.4
  if (ecosystemImportance > 0.3 && score < 60) {
    const importancePenalty = ecosystemImportance * 15
    score -= importancePenalty
    factors.push({
      name: 'High Impact, Low Funding',
      impact: -importancePenalty,
      reason: 'Critical infrastructure without adequate funding',
    })
  }

  // Clamp score
  score = Math.max(0, Math.min(100, Math.round(score)))

  // Determine category
  let category: SustainabilityCategory
  if (score <= CATEGORY_THRESHOLDS.critical) {
    category = 'critical'
  } else if (score <= CATEGORY_THRESHOLDS.needsSupport) {
    category = 'needs-support'
  } else if (score <= CATEGORY_THRESHOLDS.stable) {
    category = 'stable'
  } else if (score <= CATEGORY_THRESHOLDS.thriving) {
    category = 'thriving'
  } else {
    category = 'corporate'
  }

  // Generate explanation
  const explanation: string[] = []
  const sortedFactors = [...factors].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
  for (const factor of sortedFactors.slice(0, 3)) {
    explanation.push(factor.reason)
  }

  return {
    score,
    category,
    explanation,
    factors,
  }
}

/**
 * Calculate suggested donation allocation based on scores
 */
export interface AllocationInput {
  packageName: string
  score: number
  category: SustainabilityCategory
}

export interface AllocationOutput {
  packageName: string
  percentage: number
  suggestedAmount: number
}

export function calculateAllocation(
  packages: AllocationInput[],
  totalBudget: number
): AllocationOutput[] {
  // Weight by inverse score (lower score = higher weight)
  // Corporate packages get 0 weight
  const weights = packages.map((pkg) => {
    if (pkg.category === 'corporate') return 0
    if (pkg.category === 'thriving') return 0.1
    // Inverse: score 0 = weight 100, score 50 = weight 50, score 100 = weight 0
    return Math.max(0, 100 - pkg.score)
  })

  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  if (totalWeight === 0) {
    return packages.map((pkg) => ({
      packageName: pkg.packageName,
      percentage: 0,
      suggestedAmount: 0,
    }))
  }

  return packages.map((pkg, i) => {
    const weight = weights[i] ?? 0
    const percentage = (weight / totalWeight) * 100
    return {
      packageName: pkg.packageName,
      percentage: Math.round(percentage * 10) / 10,
      suggestedAmount: Math.round((weight / totalWeight) * totalBudget * 100) / 100,
    }
  })
}
