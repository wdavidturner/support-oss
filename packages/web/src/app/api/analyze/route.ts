import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@support-oss/db'
import { inArray } from 'drizzle-orm'
import {
  calculateScore,
  calculateAllocation,
  buildFundingSummary,
  type SustainabilityCategory,
} from '@support-oss/shared'

const { packages } = schema

interface AnalyzeRequest {
  dependencies: Record<string, string>
  devDependencies?: Record<string, string>
  budget?: number
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeRequest = await request.json()

    if (!body.dependencies || typeof body.dependencies !== 'object') {
      return NextResponse.json({ error: 'dependencies object required' }, { status: 400 })
    }

    const allDeps = {
      ...body.dependencies,
      ...(body.devDependencies || {}),
    }

    const packageNames = Object.keys(allDeps)

    if (packageNames.length === 0) {
      return NextResponse.json({ error: 'No dependencies provided' }, { status: 400 })
    }

    if (packageNames.length > 500) {
      return NextResponse.json({ error: 'Too many dependencies (max 500)' }, { status: 400 })
    }

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

    // Seed unknown packages for future crawling
    const unknownPackages = packageNames.filter((name) => !packageMap.has(name))
    if (unknownPackages.length > 0) {
      // Insert in background - don't block the response
      db.insert(packages)
        .values(
          unknownPackages.map((name) => ({
            name,
            enrichmentStatus: 'pending' as const,
          }))
        )
        .onConflictDoNothing()
        .execute()
        .catch((err) => console.error('Failed to seed unknown packages:', err))
    }

    const analyzed = packageNames.map((name) => {
      const version = allDeps[name]
      const pkg = packageMap.get(name)

      if (!pkg) {
        return {
          name,
          version,
          found: false,
          sustainabilityScore: 50,
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

      // Get top maintainers sorted by last commit date (most recent first)
      const topMaintainers = pkg.maintainers
        .filter((m) => m.maintainer)
        .sort((a, b) => {
          const aTime = a.lastCommitAt?.getTime() || 0
          const bTime = b.lastCommitAt?.getTime() || 0
          if (bTime !== aTime) return bTime - aTime
          return (b.commitPercentage || 0) - (a.commitPercentage || 0)
        })
        .slice(0, 5)
        .map((m) => ({
          name: m.maintainer.name,
          githubUsername: m.maintainer.githubUsername,
          commitPercentage: m.commitPercentage,
          recentCommits: m.recentCommits,
          lastCommitAt: m.lastCommitAt,
        }))

      const fundingSummary = buildFundingSummary({
        ocSlug: pkg.ocSlug,
        ocBalance: pkg.ocBalance,
        ocYearlyIncome: pkg.ocYearlyIncome,
        ocBackersCount: pkg.ocBackersCount,
        ocGoalAmount: pkg.ocGoalAmount,
        ocGoalProgress: pkg.ocGoalProgress,
        ocTopSponsors: pkg.ocTopSponsors as { name: string; imageUrl: string | null; profileUrl: string }[] | null,
        ghHasSponsorsListing: pkg.ghHasSponsorsListing,
        ghSponsorsCount: pkg.ghSponsorsCount,
        ghTopSponsors: pkg.ghTopSponsors as { name: string; imageUrl: string | null; profileUrl: string }[] | null,
        repositoryOwner: pkg.repositoryOwner,
      })

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
        fundingSummary,
        maintainers: topMaintainers,
      }
    })

    const budget = body.budget || 100
    const allocation = calculateAllocation(
      analyzed.map((p) => ({
        packageName: p.name,
        score: p.sustainabilityScore,
        category: p.category,
      })),
      budget
    )

    const allocationMap = new Map(allocation.map((a) => [a.packageName, a]))
    const packagesWithAllocation = analyzed.map((p) => ({
      ...p,
      allocation: allocationMap.get(p.name),
    }))

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

    packagesWithAllocation.sort(
      (a, b) => (b.allocation?.suggestedAmount || 0) - (a.allocation?.suggestedAmount || 0)
    )

    return NextResponse.json({
      summary,
      budget,
      packages: packagesWithAllocation,
    })
  } catch (error) {
    console.error('Analyze error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
