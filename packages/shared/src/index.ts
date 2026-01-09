// Shared types and utilities for support-oss

export * from './scoring.js'
export * from './funding.js'

export type SustainabilityCategory =
  | 'critical'
  | 'needs-support'
  | 'stable'
  | 'thriving'
  | 'corporate'

export interface Package {
  name: string
  version?: string
  sustainabilityScore?: number
  category?: SustainabilityCategory
  fundingSources?: FundingSource[]
  maintainers?: string[]
  corporateBacking?: string | null
  aiDisruptionFlag?: boolean
  weeklyDownloads?: number
  lastPublish?: string
}

export interface FundingSource {
  platform: 'opencollective' | 'github' | 'kofi' | 'patreon' | 'custom'
  url: string
  verified: boolean
}

export interface Maintainer {
  id: string
  name: string
  githubUsername?: string
  packages: string[]
  totalDownloads?: number
  fundingSources?: FundingSource[]
}

export interface AnalysisResult {
  packages: Package[]
  allocation: AllocationItem[]
  totalBudget: number
}

export interface AllocationItem {
  packageName: string
  maintainer?: string
  score: number
  category: SustainabilityCategory
  suggestedAmount: number
  fundingLinks: FundingSource[]
}
