import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import styles from '../styles/BrandPage.module.css'
import indexStyles from '../styles/SupermarketIndex.module.css'

const fmt = p => p != null ? `${parseFloat(p).toFixed(1)}p` : '—'
const toSlug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

// Brands to feature at the top with descriptions
const BRAND_INFO = {
  'BP':           { desc: 'One of the UK\'s largest fuel networks. BP Ultimate premium fuel available at most sites.' },
  'Shell':        { desc: 'Global brand with a wide UK presence. Shell V-Power premium range widely available.' },
  'Esso':         { desc: 'Strong motorway and urban presence across the UK. Synergy fuel range at most sites.' },
  'Texaco':       { desc: 'Independent forecourt brand with competitive pricing across England and Wales.' },
  'Gulf':         { desc: 'Growing independent brand known for competitive pricing at forecourts across the UK.' },
  'Jet':          { desc: 'Independent fuel brand with a focus on competitive forecourt pricing.' },
  'Murco':        { desc: 'Smaller regional brand with a strong presence in Wales and South West England.' },
  'Harvest Energy': { desc: 'Independent forecourt operator known for consistently competitive fuel prices.' },
  'Applegreen':   { desc: 'Irish fuel brand expanding across the UK with competitive motorway and urban pricing.' },
  'Certas Energy':{ desc: 'Commercial and retail fuel supplier with sites across the UK.' },
}

export default function BrandIndex({ brands, updatedAt }) {
  const cheapest = [...brands].sort((a, b) => (a.avg_petrol || 999) - (b.avg_petrol || 999))[0]
  const totalStations = brands.reduce((n, b) => n + (b.station_count || 0), 0)

  return (
    <>
      <Head>
        <title>UK Fuel Brand Price Comparison — BP, Shell, Esso & More Today</title>
        <meta name="description" content={`Compare fuel prices by brand across the UK today. Live averages for BP, Shell, Esso, Texaco, Gulf and more. ${totalStations.toLocaleString()} stations tracked, updated daily.`} />
        <link rel="canonical" href="https://fuelalerts.co.uk/brand" />
      </Head>

      <div className={indexStyles.page}>
        <nav className={indexStyles.nav}>
          <Link href="/" className={indexStyles.logo}>⛽ FuelAlerts</Link>
          <Link href="/" className={indexStyles.navBack}>← Home</Link>
        </nav>

        <div className={indexStyles.inner}>

          {/* Header */}
          <header className={indexStyles.header}>
            <div className={indexStyles.sectionLabel}>Fuel brands</div>
            <h1 className={indexStyles.title}>Fuel brand prices today</h1>
            <p className={indexStyles.sub}>
              Compare average petrol and diesel prices across major UK fuel brands.
              Live averages across {totalStations.toLocaleString()} forecourts, updated daily.
            </p>
            {cheapest && (
              <div className={indexStyles.cheapestBanner}>
                <span className={indexStyles.cheapestLabel}>Cheapest brand today</span>
                <span className={indexStyles.cheapestBrand}>{cheapest.brand_clean}</span>
                <span className={indexStyles.cheapestPrice}>{fmt(cheapest.avg_petrol)}</span>
                <span className={indexStyles.cheapestSub}>avg petrol</span>
              </div>
            )}
          </header>

          {/* Brand grid */}
          <div className={indexStyles.grid}>
            {brands.map((b, i) => {
              const info = BRAND_INFO[b.brand_clean] || {}
              return (
                <Link key={b.brand_clean} href={`/brand/${toSlug(b.brand_clean)}`} className={indexStyles.card}>
                  <div className={indexStyles.cardRank}>#{i + 1}</div>

                  <div className={indexStyles.cardTop}>
                    <div className={indexStyles.logoWrap}>
                      {b.logo_url
                        ? <img src={b.logo_url} alt={b.brand_clean} className={indexStyles.logoImg} onError={e => e.target.style.display='none'} />
                        : <span className={indexStyles.logoFallback}>{b.brand_clean.charAt(0)}</span>
                      }
                    </div>
                    <div className={indexStyles.cardName}>{b.brand_clean}</div>
                    {i === 0 && <span className={indexStyles.cheapestTag}>Cheapest</span>}
                  </div>

                  <div className={indexStyles.priceRow}>
                    <div className={indexStyles.priceBlock}>
                      <div className={indexStyles.priceLabel}>Petrol avg</div>
                      <div className={indexStyles.priceValue} style={{ color: i === 0 ? '#00e676' : '#f0f4ff' }}>
                        {fmt(b.avg_petrol)}
                      </div>
                    </div>
                    <div className={indexStyles.priceBlock}>
                      <div className={indexStyles.priceLabel}>Forecourts</div>
                      <div className={indexStyles.priceValue} style={{ color: '#f0f4ff' }}>
                        {b.station_count?.toLocaleString() || '—'}
                      </div>
                    </div>
                  </div>

                  {info.desc && (
                    <p className={indexStyles.cardDesc}>{info.desc}</p>
                  )}

                  <div className={indexStyles.cardLink}>
                    See all {b.brand_clean} prices →
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Comparison table */}
          <section className={indexStyles.compareSection}>
            <h2 className={indexStyles.compareTitle}>Side-by-side comparison</h2>
            <div className={indexStyles.tableWrap}>
              <table className={indexStyles.table}>
                <thead>
                  <tr>
                    <th className={indexStyles.th}>Brand</th>
                    <th className={indexStyles.th}>Petrol avg</th>
                    <th className={indexStyles.th}>Forecourts</th>
                    <th className={indexStyles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {brands.map((b, i) => (
                    <tr key={b.brand_clean} className={indexStyles.tr}>
                      <td className={indexStyles.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          {b.logo_url
                            ? <img src={b.logo_url} alt={b.brand_clean} style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'contain', background: '#fff', padding: 2 }} onError={e => e.target.style.display='none'} />
                            : <span style={{ width: 24, height: 24, borderRadius: 4, background: '#1e2d4a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 800, color: '#8899bb' }}>{b.brand_clean.charAt(0)}</span>
                          }
                          <span style={{ fontWeight: 600, color: '#f0f4ff' }}>{b.brand_clean}</span>
                        </div>
                      </td>
                      <td className={indexStyles.td} style={{ color: i === 0 ? '#00e676' : '#f0f4ff', fontWeight: 700 }}>
                        {fmt(b.avg_petrol)}
                      </td>
                      <td className={indexStyles.td} style={{ color: '#8899bb' }}>
                        {b.station_count?.toLocaleString() || '—'}
                      </td>
                      <td className={indexStyles.td}>
                        <Link href={`/brand/${toSlug(b.brand_clean)}`} className={indexStyles.tableLink}>
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* SEO copy */}
          <section className={indexStyles.seoSection}>
            <h2 className={indexStyles.seoTitle}>Which UK fuel brand is cheapest?</h2>
            <p className={indexStyles.seoCopy}>
              Fuel prices vary significantly between brands — sometimes by 10p or more per litre for the same grade.
              Independent brands like Gulf, Jet and Harvest Energy consistently undercut the major names,
              while BP, Shell and Esso charge a premium for their loyalty programmes and premium fuel ranges.
              Our data covers {totalStations.toLocaleString()} forecourts updated daily from official UK government sources,
              so the averages you see here reflect what drivers are actually paying today.
            </p>
            <p className={indexStyles.seoCopy}>
              The cheapest brand nationally isn't always the cheapest near you — local competition, motorway vs urban
              locations, and regional pricing all play a role. Use FuelAlerts to find the cheapest station within your
              chosen radius and get a weekly email when prices drop.
            </p>
          </section>

          {/* CTA */}
          <div className={indexStyles.ctaBanner}>
            <div className={indexStyles.ctaText}>
              <strong>Get alerts when prices drop near you</strong>
              <span>Free weekly email. No app required.</span>
            </div>
            <Link href="/#signup" className={indexStyles.ctaBtn}>
              Set up free alerts →
            </Link>
          </div>

        </div>
      </div>
    </>
  )
}

export async function getStaticProps() {
  const [{ data: petrolRows }, { data: dieselRows }] = await Promise.all([
    supabase.rpc('get_all_brand_averages', { p_fuel_type: 'E10', p_min_stations: 10 }),
    supabase.rpc('get_all_brand_averages', { p_fuel_type: 'B7', p_min_stations: 10 }),
  ])

  const dieselMap = {}
  for (const r of (dieselRows || [])) dieselMap[r.brand_clean] = r

  const brands = (petrolRows || []).map(r => ({
    brand_clean:   r.brand_clean,
    avg_petrol:    r.avg_price != null ? parseFloat(r.avg_price) : null,
    avg_diesel:    dieselMap[r.brand_clean]?.avg_price != null ? parseFloat(dieselMap[r.brand_clean].avg_price) : null,
    station_count: parseInt(r.station_count) || 0,
    logo_url:      r.logo_url || null,
  })).sort((a, b) => (a.avg_petrol || 999) - (b.avg_petrol || 999))

  const updatedAt = new Date().toISOString().split('T')[0]

  return {
    props: { brands, updatedAt },
    revalidate: 6 * 60 * 60,
  }
}
