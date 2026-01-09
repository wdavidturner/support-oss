'use client'

import { useState } from 'react'
import styles from './DependencyAnalyzer.module.css'
import PackageDrawer from './PackageDrawer'

interface FundingSource {
  platform: string
  url: string
}

interface Allocation {
  packageName: string
  percentage: number
  suggestedAmount: number
  reason: string
}

interface AnalyzedPackage {
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
  primaryMaintainer?: { name: string; githubUsername: string | null } | null
  allocation?: Allocation
}

interface AnalyzeResponse {
  summary: {
    total: number
    found: number
    notFound: number
    byCategory: Record<string, number>
  }
  budget: number
  packages: AnalyzedPackage[]
}

const EXAMPLE_DEPS = `{
  "react": "^19.0.0",
  "next": "^15.1.4",
  "lodash": "^4.17.21",
  "express": "^4.18.2",
  "axios": "^1.6.0",
  "typescript": "^5.7.3"
}`

function parseDependencies(input: string): Record<string, string> | null {
  const trimmed = input.trim()

  // Try parsing as JSON (full package.json or just deps object)
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed.dependencies || parsed.devDependencies) {
      return { ...parsed.dependencies, ...parsed.devDependencies }
    }
    // If it's a simple object with string values, use it directly
    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
      const isValid = Object.values(parsed).every((v) => typeof v === 'string')
      if (isValid) return parsed as Record<string, string>
    }
  } catch {
    // Not JSON, try parsing as a list
  }

  // Try parsing as a list of package names (one per line)
  const lines = trimmed.split('\n').filter((line) => line.trim())
  if (lines.length > 0) {
    const deps: Record<string, string> = {}
    for (const line of lines) {
      const clean = line.trim().replace(/[",]/g, '')
      // Handle "package": "version" or "package@version" or just "package"
      const colonMatch = clean.match(/^([^:]+):\s*(.+)$/)
      if (colonMatch && colonMatch[1] && colonMatch[2]) {
        deps[colonMatch[1].trim().replace(/"/g, '')] = colonMatch[2].trim().replace(/"/g, '')
      } else if (clean.includes('@') && !clean.startsWith('@')) {
        const parts = clean.split('@')
        const name = parts[0]
        const version = parts[1]
        if (name) {
          deps[name] = version || '*'
        }
      } else if (clean) {
        deps[clean] = '*'
      }
    }
    if (Object.keys(deps).length > 0) return deps
  }

  return null
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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toString()
}

export default function DependencyAnalyzer() {
  const [input, setInput] = useState('')
  const [budget, setBudget] = useState(100)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<AnalyzeResponse | null>(null)
  const [selectedPackage, setSelectedPackage] = useState<AnalyzedPackage | null>(null)

  async function handleAnalyze() {
    setError(null)
    setResults(null)

    const deps = parseDependencies(input)
    if (!deps || Object.keys(deps).length === 0) {
      setError('Could not parse dependencies. Please paste a valid JSON object or list of package names.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dependencies: deps, budget }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Analysis failed')
      }

      const data = await res.json()
      setResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  function handleTryExample() {
    setInput(EXAMPLE_DEPS)
    setResults(null)
    setError(null)
  }

  function handleReset() {
    setInput('')
    setResults(null)
    setError(null)
    setSelectedPackage(null)
  }

  return (
    <div className={styles.container}>
      {!results && (
      <div className={styles.inputSection}>
        <div className={styles.inputHeader}>
          <h2>Paste Your Dependencies</h2>
          <button className="btn-secondary" onClick={handleTryExample} type="button">
            Try Example
          </button>
        </div>
        <textarea
          className={styles.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Paste your dependencies or devDependencies from package.json, or a list of package names:\n\n${EXAMPLE_DEPS}`}
          rows={10}
        />
        <div className={styles.controls}>
          <div className={styles.budgetControl}>
            <label htmlFor="budget">Monthly budget:</label>
            <div className={styles.budgetInput}>
              <span>$</span>
              <input
                id="budget"
                type="number"
                min={1}
                max={10000}
                value={budget}
                onChange={(e) => setBudget(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
          </div>
          <button className="btn-primary" onClick={handleAnalyze} disabled={loading || !input.trim()}>
            {loading ? 'Analyzing...' : 'Analyze Dependencies'}
          </button>
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </div>
      )}

      {results && (
        <div className={styles.results}>
          <div className={styles.allocation}>
            <h2>Suggested Allocation</h2>
            <p className={styles.allocationSubtitle}>
              Based on sustainability scores, here&apos;s how to distribute{' '}
              <strong>{formatCurrency(results.budget)}/month</strong> across {results.summary.found} packages.
            </p>
            <div className={styles.packageList}>
              {results.packages
                .filter((pkg) => pkg.allocation && pkg.allocation.suggestedAmount > 0)
                .map((pkg) => (
                  <div
                    key={pkg.name}
                    className={`${styles.packageCard} ${styles.clickable}`}
                    onClick={() => setSelectedPackage(pkg)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedPackage(pkg)}
                  >
                    <div className={styles.packageHeader}>
                      <div className={styles.packageName}>
                        <span className={styles.name}>{pkg.name}</span>
                        <span className={styles.version}>{pkg.version}</span>
                      </div>
                      <div className={styles.packageAmount}>
                        <span className={styles.amount}>{formatCurrency(pkg.allocation!.suggestedAmount)}</span>
                        <span className={styles.percentage}>{pkg.allocation!.percentage.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className={styles.packageMeta}>
                      <span
                        className={styles.category}
                        style={{ color: getCategoryColor(pkg.category) }}
                      >
                        {getCategoryLabel(pkg.category)}
                      </span>
                      <span className={styles.score}>Score: {pkg.sustainabilityScore}</span>
                      {pkg.weeklyDownloads && (
                        <span className={styles.downloads}>{formatNumber(pkg.weeklyDownloads)} weekly</span>
                      )}
                      {pkg.corporateBacking && (
                        <span className={styles.corporate}>Backed by {pkg.corporateBacking}</span>
                      )}
                    </div>
                    {pkg.allocation?.reason && (
                      <p className={styles.reason}>{pkg.allocation.reason}</p>
                    )}
                    {pkg.fundingSources && pkg.fundingSources.length > 0 && (
                      <div className={styles.funding} onClick={(e) => e.stopPropagation()}>
                        <span>Fund via:</span>
                        {pkg.fundingSources.map((f, i) => (
                          <a key={i} href={f.url} target="_blank" rel="noopener noreferrer">
                            {f.platform}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>

          {results.packages.filter((p) => !p.found).length > 0 && (
            <div className={styles.unknownPackages}>
              <h3>Not In Our Database Yet</h3>
              <p>
                We don't have sustainability data for these packages yet. They may be newer, less popular,
                or not part of our high-impact package list.
              </p>
              <div className={styles.packageListCompact}>
                {results.packages
                  .filter((p) => !p.found)
                  .map((pkg) => (
                    <span
                      key={pkg.name}
                      className={`${styles.compactPackage} ${styles.clickable}`}
                      onClick={() => setSelectedPackage(pkg)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && setSelectedPackage(pkg)}
                    >
                      {pkg.name}
                      <span className={styles.unknownBadge}>Unknown</span>
                    </span>
                  ))}
              </div>
            </div>
          )}

          {results.packages.filter((p) => p.found && (!p.allocation || p.allocation.suggestedAmount === 0)).length > 0 && (
            <div className={styles.noAllocation}>
              <h3>Not Prioritized for Allocation</h3>
              <p>These packages are well-funded, corporate-backed, or otherwise stable.</p>
              <div className={styles.packageListCompact}>
                {results.packages
                  .filter((p) => p.found && (!p.allocation || p.allocation.suggestedAmount === 0))
                  .map((pkg) => (
                    <span
                      key={pkg.name}
                      className={`${styles.compactPackage} ${styles.clickable}`}
                      onClick={() => setSelectedPackage(pkg)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && setSelectedPackage(pkg)}
                    >
                      {pkg.name}
                      <span
                        className={styles.compactCategory}
                        style={{ color: getCategoryColor(pkg.category) }}
                      >
                        {getCategoryLabel(pkg.category)}
                      </span>
                    </span>
                  ))}
              </div>
            </div>
          )}

          <div className={styles.resetSection}>
            <button className={styles.resetButton} onClick={handleReset} type="button">
              Analyze another project
            </button>
          </div>
        </div>
      )}

      <PackageDrawer pkg={selectedPackage} onClose={() => setSelectedPackage(null)} />
    </div>
  )
}
