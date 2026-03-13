import Head from 'next/head'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import styles from '../../styles/BrandPage.module.css'

const fmt = p => p != null ? `${parseFloat(p).toFixed(1)}p` : '—'
const toSlug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
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

  const avg     = stats.reduce((s, r) => s + parseFloat(r.price), 0) / stats.length
  const cheapest = stats[0]
  const stationCount = stats.length
  const logoUrl = stats.find(s => s.logo_url)?.logo_url || null

  // Regional breakdown using county
  const byRegion = {}
  for (const s of stats) {
    const key = s.county || s.country || 'Other'
    if (!byRegion[key]) byRegion[key] = []
    byRegion[key].push(parseFloat(s.price))
  }
  const regionRows = Object.entries(byRegion)
    .map(([county, prices]) => ({
      county,
      avg: prices.reduce((a, b) => a + b, 0) / prices.length,
      count: prices.length,
    }))
    .sort((a, b) => a.avg - b.avg)

  const fuelLabel = fuel === 'E10' ? 'Petrol' : 'Diesel'
  const title = `${brand} Fuel Prices UK — ${fmt(Math.round(avg * 10) / 10)} average today`
  const description = `Live ${brand} fuel prices across ${stationCount} UK stations. Cheapest ${brand} petrol today: ${fmt(cheapest?.price)}. Regional breakdown and price trends.`

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
        <link rel="canonical" href={`https://fuelalerts.co.uk/brand/${slug}`} />
      </Head>

      <div className={styles.page}>
        <nav className={styles.nav}>
          <Link href="/" className={styles.logo}>⛽ FuelAlerts</Link>
          <Link href="/" className={styles.navBack}>← All brands</Link>
        </nav>

        <div className={styles.layout}>
          <main className={styles.main}>

            {/* Header */}
            <header className={styles.header}>
              <div className={styles.headerTop}>
                {logoUrl && (
                  <div className={styles.brandLogoWrap}>
                    <img src={logoUrl} alt={brand} className={styles.brandLogo} />
                  </div>
                )}
                <div>
                  <div className={styles.sectionLabel}>Fuel brand</div>
                  <h1 className={styles.title}>{brand}</h1>
                  <p className={styles.sub}>{stationCount} stations reporting prices across the UK today</p>
                </div>
              </div>

              {/* Fuel toggle */}
              <div className={styles.fuelToggle}>
                {['E10', 'B7'].map(f => (
                  <button key={f} className={`${styles.fuelBtn} ${fuel === f ? styles.fuelBtnActive : ''}`}
                    onClick={() => setFuel(f)}>
                    {f === 'E10' ? 'Petrol (E10)' : 'Diesel (B7)'}
                  </button>
                ))}
              </div>
            </header>

            {/* Stats strip */}
            <div className={styles.statsStrip}>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>National average</div>
                <div className={styles.statValue}>{fmt(Math.round(avg * 10) / 10)}</div>
                <div className={styles.statSub}>{fuelLabel}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Cheapest station</div>
                <div className={styles.statValue} style={{ color: '#00e676' }}>{fmt(cheapest?.price)}</div>
                <div className={styles.statSub}>{cheapest?.postcode || '—'}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Most expensive</div>
                <div className={styles.statValue} style={{ color: '#ff6b4a' }}>{fmt(stats[stats.length - 1]?.price)}</div>
                <div className={styles.statSub}>{stats[stats.length - 1]?.postcode || '—'}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Stations tracked</div>
                <div className={styles.statValue}>{stationCount}</div>
                <div className={styles.statSub}>UK-wide</div>
              </div>
            </div>

            {/* Price trend chart */}
            {trend && trend.length > 1 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>30-day price trend</h2>
                <BrandTrendChart trend={trend} />
              </section>
            )}

            {/* Regional breakdown */}
            {regionRows.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Average price by region</h2>
                <div className={styles.regionList}>
                  {regionRows.map(r => (
                    <a key={r.county} href={`/region/${toSlug(r.county)}`} className={styles.regionRowLink}>
                      <div className={styles.regionRow}>
                        <div className={styles.regionName}>{r.county}</div>
                        <div className={styles.regionCount}>{r.count} stations</div>
                        <div className={styles.regionBar}>
                          <div className={styles.regionBarFill}
                            style={{ width: `${Math.min(100, ((r.avg - regionRows[regionRows.length-1].avg) / Math.max(regionRows[0].avg - regionRows[regionRows.length-1].avg, 1)) * 100)}%` }} />
                        </div>
                        <div className={styles.regionPrice}>{fmt(Math.round(r.avg * 10) / 10)}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* Cheapest 10 stations */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>10 cheapest {brand} stations today</h2>
              <div className={styles.stationList}>
                {stats.slice(0, 10).map((s, i) => {
                  const mapsUrl = s.latitude && s.longitude
                    ? `https://www.google.com/maps?q=${s.latitude},${s.longitude}`
                    : `https://www.google.com/maps?q=${encodeURIComponent((s.trading_name || brand) + ' ' + (s.postcode || ''))}`
                  const townUrl = s.city ? `/town/${toSlug(s.city)}` : null
                  return (
                    <div key={s.node_id} className={`${styles.stationRow} ${i === 0 ? styles.stationRowBest : ''}`}>
                      <div className={styles.stationRank}>
                        {i === 0 ? <span className={styles.crownBadge}>Cheapest</span> : `#${i + 1}`}
                      </div>
                      <div className={styles.stationInfo}>
                        <div className={styles.stationName}>{s.trading_name || brand}</div>
                        <div className={styles.stationMeta}>
                          {s.postcode && <span>{s.postcode}</span>}
                          {s.city && townUrl
                            ? <a href={townUrl} className={styles.townLink}>{s.city}</a>
                            : s.county && <span>{s.county}</span>
                          }
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

          {/* Sticky signup sidebar */}
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
                    <h2>Get {brand} prices near you</h2>
                    <p>Weekly digest of the cheapest stations near your postcode — free.</p>
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
      <svg viewBox={`0 0 ${w} ${h}`} className={styles.chart}>
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
  const { data } = await supabase.rpc('get_all_brand_averages', { p_fuel_type: 'E10', p_min_stations: 5 })
  const brands = (data || []).filter(b => b.brand_clean)
  return {
    paths: brands.map(b => ({ params: { slug: toSlug(b.brand_clean) } })),
    fallback: 'blocking',
  }
}

export async function getStaticProps({ params }) {
  const { slug } = params

  // Find brand name from slug
  const { data: allBrands } = await supabase.rpc('get_all_brand_averages', { p_fuel_type: 'E10', p_min_stations: 1 })
  const match = (allBrands || []).find(b => toSlug(b.brand_clean) === slug)
  if (!match) return { notFound: true }

  const brand = match.brand_clean

  const [{ data: stats }, { data: trend }] = await Promise.all([
    supabase.rpc('get_brand_stats', { p_brand: brand, p_fuel_type: 'E10' }),
    supabase.rpc('get_brand_price_trend', { p_brand: brand, p_fuel_type: 'E10', p_days: 30 }),
  ])

  return {
    props: { brand, stats: stats || [], trend: trend || [], slug },
    revalidate: 6 * 60 * 60,
  }
}
