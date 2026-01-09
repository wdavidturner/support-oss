import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Support-OSS - Know Where Your Donations Matter Most',
  description:
    'A sustainability radar for open source. Paste your dependencies and discover which packages need your support.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
