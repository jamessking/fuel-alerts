import Head from 'next/head'
import Link from 'next/link'
import { getAllRegions, toSlug, getLatestSnapshotDate } from '../../lib/fuel'
import { supabase } from '../../lib/supabase'
import styles from '../../styles/TownPage.module.css'

const fmt = p => p != null ? `${parseFloat(p).toFixed(1)}p` : '—'

export default function RegionPage({ region, towns, avgPetrol, avgDiesel, stationCount, country, slug }) {
  const title = `Cheapest Fuel in ${region} — Petrol & Diesel Prices by Town`
  const description = `Compare fuel prices across ${region}. Average petrol ${fmt(avgPetrol)}, diesel ${fmt(avgDiesel)} across ${stationCount} stations and ${towns.length} towns.`

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`https://fuelalert.co.uk/region/${slug}`} />
      </Head>

      <div className={styles.page}>
        <nav className={styles.nav}>
          <Link href="/" className={styles.logo}>⛽ FuelAlerts</Link>
          <div className={styles.breadcrumb}>
            {country && <><Link href={`/country/${toSlug(country)}`}>{country}</Link> › </>}
            <span>{region}</span>
          </div>
        </nav>

        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.pill}>⛽ Live prices</div>
            <h1>Fuel prices in <span className={styles.accent}>{region}</span></h1>
            <p className={styles.sub}>
              {stationCount} stations tracked across {towns.length} towns in {region}.
              Average petrol <strong>{fmt(avgPetrol)}</strong> · Average diesel <strong>{fmt(avgDiesel)}</strong>
            </p>
          </div>
        </header>

        <main className={styles.main}>
          <section className={styles.top5Section}>
            <h2>Towns in {region}</h2>
            <div className={styles.townGrid}>
              {towns.map(t => (
                <Link key={t.slug} href={`/town/${t.slug}`} className={styles.townCard}>
                  <div className={styles.townName}>{t.city}</div>
                  <div className={styles.townMeta}>{t.count} stations</div>
                  {t.cheapestPetrol && <div className={styles.townPrice}>⛽ {fmt(t.cheapestPetrol)}</div>}
                </Link>
              ))}
            </div>
          </section>

          <section className={styles.ctaSection}>
            <div className={styles.ctaCard}>
              <h2>Get weekly fuel price alerts for {region}</h2>
              <p>Free digest every Monday. No app. Unsubscribe anytime.</p>
              <a href="/" className={styles.ctaBtn}>Get my FuelAlerts — free →</a>
            </div>
          </section>

          {country && (
            <section className={styles.internalLinks}>
              <Link href={`/country/${toSlug(country)}`} className={styles.internalLink}>
                🇬🇧 All {country} fuel prices
              </Link>
            </section>
          )}
        </main>
      </div>
    </>
  )
}

export async function getStaticPaths() {
  const regions = await getAllRegions()
  return {
    paths: regions.map(r => ({ params: { slug: r.slug } })),
    fallback: 'blocking',
  }
}

export async function getStaticProps({ params }) {
  const { slug } = params
  const regions = await getAllRegions()
  const match = regions.find(r => r.slug === slug)
  if (!match) return { notFound: true }

  const regionName = match.region
  const today = await getLatestSnapshotDate()

  // Single RPC — does the join + aggregation server-side, no row limit issues
  const { data: towns_raw, error } = await supabase.rpc('get_region_towns', {
    p_county: regionName,
    p_today:  today,
  })

  if (error) console.error('get_region_towns error:', error)

  const rows = towns_raw || []

  const country = rows[0]?.country || null

  // Derive overall region stats from town rows
  const allPetrol  = rows.map(r => r.avg_petrol).filter(Boolean).map(Number)
  const allDiesel  = rows.map(r => r.avg_diesel).filter(Boolean).map(Number)
  const totalStations = rows.reduce((s, r) => s + Number(r.station_count), 0)
  const avg = arr => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10 : null

  const towns = rows.map(r => ({
    city:           r.city,
    slug:           toSlug(r.city),
    count:          Number(r.station_count),
    cheapestPetrol: r.cheapest_petrol != null ? parseFloat(r.cheapest_petrol) : null,
  }))

  return {
    props: {
      region: regionName,
      slug,
      country,
      towns,
      stationCount: totalStations,
      avgPetrol:    avg(allPetrol),
      avgDiesel:    avg(allDiesel),
    },
    revalidate: 6 * 60 * 60,
  }
}
