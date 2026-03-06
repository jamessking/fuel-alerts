import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { toSlug, getLatestSnapshotDate } from '../../lib/fuel'
import styles from '../../styles/TownPage.module.css'

const fmt = p => p != null ? `${parseFloat(p).toFixed(1)}p` : '—'
const COUNTRIES = ['England', 'Scotland', 'Wales', 'Northern Ireland']

export default function CountryPage({ country, regions, avgPetrol, avgDiesel, stationCount, slug }) {
  const title = `Cheapest Fuel in ${country} — Petrol & Diesel Prices by Region`
  const description = `Compare fuel prices across ${country}. Average petrol ${fmt(avgPetrol)}, diesel ${fmt(avgDiesel)} across ${stationCount} stations.`

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`https://fuelalert.co.uk/country/${slug}`} />
      </Head>

      <div className={styles.page}>
        <nav className={styles.nav}>
          <Link href="/" className={styles.logo}>⛽ FuelAlerts</Link>
          <div className={styles.breadcrumb}><span>{country}</span></div>
        </nav>

        <header className={styles.header}>
          <div className={styles.headerInner}>
            <h1>Fuel prices in <span className={styles.accent}>{country}</span></h1>
            <p className={styles.sub}>
              {stationCount} stations tracked across {country}.
              Average petrol <strong>{fmt(avgPetrol)}</strong> · Average diesel <strong>{fmt(avgDiesel)}</strong>
            </p>
          </div>
        </header>

        <main className={styles.main}>
          <section className={styles.top5Section}>
            <h2>Regions in {country}</h2>
            <div className={styles.townGrid}>
              {regions.map(r => (
                <Link key={r.slug} href={`/region/${r.slug}`} className={styles.townCard}>
                  <div className={styles.townName}>{r.region}</div>
                  <div className={styles.townMeta}>{r.stationCount} stations</div>
                  {r.avgPetrol && <div className={styles.townPrice}>⛽ avg {fmt(r.avgPetrol)}</div>}
                </Link>
              ))}
            </div>
          </section>

          <section className={styles.ctaSection}>
            <div className={styles.ctaCard}>
              <h2>Get weekly fuel alerts for {country}</h2>
              <p>Free digest every Monday. No app. Unsubscribe anytime.</p>
              <a href="/" className={styles.ctaBtn}>Get my FuelAlerts — free →</a>
            </div>
          </section>

          <section className={styles.internalLinks}>
            <h3>Other countries</h3>
            <div className={styles.linkGrid}>
              {COUNTRIES.filter(c => c !== country).map(c => (
                <Link key={c} href={`/country/${toSlug(c)}`} className={styles.internalLink}>
                  🇬🇧 {c} fuel prices
                </Link>
              ))}
            </div>
          </section>
        </main>
      </div>
    </>
  )
}

export async function getStaticPaths() {
  return {
    paths: COUNTRIES.map(c => ({ params: { slug: toSlug(c) } })),
    fallback: false,
  }
}

export async function getStaticProps({ params }) {
  const { slug } = params
  const country = COUNTRIES.find(c => toSlug(c) === slug)
  if (!country) return { notFound: true }

  const today = await getLatestSnapshotDate()

  // Two RPC calls — both do server-side joins, no row limit issues
  const [statsRes, regionsRes] = await Promise.all([
    supabase.rpc('get_country_stats', {
      p_country: country,
      p_today:   today,
    }),
    supabase.rpc('get_country_regions', {
      p_country: country,
      p_today:   today,
    }),
  ])

  if (statsRes.error) console.error('get_country_stats error:', statsRes.error)
  if (regionsRes.error) console.error('get_country_regions error:', regionsRes.error)

  const stats   = statsRes.data?.[0] || {}
  const regions = (regionsRes.data || []).map(r => ({
    region:       r.county,
    slug:         toSlug(r.county),
    stationCount: Number(r.station_count),
    avgPetrol:    r.avg_petrol   != null ? parseFloat(r.avg_petrol)  : null,
    avgDiesel:    r.avg_diesel   != null ? parseFloat(r.avg_diesel)  : null,
  }))

  return {
    props: {
      country,
      slug,
      regions,
      stationCount: Number(stats.station_count || 0),
      avgPetrol:    stats.avg_petrol != null ? parseFloat(stats.avg_petrol) : null,
      avgDiesel:    stats.avg_diesel != null ? parseFloat(stats.avg_diesel) : null,
    },
    revalidate: 6 * 60 * 60,
  }
}
