#!/usr/bin/env node

import { program } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const DEFAULT_API_URL = 'https://support-oss.vercel.app'

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
  corporateBacking?: string | null
  weeklyDownloads?: number | null
  fundingSources: FundingSource[]
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

function getCategoryColor(category: string): typeof chalk {
  const colors: Record<string, typeof chalk> = {
    critical: chalk.red,
    'needs-support': chalk.yellow,
    stable: chalk.blue,
    thriving: chalk.green,
    corporate: chalk.magenta,
  }
  return colors[category] || chalk.gray
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    critical: 'CRITICAL',
    'needs-support': 'NEEDS SUPPORT',
    stable: 'STABLE',
    thriving: 'THRIVING',
    corporate: 'CORPORATE',
  }
  return labels[category] || category.toUpperCase()
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

function readPackageJson(filePath?: string): Record<string, string> | null {
  const targetPath = filePath || join(process.cwd(), 'package.json')

  if (!existsSync(targetPath)) {
    return null
  }

  try {
    const content = readFileSync(targetPath, 'utf-8')
    const pkg = JSON.parse(content)
    return {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    }
  } catch {
    return null
  }
}

function readFromStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      data += chunk
    })
    process.stdin.on('end', () => {
      resolve(data)
    })
  })
}

function parseDependencies(input: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(input)
    if (parsed.dependencies || parsed.devDependencies) {
      return { ...parsed.dependencies, ...parsed.devDependencies }
    }
    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
      const isValid = Object.values(parsed).every((v) => typeof v === 'string')
      if (isValid) return parsed as Record<string, string>
    }
  } catch {
    // Not JSON
  }
  return null
}

async function analyze(options: {
  file?: string
  budget: number
  json: boolean
  api: string
}) {
  const spinner = ora('Reading dependencies...').start()

  let dependencies: Record<string, string> | null = null

  // Read from stdin if "-" is passed, otherwise read from file
  if (options.file === '-') {
    spinner.text = 'Reading from stdin...'
    const input = await readFromStdin()
    dependencies = parseDependencies(input)
  } else {
    dependencies = readPackageJson(options.file)
  }

  if (!dependencies || Object.keys(dependencies).length === 0) {
    spinner.fail('No dependencies found')
    console.log(chalk.gray('\nMake sure you have a package.json in the current directory'))
    console.log(chalk.gray('or pipe dependencies via stdin:\n'))
    console.log(chalk.gray('  cat package.json | support-oss analyze'))
    process.exit(1)
  }

  const depCount = Object.keys(dependencies).length
  spinner.text = `Analyzing ${depCount} dependencies...`

  try {
    const res = await fetch(`${options.api}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dependencies, budget: options.budget }),
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }))
      spinner.fail(`Analysis failed: ${error.error || res.statusText}`)
      process.exit(1)
    }

    const data: AnalyzeResponse = await res.json()
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(data, null, 2))
      return
    }

    // Print results
    console.log()
    console.log(chalk.bold('  Support-OSS Dependency Analysis'))
    console.log(chalk.gray('  ─'.repeat(20)))
    console.log()

    // Summary
    console.log(chalk.bold('  Summary'))
    console.log(`    Total packages:    ${chalk.cyan(data.summary.total)}`)
    console.log(`    In database:       ${chalk.cyan(data.summary.found)}`)
    console.log(`    Unknown:           ${chalk.gray(data.summary.notFound)}`)
    console.log(`    Monthly budget:    ${chalk.green(formatCurrency(data.budget))}`)
    console.log()

    // Category breakdown
    console.log(chalk.bold('  Health Breakdown'))
    for (const [category, count] of Object.entries(data.summary.byCategory)) {
      if (count > 0) {
        const color = getCategoryColor(category)
        const label = getCategoryLabel(category)
        console.log(`    ${color('●')} ${label.padEnd(14)} ${count}`)
      }
    }
    console.log()

    // Packages needing support
    const needsSupport = data.packages.filter(
      (p) => p.found && (p.category === 'critical' || p.category === 'needs-support')
    )

    if (needsSupport.length > 0) {
      console.log(chalk.bold('  Packages Needing Support'))
      for (const pkg of needsSupport.slice(0, 10)) {
        const color = getCategoryColor(pkg.category)
        const score = chalk.gray(`score: ${pkg.sustainabilityScore}`)
        const downloads = pkg.weeklyDownloads
          ? chalk.gray(` · ${formatNumber(pkg.weeklyDownloads)}/wk`)
          : ''
        console.log(`    ${color('●')} ${pkg.name} ${score}${downloads}`)

        if (pkg.fundingSources.length > 0) {
          const links = pkg.fundingSources.map(f => f.platform).join(', ')
          console.log(chalk.gray(`      Fund via: ${links}`))
        }
      }
      console.log()
    }

    // Suggested allocation
    const withAllocation = data.packages.filter(
      (p) => p.allocation && p.allocation.suggestedAmount > 0
    )

    if (withAllocation.length > 0) {
      console.log(chalk.bold('  Suggested Allocation'))
      for (const pkg of withAllocation.slice(0, 5)) {
        const amount = chalk.green(formatCurrency(pkg.allocation!.suggestedAmount))
        const percent = chalk.gray(`(${pkg.allocation!.percentage.toFixed(1)}%)`)
        console.log(`    ${pkg.name.padEnd(20)} ${amount} ${percent}`)
      }

      if (withAllocation.length > 5) {
        console.log(chalk.gray(`    ... and ${withAllocation.length - 5} more`))
      }
      console.log()
    }

    // Footer
    console.log(chalk.gray('  ─'.repeat(20)))
    console.log(chalk.gray(`  Analyze online: ${DEFAULT_API_URL}`))
    console.log()

  } catch (error) {
    spinner.fail('Failed to connect to API')
    console.log(chalk.gray(`\nCould not reach ${options.api}`))
    console.log(chalk.gray('Check your internet connection or try again later.'))
    process.exit(1)
  }
}

program
  .name('support-oss')
  .description('Analyze your dependencies and find open source projects that need support')
  .version('0.0.1')

program
  .command('analyze')
  .description('Analyze dependencies from package.json')
  .argument('[path]', 'Path to package.json, or "-" for stdin (default: ./package.json)')
  .option('-b, --budget <amount>', 'Monthly budget in USD', '100')
  .option('--json', 'Output as JSON (for CI integration)')
  .option('--api <url>', 'API URL', DEFAULT_API_URL)
  .action((path, options) => {
    analyze({
      file: path,
      budget: parseInt(options.budget, 10),
      json: options.json || false,
      api: options.api,
    })
  })

// Default command if none specified
program
  .action(() => {
    program.help()
  })

program.parse()
