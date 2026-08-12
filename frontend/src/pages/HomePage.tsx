import styles from './HomePage.module.css';

/**
 * HomePage — Phase 1 landing page.
 * Confirms the React app boots and renders the StrideWars brand.
 * Full landing page content will be implemented in a later phase.
 */
function HomePage(): JSX.Element {
  return (
    <main className={styles.hero} id="home-page">
      {/* Ambient glow layers */}
      <div className={styles.glowOrb} aria-hidden="true" />
      <div className={styles.glowOrbSecondary} aria-hidden="true" />

      {/* Grid overlay */}
      <div className={styles.gridOverlay} aria-hidden="true" />

      <div className={styles.content}>
        {/* Phase badge */}
        <div className={styles.phaseBadge}>
          <span className={styles.phaseDot} aria-hidden="true" />
          Phase 1 — Repository Bootstrap
        </div>

        {/* Logo + wordmark */}
        <div className={styles.logoLockup}>
          <div className={styles.logoIcon} aria-hidden="true">
            <svg
              viewBox="0 0 48 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle cx="24" cy="24" r="22" stroke="url(#grad)" strokeWidth="2" />
              <path
                d="M14 30L20 18L26 26L32 14"
                stroke="url(#grad)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="32" cy="14" r="3" fill="url(#grad)" />
              <defs>
                <linearGradient
                  id="grad"
                  x1="0"
                  y1="0"
                  x2="48"
                  y2="48"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="#6C63FF" />
                  <stop offset="1" stopColor="#FF6584" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className={styles.wordmark}>StrideWars</h1>
        </div>

        {/* Tagline */}
        <p className={styles.tagline}>
          Capture territories. Crush records.{' '}
          <span className={styles.taglineAccent}>Dominate the map.</span>
        </p>

        {/* Status cards */}
        <div className={styles.statusGrid} role="list" aria-label="System status">
          <StatusCard icon="✅" label="Backend" value="Running on :3001" color="green" />
          <StatusCard icon="✅" label="Frontend" value="Running on :5173" color="green" />
          <StatusCard icon="⏳" label="Database" value="Phase 2" color="amber" />
          <StatusCard icon="⏳" label="Auth" value="Phase 3" color="amber" />
        </div>

        {/* Phase description */}
        <p className={styles.phaseDesc}>
          The monorepo is scaffolded. Backend modules, ESLint, Prettier, and Jest are wired up.
          <br />
          Next up: PostgreSQL schema + migrations.
        </p>
      </div>
    </main>
  );
}

interface StatusCardProps {
  icon: string;
  label: string;
  value: string;
  color: 'green' | 'amber' | 'red';
}

function StatusCard({ icon, label, value, color }: StatusCardProps): JSX.Element {
  return (
    <div className={`${styles.statusCard} ${styles[`statusCard--${color}`]}`} role="listitem">
      <span className={styles.statusIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.statusLabel}>{label}</span>
      <span className={styles.statusValue}>{value}</span>
    </div>
  );
}

export default HomePage;
