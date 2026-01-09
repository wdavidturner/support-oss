import { db, schema } from './client.js'

const { packages, maintainers, fundingSources, packageMaintainers } = schema

async function seed() {
  console.log('Seeding database...')

  // Create some test maintainers
  const testMaintainers = [
    {
      id: 'lukeed',
      name: 'Luke Edwards',
      npmUsername: 'lukeed',
      githubUsername: 'lukeed',
      totalDownloads: 50000000,
      packageCount: 47,
    },
    {
      id: 'sindresorhus',
      name: 'Sindre Sorhus',
      npmUsername: 'sindresorhus',
      githubUsername: 'sindresorhus',
      totalDownloads: 100000000,
      packageCount: 1000,
    },
  ]

  for (const maintainer of testMaintainers) {
    await db.insert(maintainers).values(maintainer).onConflictDoNothing()
  }
  console.log(`Inserted ${testMaintainers.length} maintainers`)

  // Create some test packages
  const testPackages = [
    {
      name: 'clsx',
      latestVersion: '2.1.0',
      weeklyDownloads: 15000000,
      dependentCount: 10000,
      repositoryUrl: 'https://github.com/lukeed/clsx',
      repositoryOwner: 'lukeed',
      repositoryName: 'clsx',
      stars: 7000,
      enrichmentStatus: 'completed' as const,
    },
    {
      name: 'uvu',
      latestVersion: '0.5.6',
      weeklyDownloads: 500000,
      dependentCount: 1000,
      repositoryUrl: 'https://github.com/lukeed/uvu',
      repositoryOwner: 'lukeed',
      repositoryName: 'uvu',
      stars: 3000,
      enrichmentStatus: 'completed' as const,
    },
    {
      name: 'chalk',
      latestVersion: '5.3.0',
      weeklyDownloads: 200000000,
      dependentCount: 50000,
      repositoryUrl: 'https://github.com/chalk/chalk',
      repositoryOwner: 'chalk',
      repositoryName: 'chalk',
      stars: 21000,
      enrichmentStatus: 'completed' as const,
    },
    {
      name: 'react',
      latestVersion: '18.2.0',
      weeklyDownloads: 25000000,
      dependentCount: 100000,
      repositoryUrl: 'https://github.com/facebook/react',
      repositoryOwner: 'facebook',
      repositoryName: 'react',
      stars: 220000,
      corporateBacking: 'Meta',
      enrichmentStatus: 'completed' as const,
    },
    {
      name: 'tailwindcss',
      latestVersion: '3.4.0',
      weeklyDownloads: 10000000,
      dependentCount: 20000,
      repositoryUrl: 'https://github.com/tailwindlabs/tailwindcss',
      repositoryOwner: 'tailwindlabs',
      repositoryName: 'tailwindcss',
      stars: 80000,
      aiDisruptionFlag: true,
      aiDisruptionNote: 'AI can now generate UI code using Tailwind, reducing demand for paid UI kits',
      ocSlug: 'tailwindcss',
      enrichmentStatus: 'completed' as const,
    },
  ]

  for (const pkg of testPackages) {
    await db.insert(packages).values(pkg).onConflictDoNothing()
  }
  console.log(`Inserted ${testPackages.length} packages`)

  // Link packages to maintainers
  const packageMaintainerLinks = [
    { packageName: 'clsx', maintainerId: 'lukeed', isPrimary: true, source: 'npm' },
    { packageName: 'uvu', maintainerId: 'lukeed', isPrimary: true, source: 'npm' },
    { packageName: 'chalk', maintainerId: 'sindresorhus', isPrimary: true, source: 'npm' },
  ]

  for (const link of packageMaintainerLinks) {
    await db.insert(packageMaintainers).values(link).onConflictDoNothing()
  }
  console.log(`Inserted ${packageMaintainerLinks.length} package-maintainer links`)

  // Add funding sources
  const testFundingSources = [
    {
      id: 'lukeed-github',
      maintainerId: 'lukeed',
      platform: 'github' as const,
      url: 'https://github.com/sponsors/lukeed',
      verified: true,
    },
    {
      id: 'sindresorhus-github',
      maintainerId: 'sindresorhus',
      platform: 'github' as const,
      url: 'https://github.com/sponsors/sindresorhus',
      verified: true,
    },
    {
      id: 'tailwind-oc',
      packageName: 'tailwindcss',
      platform: 'opencollective' as const,
      url: 'https://opencollective.com/tailwindcss',
      verified: true,
    },
  ]

  for (const source of testFundingSources) {
    await db.insert(fundingSources).values(source).onConflictDoNothing()
  }
  console.log(`Inserted ${testFundingSources.length} funding sources`)

  console.log('Seed completed!')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
