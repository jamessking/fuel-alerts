import Head from 'next/head'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { getAllTowns, getTownData, toSlug, fromSlug } from '../../lib/fuel'
import ShareFuel from '../../components/ShareFuel'
import styles from '../../styles/TownPage.module.css'
import BrandLogo from '../../components/BrandLogo'

const fmt = p => p != null ? `${parseFloat(p).toFixed(1)}p` : '—'
const fmtDelta = d => d == null ? null : (d > 0 ? `+${d.toFixed(1)}p` : `${d.toFixed(1)}p`)
const tankSaving = (cheap, expensive) => cheap && expensive ? ((expensive - cheap) / 100 * 55).toFixed(2) : null

export default function TownPage({ data, slug }) {
  const [mapVisible, setMapVisible] = useState(true)
  if (!data) return (
    <div className={styles.notFound}>
      <h1>No price data found for this area</h1>
      <Link href="/">← Back to FuelAlerts</Link>
    </div>
  )

  const petrolDelta = data.avgPetrol && data.lastWeekAvgPetrol
    ? Math.round((data.avgPetrol - data.lastWeekAvgPetrol) * 10) / 10 : null
  const dieselDelta = data.avgDiesel && data.lastWeekAvgDiesel
    ? Math.round((data.avgDiesel - data.lastWeekAvgDiesel) * 10) / 10 : null

  const saving = tankSaving(data.cheapestPetrol?.price, data.mostExpensivePetrol?.price)
  const superVsIndependent = data.cheapestSupermarket && data.cheapestIndependent
    ? Math.round((data.cheapestIndependent.price - data.cheapestSupermarket.price) * 10) / 10 : null

  const title = `Cheapest Fuel in ${data.city} Today — Petrol & Diesel Prices`
  const description = `Live petrol and diesel prices for ${data.city}. Cheapest petrol: ${fmt(data.cheapestPetrol?.price)}, cheapest diesel: ${fmt(data.cheapestDiesel?.price)}. Updated daily from ${data.stationCount} stations.`

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <link rel="canonical" href={`https://fuelalert.co.uk/town/${slug}`} />
      </Head>

      <div className={styles.page}>
        <nav className={styles.nav}>
          <Link href="/" className={styles.logo}>⛽ FuelAlerts</Link>
          <div className={styles.breadcrumb}>
            {data.country && <><Link href={`/country/${toSlug(data.country)}`}>{data.country}</Link> › </>}
            {data.county && <><Link href={`/region/${toSlug(data.county)}`}>{data.county}</Link> › </>}
            <span>{data.city}</span>
          </div>
        </nav>

        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.pill}>⛽ Updated {data.updatedAt}</div>
            <h1>Cheapest fuel in <span className={styles.accent}>{data.city}</span> today</h1>
            <p className={styles.sub}>
              Tracking {data.stationCount} stations across {data.city}
              {data.county ? `, ${data.county}` : ''}.
              Prices updated daily from official government data.
            </p>
          </div>
        </header>

        <main className={styles.main}>

          {/* Map toggle + Leaflet map */}
          {data.mapStations && data.mapStations.length > 0 && (
            <section className={styles.mapSection}>
              <div className={styles.mapHeader}>
                <h2 className={styles.mapTitle}>Station map</h2>
                <button
                  className={styles.mapToggleBtn}
                  onClick={() => setMapVisible(v => !v)}
                >
                  {mapVisible ? 'Hide map' : 'Show map'}
                </button>
              </div>
              {mapVisible && (
                <TownMap stations={data.mapStations} city={data.city} />
              )}
            </section>
          )}

          {/* Price snapshot cards */}
          <section className={styles.snapshotGrid}>
            <div className={styles.snapshotCard}>
              <div className={styles.snapshotLabel}>⛽ Cheapest Petrol</div>
              <div className={styles.snapshotPrice}>{fmt(data.cheapestPetrol?.price)}</div>
              <div className={styles.snapshotStation}>{data.cheapestPetrol?.display_name}</div>
              {petrolDelta !== null && (
                <div className={petrolDelta > 0 ? styles.deltaUp : styles.deltaDown}>
                  {fmtDelta(petrolDelta)} vs last week
                </div>
              )}
            </div>

            <div className={styles.snapshotCard}>
              <div className={styles.snapshotLabel}>🛢 Cheapest Diesel</div>
              <div className={styles.snapshotPrice}>{fmt(data.cheapestDiesel?.price)}</div>
              <div className={styles.snapshotStation}>{data.cheapestDiesel?.display_name}</div>
              {dieselDelta !== null && (
                <div className={dieselDelta > 0 ? styles.deltaUp : styles.deltaDown}>
                  {fmtDelta(dieselDelta)} vs last week
                </div>
              )}
            </div>

            {data.cheapestSupermarket && (
              <div className={styles.snapshotCard}>
                <div className={styles.snapshotLabel}>🛒 Cheapest Supermarket</div>
                <div className={styles.snapshotPrice}>{fmt(data.cheapestSupermarket?.price)}</div>
                <div className={styles.snapshotStation}>{data.cheapestSupermarket?.display_name}</div>
              </div>
            )}

            {data.cheapestIndependent && (
              <div className={styles.snapshotCard}>
                <div className={styles.snapshotLabel}>🔧 Cheapest Independent</div>
                <div className={styles.snapshotPrice}>{fmt(data.cheapestIndependent?.price)}</div>
                <div className={styles.snapshotStation}>{data.cheapestIndependent?.display_name}</div>
              </div>
            )}
          </section>

          {/* Story: savings gap */}
          {saving && (
            <section className={styles.storyCard}>
              <h2>💰 How much can you save in {data.city}?</h2>
              <p>
                The gap between the cheapest and most expensive petrol station in {data.city} is{' '}
                <strong>{Math.round((data.mostExpensivePetrol.price - data.cheapestPetrol.price) * 10) / 10}p/litre</strong>.
                On a full 55-litre tank that's <strong>£{saving}</strong> — just by choosing where you fill up.
              </p>
              {superVsIndependent !== null && superVsIndependent > 0 && (
                <p>
                  Supermarkets are currently <strong>{superVsIndependent}p/litre cheaper</strong> than
                  independent forecourts in {data.city}.
                  {data.cheapestSupermarket && <> {data.cheapestSupermarket.display_name} leads at {fmt(data.cheapestSupermarket.price)}.</>}
                </p>
              )}
            </section>
          )}

          {/* Price chart */}
          {data.chartSeries && data.chartSeries.length > 1 && (
            <section className={styles.chartSection}>
              <h2>📈 Price trend — last {data.chartSeries.length} days</h2>
              <PriceChart series={data.chartSeries} />
            </section>
          )}

          {/* Top 5 table */}
          <section className={styles.top5Section}>
            <h2>Top 5 cheapest stations in {data.city}</h2>
            <div className={styles.stationList}>
              {data.top5.map((s, i) => (
                <div key={s.node_id} className={`${styles.stationRow} ${i === 0 ? styles.stationRowBest : ''}`}>
                  <div className={styles.stationRank}>{i === 0 ? '🏆' : `#${i + 1}`}</div>
                  <BrandLogo logoUrl={s.logo_url} brandName={s.display_name} size="sm" />
                  <div className={styles.stationInfo}>
                    <div className={styles.stationName}>{s.display_name}</div>
                    <div className={styles.stationMeta}>
                      {s.postcode && <span>{s.postcode}</span>}
                      <span className={styles.fuelBadge}>{s.fuel_type === 'E10' ? 'Petrol' : 'Diesel'}</span>
                      {s.is_supermarket_service_station && <span className={styles.superBadge}>Supermarket</span>}
                    </div>
                  </div>
                  <div className={styles.stationPrice}>{fmt(s.price)}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Share */}
          <section className={styles.shareSection}>
            <ShareFuel
              stationName={data.cheapestPetrol?.display_name}
              price={data.cheapestPetrol?.price}
              fuelLabel="petrol"
              postcode={data.city}
            />
          </section>

          {/* Sign up CTA */}
          <section className={styles.ctaSection}>
            <div className={styles.ctaCard}>
              <h2>Get the cheapest {data.city} fuel prices in your inbox every Monday</h2>
              <p>Free weekly digest. No app. Unsubscribe anytime.</p>
              <a href={`/?postcode=${encodeURIComponent(data.city)}`} className={styles.ctaBtn}>
                Get my FuelAlerts — free →
              </a>
            </div>
          </section>

          {/* Internal links */}
          <section className={styles.internalLinks}>
            <h3>Explore nearby</h3>
            <div className={styles.linkGrid}>
              {data.county && (
                <Link href={`/region/${toSlug(data.county)}`} className={styles.internalLink}>
                  📍 Fuel prices in {data.county}
                </Link>
              )}
              {data.country && (
                <Link href={`/country/${toSlug(data.country)}`} className={styles.internalLink}>
                  🇬🇧 {data.country} fuel prices
                </Link>
              )}
              <Link href="/" className={styles.internalLink}>
                ⛽ FuelAlerts home
              </Link>
            </div>
          </section>

        </main>
      </div>
    </>
  )
}

// ── Leaflet map — loaded dynamically (SSR-safe) ──────────────────────────────
function TownMap({ stations, city }) {
  const mapRef    = useRef(null)
  const leafletRef = useRef(null)

  useEffect(() => {
    if (leafletRef.current) return // already initialised

    // Dynamically load Leaflet CSS + JS (no npm install needed)
    const link = document.createElement('link')
    link.rel  = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => {
      const L = window.L
      if (!mapRef.current || leafletRef.current) return

      // Find centre — average of all station coords
      const validStations = stations.filter(s => s.lat && s.lon)
      if (validStations.length === 0) return

      const avgLat = validStations.reduce((s, st) => s + st.lat, 0) / validStations.length
      const avgLon = validStations.reduce((s, st) => s + st.lon, 0) / validStations.length

      const map = L.map(mapRef.current, { zoomControl: true }).setView([avgLat, avgLon], 13)
      leafletRef.current = map

      // Dark-compatible OSM tile layer (free, no API key)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }).addTo(map)

      // Sort by price to find cheapest
      const sorted = [...validStations].sort((a, b) => a.price - b.price)
      const cheapestId = sorted[0]?.node_id

      validStations.forEach(st => {
        const isCheapest = st.node_id === cheapestId
        const colour     = isCheapest ? '#00e676' : '#8899bb'
        const size       = isCheapest ? 14 : 10
        const priceLabel = st.price ? `${parseFloat(st.price).toFixed(1)}p` : '—'
        const fuelLabel  = st.fuel_type === 'E10' ? 'Petrol' : 'Diesel'
        const mapsUrl    = `https://www.google.com/maps?q=${st.lat},${st.lon}`
        const updatedAt  = st.price_last_updated
          ? new Date(st.price_last_updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : null
        const changeHtml = st.price_change_ppl != null
          ? `<div style="margin-top:4px;font-size:11px;color:${st.price_change_ppl < 0 ? '#00e676' : '#ff6b4a'};">
              ${st.price_change_ppl < 0 ? '▼' : '▲'} ${Math.abs(st.price_change_ppl).toFixed(1)}p vs yesterday
             </div>`
          : ''

        const icon = L.divIcon({
          className: '',
          html: `<div style="
            width:${size}px;height:${size}px;border-radius:50%;
            background:${colour};border:2px solid #0a0f1e;
            box-shadow:0 0 ${isCheapest ? '8px' : '4px'} ${colour}88;
          "></div>`,
          iconSize: [size, size],
          iconAnchor: [size/2, size/2],
        })

        const marker = L.marker([st.lat, st.lon], { icon })
        marker.bindPopup(`
          <div style="font-family:Arial,sans-serif;min-width:180px;background:#111827;color:#f0f4ff;border-radius:10px;overflow:hidden;margin:-14px -20px;">
            ${isCheapest ? '<div style="background:#00e676;color:#0a0f1e;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;padding:5px 12px;">Cheapest nearby</div>' : ''}
            <div style="padding:12px 14px;">
              <div style="font-size:14px;font-weight:800;color:#f0f4ff;margin-bottom:2px;">${st.display_name || st.brand_clean || 'Station'}</div>
              ${st.postcode ? `<div style="font-size:11px;color:#8899bb;margin-bottom:8px;">${st.postcode}</div>` : ''}
              <div style="font-size:22px;font-weight:900;color:${colour};letter-spacing:-1px;line-height:1;">${priceLabel}</div>
              <div style="font-size:10px;color:#4a5a7a;margin-top:2px;">${fuelLabel}</div>
              ${changeHtml}
              ${updatedAt ? `<div style="font-size:10px;color:#4a5a7a;margin-top:6px;">Updated ${updatedAt}</div>` : ''}
              <a href="${mapsUrl}" target="_blank" rel="noopener"
                 style="display:inline-block;margin-top:10px;background:${colour};color:#0a0f1e;
                        font-size:12px;font-weight:800;padding:6px 12px;border-radius:6px;text-decoration:none;">
                Get directions
              </a>
            </div>
          </div>
        `, {
          className: 'fuelalerts-popup',
          maxWidth: 220,
        })
        marker.addTo(map)
      })

      // Auto-fit bounds
      const bounds = L.latLngBounds(validStations.map(s => [s.lat, s.lon]))
      map.fitBounds(bounds, { padding: [30, 30] })
    }
    document.head.appendChild(script)

    return () => {
      if (leafletRef.current) {
        leafletRef.current.remove()
        leafletRef.current = null
      }
    }
  }, [stations])

  return (
    <>
      <style>{`
        .fuelalerts-popup .leaflet-popup-content-wrapper {
          background: #111827 !important;
          border: 1px solid #1e2d4a !important;
          border-radius: 10px !important;
          padding: 0 !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
        }
        .fuelalerts-popup .leaflet-popup-tip {
          background: #111827 !important;
        }
        .fuelalerts-popup .leaflet-popup-content {
          margin: 0 !important;
        }
        .leaflet-container {
          background: #0a0f1e !important;
        }
      `}</style>
      <div ref={mapRef} style={{ height: '400px', width: '100%', borderRadius: '14px', overflow: 'hidden', border: '1px solid #1e2d4a' }} />
    </>
  )
}

// Simple SVG price chart — no external lib needed
function PriceChart({ series }) {
  const w = 600, h = 140, pad = { top: 10, right: 10, bottom: 30, left: 36 }
  const iw = w - pad.left - pad.right
  const ih = h - pad.top - pad.bottom

  const allVals = series.flatMap(d => [d.petrol, d.diesel].filter(Boolean))
  const minV = Math.floor(Math.min(...allVals) - 1)
  const maxV = Math.ceil(Math.max(...allVals) + 1)

  const xScale = i => pad.left + (i / (series.length - 1)) * iw
  const yScale = v => pad.top + ih - ((v - minV) / (maxV - minV)) * ih

  const pathFor = key => {
    const pts = series.map((d, i) => d[key] != null ? `${xScale(i)},${yScale(d[key])}` : null).filter(Boolean)
    if (pts.length < 2) return null
    return 'M ' + pts.join(' L ')
  }

  // X axis labels — show ~5 evenly spaced dates
  const labelIdxs = [0, Math.floor(series.length / 4), Math.floor(series.length / 2), Math.floor(series.length * 3 / 4), series.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i)

  return (
    <div className={styles.chartWrap}>
      <svg viewBox={`0 0 ${w} ${h}`} className={styles.chart}>
        {/* Y axis ticks */}
        {[minV, Math.round((minV + maxV) / 2), maxV].map(v => (
          <g key={v}>
            <line x1={pad.left} x2={w - pad.right} y1={yScale(v)} y2={yScale(v)} stroke="#1e2d4a" strokeWidth="1" />
            <text x={pad.left - 4} y={yScale(v) + 4} textAnchor="end" fontSize="9" fill="#4a5a7a">{v}p</text>
          </g>
        ))}
        {/* X axis date labels */}
        {labelIdxs.map(i => (
          <text key={i} x={xScale(i)} y={h - 4} textAnchor="middle" fontSize="9" fill="#4a5a7a">
            {series[i].date.slice(5)}
          </text>
        ))}
        {/* Petrol line */}
        {pathFor('petrol') && <path d={pathFor('petrol')} fill="none" stroke="#00e676" strokeWidth="2" strokeLinejoin="round" />}
        {/* Diesel line */}
        {pathFor('diesel') && <path d={pathFor('diesel')} fill="none" stroke="#64b4ff" strokeWidth="2" strokeLinejoin="round" />}
      </svg>
      <div className={styles.chartLegend}>
        <span className={styles.legendPetrol}>— Petrol (E10)</span>
        <span className={styles.legendDiesel}>— Diesel</span>
      </div>
    </div>
  )
}

export async function getStaticPaths() {
  const towns = await getAllTowns()

  // Only prebuild top 50–100 by station count
  const topTowns = towns
    .sort((a, b) => b.count - a.count)
    .slice(0, 100)

  return {
    paths: topTowns.map(t => ({ params: { slug: t.slug } })),
    fallback: 'blocking',
  }
}

export async function getStaticProps({ params }) {
	console.log("REGENERATING:", params.slug)
  const { slug } = params
  const cityName = fromSlug(slug)

  // Try exact match first, then fuzzy
  let data = await getTownData(cityName)

  // If no data, try finding actual city name from DB
  if (!data) {
    const towns = await getAllTowns()
    const match = towns.find(t => t.slug === slug)
    if (match) data = await getTownData(match.city)
  }

  if (!data) {
  return {
    props: {
      data: {
        city: cityName,
        stationCount: 0,
        updatedAt: null,
        top5: [],
        cheapestDiesel: null,
        cheapestPetrol: null,
      },
      slug,
    },
    revalidate: 1,
  }
}

  return {
    props: { data, slug },
    revalidate: 6 * 60 * 60,
  }
}
