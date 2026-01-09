import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Support-OSS - Open Source Donation Calculator',
  description:
    'Figure out where your open source donations will have the most impact. Paste your dependencies and see which packages need support.',
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
