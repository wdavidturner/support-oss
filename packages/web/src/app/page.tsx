import DependencyAnalyzer from './components/DependencyAnalyzer'
import styles from './page.module.css'

export default function Home() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>Support-OSS</h1>
        <p className={styles.tagline}>
          A sustainability radar for open source — helping developers know where their donations
          matter most.
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
          Open source sustainability starts with visibility.
        </p>
      </footer>
    </main>
  )
}
