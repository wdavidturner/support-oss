'use client'

import styles from './PackageDrawer.module.css'

interface FundingSource {
  platform: string
  url: string
}

interface TopSponsor {
  name: string
  imageUrl: string | null
  profileUrl: string
}

interface FundingSummary {
  platform: 'opencollective' | 'github'
  profileUrl: string
  balanceRange: string | null
  monthlyIncomeRange: string | null
  sponsorCount: number
  goalProgress: number | null
  topSponsors: TopSponsor[]
}

interface Allocation {
  packageName: string
  percentage: number
  suggestedAmount: number
  reason: string
}

interface Maintainer {
  name: string | null
  githubUsername: string | null
  commitPercentage: number | null
  recentCommits: number | null
  lastCommitAt: string | null // ISO date string
}

interface PackageDetails {
  name: string
  version: string
  found: boolean
  sustainabilityScore: number
  category: 'critical' | 'needs-support' | 'stable' | 'thriving' | 'corporate'
  scoreExplanation?: string[]
  corporateBacking?: string | null
  aiDisruptionFlag?: boolean | null
  weeklyDownloads?: number | null
  fundingSources: FundingSource[]
  fundingSummary?: FundingSummary | null
  maintainers?: Maintainer[]
  allocation?: Allocation
}

interface PackageDrawerProps {
  pkg: PackageDetails | null
  onClose: () => void
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    critical: 'var(--critical)',
    'needs-support': 'var(--needs-support)',
    stable: 'var(--stable)',
    thriving: 'var(--thriving)',
    corporate: 'var(--corporate)',
  }
  return colors[category] || 'var(--text-secondary)'
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    critical: 'Critical',
    'needs-support': 'Needs Support',
    stable: 'Stable',
    thriving: 'Thriving',
    corporate: 'Corporate',
  }
  return labels[category] || category
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toString()
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

function getPlatformInfo(platform: 'opencollective' | 'github'): { name: string; icon: string } {
  if (platform === 'opencollective') {
    return { name: 'Open Collective', icon: '💰' }
  }
  return { name: 'GitHub Sponsors', icon: '💜' }
}

function formatRelativeTime(dateString: string | null): string | null {
  if (!dateString) return null

  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 7) return 'this week'
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''} ago`
}

export default function PackageDrawer({ pkg, onClose }: PackageDrawerProps) {
  if (!pkg) return null

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.drawer}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>{pkg.name}</h2>
          </div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {!pkg.found ? (
          <div className={styles.notFound}>
            <p>This package is not in our database yet.</p>
            <p>
              We track high-impact npm packages. This package may be newer, less popular, or a
              private/scoped package.
            </p>
            <a
              href={`https://www.npmjs.com/package/${pkg.name}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.npmLink}
            >
              View on npm
            </a>
          </div>
        ) : (
          <div className={styles.content}>
            <div className={styles.scoreSection}>
              <div className={styles.scoreCircle} style={{ borderColor: getCategoryColor(pkg.category) }}>
                <span className={styles.scoreValue}>{pkg.sustainabilityScore}</span>
                <span className={styles.scoreLabel}>Score</span>
              </div>
              <div className={styles.categoryInfo}>
                <span
                  className={styles.categoryBadge}
                  style={{ backgroundColor: getCategoryColor(pkg.category) }}
                >
                  {getCategoryLabel(pkg.category)}
                </span>
                {pkg.allocation && pkg.allocation.suggestedAmount > 0 && (
                  <div className={styles.allocationInfo}>
                    <span className={styles.allocationAmount}>
                      {formatCurrency(pkg.allocation.suggestedAmount)}
                    </span>
                    <span className={styles.allocationPercent}>
                      ({pkg.allocation.percentage.toFixed(1)}% of budget)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {pkg.scoreExplanation && pkg.scoreExplanation.length > 0 && (
              <div className={styles.section}>
                <h3>Why This Score?</h3>
                <ul className={styles.explanationList}>
                  {pkg.scoreExplanation.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className={styles.section}>
              <h3>Stats</h3>
              <div className={styles.statsGrid}>
                {pkg.weeklyDownloads && (
                  <div className={styles.stat}>
                    <span className={styles.statValue}>{formatNumber(pkg.weeklyDownloads)}</span>
                    <span className={styles.statLabel}>Weekly Downloads</span>
                  </div>
                )}
                {pkg.corporateBacking && (
                  <div className={styles.stat}>
                    <span className={styles.statValue}>{pkg.corporateBacking}</span>
                    <span className={styles.statLabel}>Corporate Backing</span>
                  </div>
                )}
              </div>
            </div>

            {pkg.maintainers && pkg.maintainers.filter(m => (m.commitPercentage || 0) >= 5).length > 0 && (
              <div className={styles.section}>
                <h3>Top Contributors</h3>
                <div className={styles.maintainersList}>
                  {pkg.maintainers
                    .filter((m) => (m.commitPercentage || 0) >= 5)
                    .map((m, i) => (
                      <a
                        key={i}
                        href={m.githubUsername ? `https://github.com/${m.githubUsername}` : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.maintainerItem}
                      >
                        <img
                          src={m.githubUsername ? `https://github.com/${m.githubUsername}.png?size=48` : '/placeholder-avatar.png'}
                          alt={m.name || m.githubUsername || 'Contributor'}
                          className={styles.maintainerAvatar}
                        />
                        <div className={styles.maintainerInfo}>
                          <span className={styles.maintainerName}>
                            {m.githubUsername || m.name}
                          </span>
                          <span className={styles.commitPercent}>
                            {m.commitPercentage ? `${Math.round(m.commitPercentage)}%` : ''}
                            {m.commitPercentage && m.lastCommitAt ? ' · ' : ''}
                            {m.lastCommitAt ? `last commit ${formatRelativeTime(m.lastCommitAt)}` : ''}
                          </span>
                        </div>
                      </a>
                    ))}
                </div>
              </div>
            )}

            {pkg.aiDisruptionFlag && (
              <div className={styles.warningSection}>
                <span className={styles.warningIcon}>⚠️</span>
                <div>
                  <strong>AI Disruption Risk</strong>
                  <p>
                    This package may face reduced demand as AI coding assistants can often generate
                    equivalent functionality.
                  </p>
                </div>
              </div>
            )}

            {pkg.fundingSummary && (
              <div className={styles.section}>
                <h3>Funding</h3>
                <div className={styles.fundingCard}>
                  <div className={styles.fundingHeader}>
                    <span className={styles.platformBadge}>
                      {getPlatformInfo(pkg.fundingSummary.platform).icon}{' '}
                      {getPlatformInfo(pkg.fundingSummary.platform).name}
                    </span>
                    {pkg.fundingSummary.sponsorCount > 0 && (
                      <span className={styles.sponsorCount}>
                        {pkg.fundingSummary.sponsorCount} sponsor{pkg.fundingSummary.sponsorCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {(pkg.fundingSummary.monthlyIncomeRange || pkg.fundingSummary.balanceRange) && (
                    <div className={styles.fundingStats}>
                      {pkg.fundingSummary.monthlyIncomeRange && (
                        <div className={styles.fundingStat}>
                          <span className={styles.fundingStatValue}>{pkg.fundingSummary.monthlyIncomeRange}</span>
                          <span className={styles.fundingStatLabel}>Monthly</span>
                        </div>
                      )}
                      {pkg.fundingSummary.balanceRange && (
                        <div className={styles.fundingStat}>
                          <span className={styles.fundingStatValue}>{pkg.fundingSummary.balanceRange}</span>
                          <span className={styles.fundingStatLabel}>Balance</span>
                        </div>
                      )}
                    </div>
                  )}

                  {pkg.fundingSummary.goalProgress !== null && (
                    <div className={styles.goalSection}>
                      <div className={styles.goalHeader}>
                        <span>Goal Progress</span>
                        <span>{Math.round(pkg.fundingSummary.goalProgress)}%</span>
                      </div>
                      <div className={styles.goalBar}>
                        <div
                          className={styles.goalFill}
                          style={{ width: `${Math.min(pkg.fundingSummary.goalProgress, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {pkg.fundingSummary.topSponsors.length > 0 && (
                    <div className={styles.sponsorsSection}>
                      <span className={styles.sponsorsLabel}>Top Sponsors</span>
                      <div className={styles.sponsorsList}>
                        {pkg.fundingSummary.topSponsors.map((sponsor, i) => (
                          <a
                            key={i}
                            href={sponsor.profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.sponsorItem}
                            title={sponsor.name}
                          >
                            {sponsor.imageUrl ? (
                              <img
                                src={sponsor.imageUrl}
                                alt={sponsor.name}
                                className={styles.sponsorAvatar}
                              />
                            ) : (
                              <div className={styles.sponsorAvatarPlaceholder}>
                                {sponsor.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className={styles.sponsorName}>{sponsor.name}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <a
                    href={pkg.fundingSummary.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.supportButton}
                  >
                    Support on {getPlatformInfo(pkg.fundingSummary.platform).name}
                  </a>
                </div>
              </div>
            )}

            {pkg.fundingSources && pkg.fundingSources.length > 0 && !pkg.fundingSummary && (
              <div className={styles.section}>
                <h3>Fund This Package</h3>
                <div className={styles.fundingLinks}>
                  {pkg.fundingSources.map((source, i) => (
                    <a
                      key={i}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.fundingLink}
                    >
                      {source.platform}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.footer}>
              <a
                href={`https://www.npmjs.com/package/${pkg.name}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on npm
              </a>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
