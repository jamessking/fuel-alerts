import Head from 'next/head'
import Link from 'next/link'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import styles from '../../styles/BrandPage.module.css'

const fmt = p => p != null ? `${parseFloat(p).toFixed(1)}p` : '—'
const toSlug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const SUPERMARKETS = ['Tesco', 'Asda', "Sainsbury's", 'Morrisons', 'Co-op', 'Costco']

export default function SupermarketPage({ brand, stats, trend, slug }) {
  const [fuel, setFuel] = useState('E10')
  const [email, setEmail] = useState('')
  const [postcode, setPostcode] = useState('')
  const [locating, setLocating] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  if (!stats || stats.length === 0) return (
    <div style={{ padding: '4rem', textAlign: 'center', color: '#8899bb' }}>
      <h1>No data found for {brand}</h1>
      <Link href="/" style={{ color: '#00e676' }}>← Back to FuelAlerts</Link>
    </div>
  )

  const avg      = stats.reduce((s, r) => s + parseFloat(r.price), 0) / stats.length
  const cheapest = stats[0]
  const stationCount = stats.length
  const logoUrl  = stats.find(s => s.logo_url)?.logo_url || null
  const isCostco = brand.toLowerCase() === 'costco'

  const byRegion = {}
  for (const s of stats) {
    if (!s.region) continue
    if (!byRegion[s.region]) byRegion[s.region] = []
    byRegion[s.region].push(parseFloat(s.price))
  }
  const regionRows = Object.entries(byRegion)
    .map(([region, prices]) => ({
      region,
      avg: prices.reduce((a, b) => a + b, 0) / prices.length,
      count: prices.length,
    }))
    .sort((a, b) => a.avg - b.avg)

  const fuelLabel = fuel === 'E10' ? 'Petrol' : 'Diesel'
  const title = `${brand} Fuel Prices UK — ${fmt(Math.round(avg * 10) / 10)} average today`
  const description = `Live ${brand} fuel prices across ${stationCount} UK forecourts. Cheapest ${brand} ${fuelLabel.toLowerCase()} today: ${fmt(cheapest?.price)}.`

  function getLocation() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const { latitude, longitude } = pos.coords
        const r = await fetch(`https://api.postcodes.io/postcodes?lon=${longitude}&lat=${latitude}&limit=1`)
        const d = await r.json()
        if (d.result?.[0]?.postcode) setPostcode(d.result[0].postcode)
      } catch {}
      setLocating(false)
    }, () => setLocating(false))
  }

  async function handleSignup(e) {
    e.preventDefault()
    if (!email || !postcode) return
    await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, postcode, fuel_type: fuel }),
    })
    setSubmitted(true)
  }

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <link rel="canonical" href={`https://fuelalerts.co.uk/supermarket/${slug}`} />
      </Head>

      <div className={styles.page}>
        <nav className={styles.nav}>
          <Link href="/" className={styles.logo}>⛽ FuelAlerts</Link>
          <Link href="/" className={styles.navBack}>← All supermarkets</Link>
        </nav>

        <div className={styles.layout}>
          <main className={styles.main}>

            <header className={styles.header}>
              <div className={styles.headerTop}>
                {logoUrl && (
                  <div className={styles.brandLogoWrap}>
                    <img src={logoUrl} alt={brand} className={styles.brandLogo} />
                  </div>
                )}
                <div>
                  <div className={styles.sectionLabel}>Supermarket fuel</div>
                  <h1 className={styles.title}>
                    {brand}
                    {isCostco && (
                      <span className={styles.membersOnlyBadge}>Members only</span>
                    )}
                  </h1>
                  <p className={styles.sub}>{stationCount} forecourts reporting prices today</p>
                  {isCostco && (
                    <p className={styles.costcoNote}>
                      Costco fuel is available to Costco members only. Membership starts from £33.60/year.
                      Prices are typically among the lowest in the UK.
                    </p>
                  )}
                </div>
              </div>

              <div className={styles.fuelToggle}>
                {['E10', 'B7'].map(f => (
                  <button key={f} className={`${styles.fuelBtn} ${fuel === f ? styles.fuelBtnActive : ''}`}
                    onClick={() => setFuel(f)}>
                    {f === 'E10' ? 'Petrol (E10)' : 'Diesel (B7)'}
                  </button>
                ))}
              </div>
            </header>

            <div className={styles.statsStrip}>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>National average</div>
                <div className={styles.statValue}>{fmt(Math.round(avg * 10) / 10)}</div>
                <div className={styles.statSub}>{fuelLabel}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Cheapest forecourt</div>
                <div className={styles.statValue} style={{ color: '#00e676' }}>{fmt(cheapest?.price)}</div>
                <div className={styles.statSub}>{cheapest?.postcode || '—'}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Most expensive</div>
                <div className={styles.statValue} style={{ color: '#ff6b4a' }}>{fmt(stats[stats.length - 1]?.price)}</div>
                <div className={styles.statSub}>{stats[stats.length - 1]?.postcode || '—'}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Forecourts tracked</div>
                <div className={styles.statValue}>{stationCount}</div>
                <div className={styles.statSub}>UK-wide</div>
              </div>
            </div>

            {trend && trend.length > 1 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>30-day price trend</h2>
                <BrandTrendChart trend={trend} />
              </section>
            )}

            {regionRows.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Average price by region</h2>
                <div className={styles.regionList}>
                  {regionRows.map(r => (
                    <div key={r.region} className={styles.regionRow}>
                      <div className={styles.regionName}>{r.region}</div>
                      <div className={styles.regionCount}>{r.count} forecourts</div>
                      <div className={styles.regionBar}>
                        <div className={styles.regionBarFill}
                          style={{ width: `${Math.min(100, ((r.avg - regionRows[regionRows.length-1].avg) / Math.max(regionRows[0].avg - regionRows[regionRows.length-1].avg, 1)) * 100)}%` }} />
                      </div>
                      <div className={styles.regionPrice}>{fmt(Math.round(r.avg * 10) / 10)}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>10 cheapest {brand} forecourts today</h2>
              <div className={styles.stationList}>
                {stats.slice(0, 10).map((s, i) => {
                  const mapsUrl = s.latitude && s.longitude
                    ? `https://www.google.com/maps?q=${s.latitude},${s.longitude}`
                    : `https://www.google.com/maps?q=${encodeURIComponent((s.trading_name || brand) + ' ' + (s.postcode || ''))}`
                  return (
                    <div key={s.node_id} className={`${styles.stationRow} ${i === 0 ? styles.stationRowBest : ''}`}>
                      <div className={styles.stationRank}>
                        {i === 0 ? <span className={styles.crownBadge}>Cheapest</span> : `#${i + 1}`}
                      </div>
                      <div className={styles.stationInfo}>
                        <div className={styles.stationName}>{s.trading_name || brand}</div>
                        <div className={styles.stationMeta}>
                          {s.postcode && <span>{s.postcode}</span>}
                          {s.region && <span>{s.region}</span>}
                        </div>
                      </div>
                      <div className={styles.stationRight}>
                        <div className={styles.stationPrice} style={{ color: i === 0 ? '#00e676' : '#f0f4ff' }}>
                          {fmt(s.price)}
                        </div>
                        <a href={mapsUrl} target="_blank" rel="noopener" className={styles.directionsLink}>
                          Directions
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

          </main>

          <aside className={styles.sidebar}>
            <div className={styles.signupCard}>
              {submitted ? (
                <div className={styles.successState}>
                  <div className={styles.successIcon}>✓</div>
                  <h3>You&apos;re in</h3>
                  <p>Weekly fuel prices near you, every Monday.</p>
                </div>
              ) : (
                <>
                  <div className={styles.signupHeader}>
                    <h2>Find the cheapest {brand} near you</h2>
                    <p>Weekly digest delivered to your inbox — free.</p>
                  </div>
                  <form className={styles.signupForm} onSubmit={handleSignup}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Your postcode</label>
                      <div className={styles.postcodeRow}>
                        <input
                          className={styles.input}
                          type="text"
                          placeholder="e.g. AB41 8AR"
                          value={postcode}
                          onChange={e => setPostcode(e.target.value.toUpperCase())}
                        />
                        <button type="button" className={styles.locateBtn} onClick={getLocation} disabled={locating}>
                          {locating ? '...' : '⌖'}
                        </button>
                      </div>
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Email address</label>
                      <input
                        className={styles.input}
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Fuel type</label>
                      <div className={styles.fuelBtns}>
                        {['E10', 'B7'].map(f => (
                          <button key={f} type="button"
                            className={`${styles.fuelOptBtn} ${fuel === f ? styles.fuelOptBtnActive : ''}`}
                            onClick={() => setFuel(f)}>
                            {f === 'E10' ? 'Petrol' : 'Diesel'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button type="submit" className={styles.submitBtn} disabled={!email || !postcode}>
                      Get free alerts →
                    </button>
                    <p className={styles.signupFootnote}>No spam. Unsubscribe anytime.</p>
                  </form>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  )
}

function BrandTrendChart({ trend }) {
  const w = 600, h = 120, pad = { top: 8, right: 8, bottom: 28, left: 36 }
  const iw = w - pad.left - pad.right
  const ih = h - pad.top - pad.bottom
  const prices = trend.map(d => parseFloat(d.avg_price))
  const minV = Math.floor(Math.min(...prices) - 1)
  const maxV = Math.ceil(Math.max(...prices) + 1)
  const xScale = i => pad.left + (i / (trend.length - 1)) * iw
  const yScale = v => pad.top + ih - ((v - minV) / (maxV - minV)) * ih
  const path = 'M ' + trend.map((d, i) => `${xScale(i)},${yScale(parseFloat(d.avg_price))}`).join(' L ')
  const labelIdxs = [0, Math.floor(trend.length / 2), trend.length - 1]

  return (
    <div className={styles.chartWrap}>
      <svg viewBox={`0 0 600 120`} className={styles.chart}>
        {[minV, Math.round((minV + maxV) / 2), maxV].map(v => (
          <g key={v}>
            <line x1={pad.left} x2={w - pad.right} y1={yScale(v)} y2={yScale(v)} stroke="#1e2d4a" strokeWidth="1" />
            <text x={pad.left - 4} y={yScale(v) + 4} textAnchor="end" fontSize="9" fill="#4a5a7a">{v}p</text>
          </g>
        ))}
        {labelIdxs.map(i => (
          <text key={i} x={xScale(i)} y={h - 4} textAnchor="middle" fontSize="9" fill="#4a5a7a">
            {trend[i].snapshot_date.slice(5)}
          </text>
        ))}
        <path d={path} fill="none" stroke="#00e676" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export async function getStaticPaths() {
  return {
    paths: SUPERMARKETS.map(b => ({ params: { slug: toSlug(b) } })),
    fallback: 'blocking',
  }
}

export async function getStaticProps({ params }) {
  const { slug } = params
  const brand = SUPERMARKETS.find(b => toSlug(b) === slug)
  if (!brand) return { notFound: true }

  const [{ data: stats }, { data: trend }] = await Promise.all([
    supabase.rpc('get_supermarket_brand_stats', { p_brand: brand, p_fuel_type: 'E10' }),
    supabase.rpc('get_brand_price_trend', { p_brand: brand, p_fuel_type: 'E10', p_days: 30 }),
  ])

  return {
    props: { brand, stats: stats || [], trend: trend || [], slug },
    revalidate: 6 * 60 * 60,
  }
}
