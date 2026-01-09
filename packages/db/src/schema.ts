import { pgTable, text, integer, boolean, timestamp, real, pgEnum, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Enums
export const sustainabilityCategoryEnum = pgEnum('sustainability_category', [
  'critical',
  'needs-support',
  'stable',
  'thriving',
  'corporate',
])

export const fundingPlatformEnum = pgEnum('funding_platform', [
  'opencollective',
  'github',
  'kofi',
  'patreon',
  'buymeacoffee',
  'custom',
])

export const enrichmentStatusEnum = pgEnum('enrichment_status', [
  'pending',
  'in_progress',
  'completed',
  'failed',
])

// Core tables

export const packages = pgTable('packages', {
  // Primary key - npm package name
  name: text('name').primaryKey(),

  // Sustainability scoring
  sustainabilityScore: integer('sustainability_score'),
  category: sustainabilityCategoryEnum('category'),

  // npm data
  latestVersion: text('latest_version'),
  lastPublish: timestamp('last_publish'),
  weeklyDownloads: integer('weekly_downloads'),
  dependentCount: integer('dependent_count'),

  // Repository info
  repositoryUrl: text('repository_url'),
  repositoryOwner: text('repository_owner'),
  repositoryName: text('repository_name'),

  // GitHub signals
  stars: integer('stars'),
  forks: integer('forks'),
  openIssues: integer('open_issues'),
  lastCommit: timestamp('last_commit'),
  isArchived: boolean('is_archived').default(false),

  // Funding
  npmFundingUrl: text('npm_funding_url'),

  // OpenCollective data
  ocSlug: text('oc_slug'),
  ocBalance: real('oc_balance'),
  ocYearlyIncome: real('oc_yearly_income'),
  ocBackersCount: integer('oc_backers_count'),
  ocGoalAmount: real('oc_goal_amount'),
  ocGoalProgress: real('oc_goal_progress'), // 0-100 percentage
  ocTopSponsors: jsonb('oc_top_sponsors'), // [{name, imageUrl, profileUrl}]

  // GitHub Sponsors data
  ghSponsorsCount: integer('gh_sponsors_count'),
  ghHasSponsorsListing: boolean('gh_has_sponsors_listing'),
  ghTopSponsors: jsonb('gh_top_sponsors'), // [{name, avatarUrl, profileUrl}]

  // Curated flags
  corporateBacking: text('corporate_backing'),
  aiDisruptionFlag: boolean('ai_disruption_flag').default(false),
  aiDisruptionNote: text('ai_disruption_note'),

  // Maintainer-provided info
  maintainerStatus: sustainabilityCategoryEnum('maintainer_status'),
  maintainerNote: text('maintainer_note'),

  // Enrichment tracking
  enrichmentStatus: enrichmentStatusEnum('enrichment_status').default('pending'),
  lastEnrichedAt: timestamp('last_enriched_at'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const maintainers = pgTable('maintainers', {
  id: text('id').primaryKey(), // UUID or slug

  // Identity
  name: text('name'),
  npmUsername: text('npm_username'),
  githubUsername: text('github_username').unique(),

  // Aggregated stats
  totalDownloads: integer('total_downloads'),
  packageCount: integer('package_count'),

  // Verification
  verified: boolean('verified').default(false),
  verifiedAt: timestamp('verified_at'),

  // Profile (for verified maintainers)
  bio: text('bio'),
  website: text('website'),
  twitterHandle: text('twitter_handle'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const fundingSources = pgTable('funding_sources', {
  id: text('id').primaryKey(), // UUID

  // Can belong to a package or maintainer (or both)
  packageName: text('package_name').references(() => packages.name),
  maintainerId: text('maintainer_id').references(() => maintainers.id),

  // Funding info
  platform: fundingPlatformEnum('platform').notNull(),
  url: text('url').notNull(),
  verified: boolean('verified').default(false),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const packageMaintainers = pgTable('package_maintainers', {
  packageName: text('package_name')
    .references(() => packages.name)
    .notNull(),
  maintainerId: text('maintainer_id')
    .references(() => maintainers.id)
    .notNull(),

  // Role info
  isPrimary: boolean('is_primary').default(false),
  commitPercentage: real('commit_percentage'),

  // Recent activity (from GitHub stats API)
  recentCommits: integer('recent_commits'), // commits in last 6 months
  lastCommitAt: timestamp('last_commit_at'), // when they last committed

  // Source of the relationship
  source: text('source'), // 'npm', 'github', 'claimed'

  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Relations

export const packagesRelations = relations(packages, ({ many }) => ({
  maintainers: many(packageMaintainers),
  fundingSources: many(fundingSources),
}))

export const maintainersRelations = relations(maintainers, ({ many }) => ({
  packages: many(packageMaintainers),
  fundingSources: many(fundingSources),
}))

export const packageMaintainersRelations = relations(packageMaintainers, ({ one }) => ({
  package: one(packages, {
    fields: [packageMaintainers.packageName],
    references: [packages.name],
  }),
  maintainer: one(maintainers, {
    fields: [packageMaintainers.maintainerId],
    references: [maintainers.id],
  }),
}))

export const fundingSourcesRelations = relations(fundingSources, ({ one }) => ({
  package: one(packages, {
    fields: [fundingSources.packageName],
    references: [packages.name],
  }),
  maintainer: one(maintainers, {
    fields: [fundingSources.maintainerId],
    references: [maintainers.id],
  }),
}))

// Type exports
export type Package = typeof packages.$inferSelect
export type NewPackage = typeof packages.$inferInsert
export type Maintainer = typeof maintainers.$inferSelect
export type NewMaintainer = typeof maintainers.$inferInsert
export type FundingSource = typeof fundingSources.$inferSelect
export type NewFundingSource = typeof fundingSources.$inferInsert
export type PackageMaintainer = typeof packageMaintainers.$inferSelect
export type NewPackageMaintainer = typeof packageMaintainers.$inferInsert
