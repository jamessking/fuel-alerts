import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { toSlug, fromSlug } from '../../lib/fuel'
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

  const today = new Date().toISOString().split('T')[0]

  const { data: stations } = await supabase
    .from('pfs_stations')
    .select('node_id, county')
    .ilike('country', country)
    .neq('permanent_closure', true)

  if (!stations) return { notFound: true }

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

  // Group by county
  const stationMap = {}
  for (const s of stations) stationMap[s.node_id] = s
  const countyData = {}
  for (const p of (prices || [])) {
    const county = stationMap[p.node_id]?.county
    if (!county) continue
    if (!countyData[county]) countyData[county] = { petrol: [], diesel: [], count: 0 }
    if (p.fuel_type === 'E10') countyData[county].petrol.push(parseFloat(p.price))
    if (p.fuel_type === 'B7_STANDARD') countyData[county].diesel.push(parseFloat(p.price))
  }
  for (const s of stations) {
    if (s.county && countyData[s.county]) countyData[s.county].count++
  }

  const regions = Object.entries(countyData)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 30)
    .map(([region, d]) => ({
      region,
      slug: toSlug(region),
      stationCount: d.count,
      avgPetrol: d.petrol.length ? Math.round(avg(d.petrol) * 10) / 10 : null,
      avgDiesel: d.diesel.length ? Math.round(avg(d.diesel) * 10) / 10 : null,
    }))

  return {
    props: {
      country,
      slug,
      regions,
      stationCount: stations.length,
      avgPetrol: avg(petrolPrices) ? Math.round(avg(petrolPrices) * 10) / 10 : null,
      avgDiesel: avg(dieselPrices) ? Math.round(avg(dieselPrices) * 10) / 10 : null,
    },
    revalidate: 6 * 60 * 60,
  }
}
