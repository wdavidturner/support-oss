import Image from 'next/image'
import DependencyAnalyzer from './components/DependencyAnalyzer'
import styles from './page.module.css'

export default function Home() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Image
          src="/logo.svg"
          alt="<💚> Support-OSS"
          width={120}
          height={50}
          className={styles.logo}
          priority
        />
        <h1 className={styles.title}>Support-OSS</h1>
        <p className={styles.tagline}>
          Figure out where your open source donations will have the most impact.
        </p>
      </header>

      <section className={styles.content}>
        <DependencyAnalyzer />
      </section>

      <footer className={styles.footer}>
        <p>
          <a href="https://support-oss.dev" target="_blank" rel="noopener noreferrer">
            support-oss.dev
          </a>
          {' · '}
          Open source thrives when we support it together.
        </p>
      </footer>
    </main>
  )
}
