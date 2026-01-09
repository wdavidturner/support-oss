import { Hono } from 'hono'
import { db, schema } from '@support-oss/db'
import { inArray } from 'drizzle-orm'
import { calculateScore, calculateAllocation, type SustainabilityCategory } from '@support-oss/shared'

const { packages } = schema

const app = new Hono()

interface AnalyzeRequest {
  dependencies: Record<string, string> // { "react": "^18.0.0", "lodash": "^4.0.0" }
  devDependencies?: Record<string, string>
  budget?: number // Optional budget for allocation
}

// POST /analyze - Analyze dependencies and get allocation suggestions
app.post('/', async (c) => {
  const body = await c.req.json<AnalyzeRequest>()

  if (!body.dependencies || typeof body.dependencies !== 'object') {
    return c.json({ error: 'dependencies object required' }, 400)
  }

  // Combine deps and devDeps
  const allDeps = {
    ...body.dependencies,
    ...(body.devDependencies || {}),
  }

  const packageNames = Object.keys(allDeps)

  if (packageNames.length === 0) {
    return c.json({ error: 'No dependencies provided' }, 400)
  }

  if (packageNames.length > 500) {
    return c.json({ error: 'Too many dependencies (max 500)' }, 400)
  }

  // Fetch packages from database
  const results = await db.query.packages.findMany({
    where: inArray(packages.name, packageNames),
    with: {
      fundingSources: true,
      maintainers: {
        with: {
          maintainer: true,
        },
      },
    },
  })

  const packageMap = new Map(results.map((p) => [p.name, p]))

  // Process each dependency
  const analyzed = packageNames.map((name) => {
    const version = allDeps[name]
    const pkg = packageMap.get(name)

    if (!pkg) {
      // Unknown package - not in our database
      return {
        name,
        version,
        found: false,
        sustainabilityScore: 50, // Neutral score for unknown
        category: 'stable' as SustainabilityCategory,
        fundingSources: [],
        maintainers: [],
      }
    }

    const score = calculateScore({
      weeklyDownloads: pkg.weeklyDownloads,
      dependentCount: pkg.dependentCount,
      ocBalance: pkg.ocBalance,
      ocYearlyIncome: pkg.ocYearlyIncome,
      corporateBacking: pkg.corporateBacking,
      maintainerCount: pkg.maintainers.length,
      daysSinceLastPublish: pkg.lastPublish
        ? Math.floor((Date.now() - new Date(pkg.lastPublish).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      aiDisruptionFlag: pkg.aiDisruptionFlag,
      maintainerStatus: pkg.maintainerStatus,
    })

    // Get primary maintainer
    const primaryMaintainer = pkg.maintainers.find((m) => m.isPrimary)?.maintainer

    return {
      name,
      version,
      found: true,
      sustainabilityScore: score.score,
      category: score.category,
      scoreExplanation: score.explanation,
      corporateBacking: pkg.corporateBacking,
      aiDisruptionFlag: pkg.aiDisruptionFlag,
      weeklyDownloads: pkg.weeklyDownloads,
      fundingSources: pkg.fundingSources,
      primaryMaintainer: primaryMaintainer
        ? {
            name: primaryMaintainer.name,
            githubUsername: primaryMaintainer.githubUsername,
          }
        : null,
    }
  })

  // Calculate allocation if budget provided
  const budget = body.budget || 100 // Default to $100 for percentage calc
  const allocation = calculateAllocation(
    analyzed.map((p) => ({
      packageName: p.name,
      score: p.sustainabilityScore,
      category: p.category,
    })),
    budget
  )

  // Merge allocation into analyzed packages
  const allocationMap = new Map(allocation.map((a) => [a.packageName, a]))
  const packagesWithAllocation = analyzed.map((p) => ({
    ...p,
    allocation: allocationMap.get(p.name),
  }))

  // Group by category for summary
  const summary = {
    total: packageNames.length,
    found: analyzed.filter((p) => p.found).length,
    notFound: analyzed.filter((p) => !p.found).length,
    byCategory: {
      critical: analyzed.filter((p) => p.category === 'critical').length,
      'needs-support': analyzed.filter((p) => p.category === 'needs-support').length,
      stable: analyzed.filter((p) => p.category === 'stable').length,
      thriving: analyzed.filter((p) => p.category === 'thriving').length,
      corporate: analyzed.filter((p) => p.category === 'corporate').length,
    },
  }

  // Sort by allocation (highest first)
  packagesWithAllocation.sort(
    (a, b) => (b.allocation?.suggestedAmount || 0) - (a.allocation?.suggestedAmount || 0)
  )

  return c.json({
    summary,
    budget,
    packages: packagesWithAllocation,
  })
})

export default app
