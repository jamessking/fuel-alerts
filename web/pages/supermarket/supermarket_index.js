import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import styles from '../styles/BrandPage.module.css'
import indexStyles from '../styles/SupermarketIndex.module.css'

const fmt = p => p != null ? `${parseFloat(p).toFixed(1)}p` : '—'
const toSlug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const SUPERMARKET_INFO = {
  'Tesco':        { desc: 'The UK\'s largest supermarket chain with forecourts nationwide. Known for Clubcard Prices discounts on fuel.', stations: null },
  'Asda':         { desc: 'Consistently among the cheapest supermarket fuel in the UK. No loyalty scheme but prices often lead the market.', stations: null },
  "Sainsbury's":  { desc: 'Nectar points on every litre. Strong presence in England with competitive pricing.', stations: null },
  'Morrisons':    { desc: 'More Card rewards on fuel. Good value in the North of England and Yorkshire.', stations: null },
  'Co-op':        { desc: 'Community-focused brand with a smaller forecourt network. Prices typically competitive with independents.', stations: null },
  'Costco':       { desc: 'Members-only fuel — but typically the cheapest in the UK by a significant margin. Membership from £33.60/yr.', stations: null, membersOnly: true },
}

export default function SupermarketIndex({ supermarkets, updatedAt }) {
  const main = supermarkets.filter(s => s.brand !== 'Costco')
  const costco = supermarkets.find(s => s.brand === 'Costco')
  const cheapest = [...main].sort((a, b) => (a.avg_petrol || 999) - (b.avg_petrol || 999))[0]

  return (
    <>
      <Head>
        <title>Supermarket Fuel Prices UK — Tesco, Asda, Sainsbury's, Morrisons Today</title>
        <meta name="description" content={`Compare supermarket fuel prices across the UK today. Live averages for Tesco, Asda, Sainsbury's, Morrisons, Co-op and Costco. Updated ${updatedAt}.`} />
        <link rel="canonical" href="https://fuelalerts.co.uk/supermarket" />
      </Head>

      <div className={indexStyles.page}>
        <nav className={indexStyles.nav}>
          <Link href="/" className={indexStyles.logo}>⛽ FuelAlerts</Link>
          <Link href="/" className={indexStyles.navBack}>← Home</Link>
        </nav>

        <div className={indexStyles.inner}>

          {/* Header */}
          <header className={indexStyles.header}>
            <div className={indexStyles.sectionLabel}>Supermarket fuel</div>
            <h1 className={indexStyles.title}>Supermarket fuel prices today</h1>
            <p className={indexStyles.sub}>
              Supermarkets are consistently the cheapest place to fill up in the UK.
              Live averages across all {supermarkets.reduce((n, s) => n + (s.station_count || 0), 0)} forecourts, updated daily.
            </p>
            {cheapest && (
              <div className={indexStyles.cheapestBanner}>
                <span className={indexStyles.cheapestLabel}>Cheapest this week</span>
                <span className={indexStyles.cheapestBrand}>{cheapest.brand}</span>
                <span className={indexStyles.cheapestPrice}>{fmt(cheapest.avg_petrol)}</span>
                <span className={indexStyles.cheapestSub}>avg petrol</span>
              </div>
            )}
          </header>

          {/* Main grid */}
          <div className={indexStyles.grid}>
            {main.map((s, i) => {
              const info = SUPERMARKET_INFO[s.brand] || {}
              return (
                <Link key={s.brand} href={`/supermarket/${toSlug(s.brand)}`} className={indexStyles.card}>
                  <div className={indexStyles.cardRank}>#{i + 1}</div>

                  <div className={indexStyles.cardTop}>
                    <div className={indexStyles.logoWrap}>
                      {s.logo_url
                        ? <img src={s.logo_url} alt={s.brand} className={indexStyles.logoImg} onError={e => e.target.style.display='none'} />
                        : <span className={indexStyles.logoFallback}>{s.brand.charAt(0)}</span>
                      }
                    </div>
                    <div className={indexStyles.cardName}>{s.brand}</div>
                    {i === 0 && <span className={indexStyles.cheapestTag}>Cheapest</span>}
                  </div>

                  <div className={indexStyles.priceRow}>
                    <div className={indexStyles.priceBlock}>
                      <div className={indexStyles.priceLabel}>Petrol avg</div>
                      <div className={indexStyles.priceValue} style={{ color: i === 0 ? '#00e676' : '#f0f4ff' }}>
                        {fmt(s.avg_petrol)}
                      </div>
                    </div>
                    {s.avg_diesel && (
                      <div className={indexStyles.priceBlock}>
                        <div className={indexStyles.priceLabel}>Diesel avg</div>
                        <div className={indexStyles.priceValue} style={{ color: '#64b4ff' }}>
                          {fmt(s.avg_diesel)}
                        </div>
                      </div>
                    )}
                    <div className={indexStyles.priceBlock}>
                      <div className={indexStyles.priceLabel}>Forecourts</div>
                      <div className={indexStyles.priceValueSm}>{s.station_count || '—'}</div>
                    </div>
                  </div>

                  {info.desc && <p className={indexStyles.cardDesc}>{info.desc}</p>}

                  <div className={indexStyles.cardCta}>See all {s.brand} prices →</div>
                </Link>
              )
            })}
          </div>

          {/* Costco callout */}
          {costco && (
            <Link href="/supermarket/costco" className={indexStyles.costcoCard}>
              <div className={indexStyles.costcoLeft}>
                <div className={indexStyles.logoWrap} style={{ width: 52, height: 52 }}>
                  {costco.logo_url
                    ? <img src={costco.logo_url} alt="Costco" className={indexStyles.logoImg} onError={e => e.target.style.display='none'} />
                    : <span className={indexStyles.logoFallback}>C</span>
                  }
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
                    <span className={indexStyles.costcoName}>Costco</span>
                    <span className={indexStyles.membersOnlyBadge}>Members only</span>
                  </div>
                  <p className={indexStyles.costcoDesc}>{SUPERMARKET_INFO['Costco'].desc}</p>
                </div>
              </div>
              <div className={indexStyles.costcoRight}>
                <div className={indexStyles.priceBlock}>
                  <div className={indexStyles.priceLabel}>Petrol avg</div>
                  <div className={indexStyles.priceValue} style={{ color: '#00e676' }}>{fmt(costco.avg_petrol)}</div>
                </div>
                {costco.avg_diesel && (
                  <div className={indexStyles.priceBlock}>
                    <div className={indexStyles.priceLabel}>Diesel avg</div>
                    <div className={indexStyles.priceValue} style={{ color: '#64b4ff' }}>{fmt(costco.avg_diesel)}</div>
                  </div>
                )}
                <div className={indexStyles.costcoCta}>See Costco prices →</div>
              </div>
            </Link>
          )}

          {/* Comparison table */}
          <section className={indexStyles.compareSection}>
            <h2 className={indexStyles.sectionTitle}>Side-by-side comparison</h2>
            <div className={indexStyles.tableWrap}>
              <table className={indexStyles.table}>
                <thead>
                  <tr>
                    <th>Supermarket</th>
                    <th>Petrol avg</th>
                    <th>Diesel avg</th>
                    <th>Forecourts</th>
                    <th>Loyalty</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {supermarkets.map((s, i) => (
                    <tr key={s.brand} className={i === 0 && s.brand !== 'Costco' ? indexStyles.trBest : ''}>
                      <td>
                        <div className={indexStyles.tdBrand}>
                          {s.logo_url && (
                            <div className={indexStyles.tdLogo}>
                              <img src={s.logo_url} alt={s.brand} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => e.target.style.display='none'} />
                            </div>
                          )}
                          <span>{s.brand}</span>
                          {s.brand === 'Costco' && <span className={indexStyles.membersOnlyBadgeSm}>Members</span>}
                        </div>
                      </td>
                      <td className={indexStyles.tdPrice} style={{ color: i === 0 && s.brand !== 'Costco' ? '#00e676' : s.brand === 'Costco' ? '#00e676' : '#f0f4ff' }}>
                        {fmt(s.avg_petrol)}
                      </td>
                      <td className={indexStyles.tdPrice} style={{ color: '#64b4ff' }}>{fmt(s.avg_diesel)}</td>
                      <td className={indexStyles.tdMuted}>{s.station_count || '—'}</td>
                      <td className={indexStyles.tdMuted}>
                        {{'Tesco': 'Clubcard', "Sainsbury's": 'Nectar', 'Morrisons': 'More Card', 'Costco': 'Required', 'Asda': '—', 'Co-op': 'Co-op'}[s.brand] || '—'}
                      </td>
                      <td>
                        <Link href={`/supermarket/${toSlug(s.brand)}`} className={indexStyles.tdLink}>
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={indexStyles.updatedNote}>Prices updated {updatedAt}. Averages across all reporting UK forecourts.</p>
          </section>

          {/* SEO copy */}
          <section className={indexStyles.seoSection}>
            <h2 className={indexStyles.sectionTitle}>Are supermarkets always cheapest for fuel?</h2>
            <div className={indexStyles.seoCols}>
              <div>
                <p>Supermarkets use fuel as a loss-leader to drive footfall. This means their forecourt prices are typically 2–5p per litre cheaper than branded forecourts like BP, Shell, or Esso on any given day.</p>
                <p>Asda and Tesco tend to lead on price, often undercutting competitors within hours of each other. The gap between the cheapest and most expensive supermarket is rarely more than 3p/litre.</p>
              </div>
              <div>
                <p>Costco is in a category of its own — members-only pricing that sits 4–8p below the supermarket average. If you fill up regularly and drive enough miles, the membership pays for itself quickly.</p>
                <p>Prices vary significantly by region. A Tesco in Scotland may price differently to one in London. Use the individual brand pages to find the cheapest forecourt near you.</p>
              </div>
            </div>
          </section>

          {/* CTA */}
          <div className={indexStyles.ctaBanner}>
            <div>
              <h3>Get the cheapest price near you every Monday</h3>
              <p>Free weekly email. No app. Unsubscribe anytime.</p>
            </div>
            <Link href="/" className={indexStyles.ctaBtn}>Get free alerts →</Link>
          </div>

        </div>

        <footer className={indexStyles.footer}>
          <div className={indexStyles.footerInner}>
            <span className={indexStyles.footerLogo}>⛽ FuelAlerts</span>
            <span className={indexStyles.footerText}>Data from UK Government Fuel Finder API · Updated daily</span>
            <div className={indexStyles.footerLinks}>
              <Link href="/privacy">Privacy</Link>
              <Link href="/unsubscribe">Unsubscribe</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}

export async function getStaticProps() {
  const [{ data: petrolRows }, { data: dieselRows }] = await Promise.all([
    supabase.rpc('get_all_supermarket_averages', { p_fuel_type: 'E10' }),
    supabase.rpc('get_all_supermarket_averages', { p_fuel_type: 'B7' }),
  ])

  const dieselMap = {}
  for (const r of (dieselRows || [])) dieselMap[r.brand_clean] = r

  const supermarkets = (petrolRows || []).map(r => ({
    brand:         r.brand_clean,
    avg_petrol:    r.avg_price != null ? parseFloat(r.avg_price) : null,
    avg_diesel:    dieselMap[r.brand_clean]?.avg_price != null ? parseFloat(dieselMap[r.brand_clean].avg_price) : null,
    station_count: parseInt(r.station_count) || 0,
    logo_url:      r.logo_url || null,
  })).sort((a, b) => (a.avg_petrol || 999) - (b.avg_petrol || 999))

  const updatedAt = new Date().toISOString().split('T')[0]

  return {
    props: { supermarkets, updatedAt },
    revalidate: 6 * 60 * 60,
  }
}
