import { Hono } from 'hono'
import { db, schema } from '@support-oss/db'
import { eq, inArray } from 'drizzle-orm'
import { calculateScore } from '@support-oss/shared'

const { packages, fundingSources, packageMaintainers, maintainers } = schema

const app = new Hono()

// GET /packages/:name - Get a single package
app.get('/:name', async (c) => {
  const name = c.req.param('name')

  const pkg = await db.query.packages.findFirst({
    where: eq(packages.name, name),
    with: {
      fundingSources: true,
      maintainers: {
        with: {
          maintainer: true,
        },
      },
    },
  })

  if (!pkg) {
    return c.json({ error: 'Package not found', name }, 404)
  }

  // Calculate score if we have enough data
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

  return c.json({
    ...pkg,
    sustainabilityScore: score.score,
    category: score.category,
    scoreExplanation: score.explanation,
  })
})

// POST /packages/batch - Get multiple packages
app.post('/batch', async (c) => {
  const body = await c.req.json<{ packages: string[] }>()

  if (!body.packages || !Array.isArray(body.packages)) {
    return c.json({ error: 'packages array required' }, 400)
  }

  // Limit batch size
  const packageNames = body.packages.slice(0, 200)

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

  // Build a map for quick lookup
  const packageMap = new Map(results.map((p) => [p.name, p]))

  // Return in the same order as requested, with nulls for missing
  const response = packageNames.map((name) => {
    const pkg = packageMap.get(name)
    if (!pkg) {
      return { name, found: false }
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

    return {
      ...pkg,
      found: true,
      sustainabilityScore: score.score,
      category: score.category,
      scoreExplanation: score.explanation,
    }
  })

  return c.json({ packages: response })
})

export default app
