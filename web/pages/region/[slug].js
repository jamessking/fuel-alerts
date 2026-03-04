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

  const { data: stations } = await supabase
    .from('pfs_stations')
    .select('node_id, city, country')
    .ilike('county', regionName)
    .neq('permanent_closure', true)

  if (!stations) return { notFound: true }

  const country = stations[0]?.country || null
  const cityCounts = {}
  for (const s of stations) {
    const c = (s.city || '').trim()
    if (c) cityCounts[c] = (cityCounts[c] || 0) + 1
  }

  const nodeIds = stations.map(s => s.node_id)

  const { data: prices } = await supabase
    .from('fuel_prices_daily')
    .select('node_id, fuel_type, price')
    .in('node_id', nodeIds)
    .eq('snapshot_date', today)
    .in('fuel_type', ['E10', 'B7_STANDARD'])

  const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
  const petrolPrices = (prices || []).filter(p => p.fuel_type === 'E10').map(p => parseFloat(p.price))
  const dieselPrices = (prices || []).filter(p => p.fuel_type === 'B7_STANDARD').map(p => parseFloat(p.price))

  const stationMap = {}
  for (const s of stations) stationMap[s.node_id] = s
  const cityPrices = {}
  for (const p of (prices || [])) {
    const city = stationMap[p.node_id]?.city
    if (!city || p.fuel_type !== 'E10') continue
    const price = parseFloat(p.price)
    if (!cityPrices[city] || price < cityPrices[city]) cityPrices[city] = price
  }

  const towns = Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([city, count]) => ({
      city,
      slug: toSlug(city),
      count,
      cheapestPetrol: cityPrices[city] || null,
    }))

  return {
    props: {
      region: regionName, slug, country, towns,
      stationCount: stations.length,
      avgPetrol: avg(petrolPrices) ? Math.round(avg(petrolPrices) * 10) / 10 : null,
      avgDiesel: avg(dieselPrices) ? Math.round(avg(dieselPrices) * 10) / 10 : null,
    },
    revalidate: 6 * 60 * 60,
  }
}
