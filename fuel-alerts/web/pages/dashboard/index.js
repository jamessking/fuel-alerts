import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import styles from '../../styles/Dashboard.module.css'

const GREEN = '#00e676'
const BLUE = '#4488ff'
const CORAL = '#ff6b4a'
const AMBER = '#ffb300'
const PURPLE = '#a855f7'
const TEAL = '#06b6d4'

function KpiCard({ label, value, sub, trend, color }) {
  const trendUp = trend > 0
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={styles.kpiValue} style={{ color: color || 'white' }}>{value}</div>
      {sub && <div className={styles.kpiSub}>{sub}</div>}
      {trend !== undefined && trend !== null && (
        <div className={`${styles.kpiTrend} ${trendUp ? styles.trendUp : styles.trendDown}`}>
          {trendUp ? '▲' : '▼'} {Math.abs(trend).toFixed(2)}p vs last snapshot
        </div>
      )}
    </div>
  )
}

function SectionCard({ title, icon, children, loading }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionIcon}>{icon}</span>
        <h2>{title}</h2>
      </div>
      {loading ? (
        <div className={styles.sectionLoading}>
          <div className={styles.spinner} />
        </div>
      ) : children}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipLabel}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} className={styles.tooltipRow}>
          <span style={{ color: p.color }}>●</span>
          <span>{p.name}: <strong>{p.value}p</strong></span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const supabase = createClientComponentClient()

  const [kpis, setKpis] = useState(null)
  const [brands, setBrands] = useState(null)
  const [trends, setTrends] = useState(null)
  const [supermarkets, setSupermarkets] = useState(null)
  const [motorway, setMotorway] = useState(null)
  const [regions, setRegions] = useState(null)
  const [loadingKpis, setLoadingKpis] = useState(true)
  const [loadingBrands, setLoadingBrands] = useState(true)
  const [loadingTrends, setLoadingTrends] = useState(true)
  const [loadingSuper, setLoadingSuper] = useState(true)
  const [loadingMotorway, setLoadingMotorway] = useState(true)
  const [loadingRegions, setLoadingRegions] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/dashboard/login')
  }

  useEffect(() => {
    fetch('/api/dashboard/kpis').then(r => r.json()).then(d => { setKpis(d); setLoadingKpis(false) })
    fetch('/api/dashboard/brands').then(r => r.json()).then(d => { setBrands(d); setLoadingBrands(false) })
    fetch('/api/dashboard/trends').then(r => r.json()).then(d => { setTrends(d); setLoadingTrends(false) })
    fetch('/api/dashboard/supermarkets').then(r => r.json()).then(d => { setSupermarkets(d); setLoadingSuper(false) })
    fetch('/api/dashboard/motorway').then(r => r.json()).then(d => { setMotorway(d); setLoadingMotorway(false) })
    fetch('/api/dashboard/regions').then(r => r.json()).then(d => { setRegions(d); setLoadingRegions(false) })
  }, [])

  const formatDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''

  return (
    <>
      <Head>
        <title>FuelAlerts — Dashboard</title>
      </Head>
      <div className={styles.page}>

        {/* Nav */}
        <nav className={styles.nav}>
          <div className={styles.navLeft}>
            <a href="/" className={styles.logo}>⛽ <span>FuelAlerts</span></a>
            <span className={styles.navDivider}>|</span>
            <span className={styles.navTitle}>Data Dashboard</span>
          </div>
          <div className={styles.navRight}>
            {kpis?.latestDate && (
              <span className={styles.navDate}>Data: {formatDate(kpis.latestDate)}</span>
            )}
            <button onClick={handleSignOut} className={styles.signOutBtn}>Sign out</button>
          </div>
        </nav>

        <div className={styles.content}>

          {/* KPI Row */}
          <div className={styles.kpiRow}>
            <KpiCard
              label="UK Avg Petrol"
              value={kpis?.avgPetrol ? `${parseFloat(kpis.avgPetrol).toFixed(1)}p` : '—'}
              sub="E10 per litre"
              trend={kpis?.avgPetrol && kpis?.prevAvgPetrol ? kpis.avgPetrol - kpis.prevAvgPetrol : null}
              color={GREEN}
            />
            <KpiCard
              label="UK Avg Diesel"
              value={kpis?.avgDiesel ? `${parseFloat(kpis.avgDiesel).toFixed(1)}p` : '—'}
              sub="B7 per litre"
              trend={kpis?.avgDiesel && kpis?.prevAvgDiesel ? kpis.avgDiesel - kpis.prevAvgDiesel : null}
              color={BLUE}
            />
            <KpiCard
              label="Stations Tracked"
              value={kpis?.totalStations?.toLocaleString() || '—'}
              sub="UK & NI"
              color="white"
            />
            <KpiCard
              label="Motorway Stations"
              value={kpis?.motorwayCount?.toLocaleString() || '—'}
              sub="flagged in dataset"
              color={AMBER}
            />
            <KpiCard
              label="Active Subscribers"
              value={kpis?.subscribers?.toLocaleString() || '—'}
              sub="weekly digest"
              color={CORAL}
            />
          </div>

          {/* Tab Nav */}
          <div className={styles.tabs}>
            {[
              { id: 'overview', label: '📈 Trends' },
              { id: 'brands', label: '🏷️ Brands' },
              { id: 'supermarkets', label: '🛒 Supermarkets' },
              { id: 'motorway', label: '🛣️ Motorway' },
              { id: 'regions', label: '🗺️ Regions' },
            ].map(tab => (
              <button
                key={tab.id}
                className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TRENDS TAB */}
          {activeTab === 'overview' && (
            <SectionCard title="UK Average Price Trends" icon="📈" loading={loadingTrends}>
              {trends?.trends && (
                <>
                  <p className={styles.sectionDesc}>
                    Daily UK average petrol and diesel prices across all {kpis?.totalStations?.toLocaleString()} stations.
                    {trends.trends.length} snapshots recorded.
                  </p>
                  <div className={styles.chartWrap}>
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={trends.trends} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="date" tick={{ fill: '#94a8cc', fontSize: 12 }}
                          tickFormatter={d => formatDate(d)} />
                        <YAxis tick={{ fill: '#94a8cc', fontSize: 12 }}
                          domain={['auto', 'auto']}
                          tickFormatter={v => `${v}p`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ color: '#94a8cc', fontSize: 13 }} />
                        <Line type="monotone" dataKey="petrol" name="Petrol (E10)"
                          stroke={GREEN} strokeWidth={2.5} dot={{ fill: GREEN, r: 4 }} />
                        <Line type="monotone" dataKey="diesel" name="Diesel (B7)"
                          stroke={BLUE} strokeWidth={2.5} dot={{ fill: BLUE, r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </SectionCard>
          )}

          {/* BRANDS TAB */}
          {activeTab === 'brands' && (
            <SectionCard title="Average Price by Brand" icon="🏷️" loading={loadingBrands}>
              {brands?.brands && (
                <>
                  <p className={styles.sectionDesc}>
                    Average petrol and diesel price per brand. Excludes 'OTHER' (independent stations).
                  </p>
                  <div className={styles.chartWrap}>
                    <ResponsiveContainer width="100%" height={420}>
                      <BarChart data={brands.brands} margin={{ top: 10, right: 30, left: 0, bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="brand" tick={{ fill: '#94a8cc', fontSize: 11 }} angle={-35} textAnchor="end" />
                        <YAxis tick={{ fill: '#94a8cc', fontSize: 12 }} domain={['auto', 'auto']} tickFormatter={v => `${v}p`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ color: '#94a8cc', fontSize: 13 }} />
                        <Bar dataKey="avg_petrol" name="Avg Petrol" fill={GREEN} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="avg_diesel" name="Avg Diesel" fill={BLUE} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Brand table */}
                  <div className={styles.tableWrap}>
                    <table className={styles.dataTable}>
                      <thead>
                        <tr>
                          <th>Brand</th>
                          <th>Avg Petrol</th>
                          <th>Avg Diesel</th>
                          <th>Stations</th>
                        </tr>
                      </thead>
                      <tbody>
                        {brands.brands.map((b, i) => (
                          <tr key={i}>
                            <td>
                              <div className={styles.brandCell}>
                                {b.logo_url && <img src={b.logo_url} alt={b.brand} className={styles.tableLogo} onError={e => e.target.style.display='none'} />}
                                <span>{b.brand}</span>
                              </div>
                            </td>
                            <td style={{ color: GREEN }}>{b.avg_petrol ? `${b.avg_petrol}p` : '—'}</td>
                            <td style={{ color: BLUE }}>{b.avg_diesel ? `${b.avg_diesel}p` : '—'}</td>
                            <td className={styles.mutedCell}>{b.station_count?.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </SectionCard>
          )}

          {/* SUPERMARKETS TAB */}
          {activeTab === 'supermarkets' && (
            <SectionCard title="Supermarket Price Comparison" icon="🛒" loading={loadingSuper}>
              {supermarkets?.supermarkets && (
                <>
                  <p className={styles.sectionDesc}>
                    Average and minimum prices across {supermarkets.supermarkets.reduce((a, b) => a + b.station_count, 0).toLocaleString()} supermarket forecourts.
                  </p>
                  <div className={styles.superGrid}>
                    {supermarkets.supermarkets.map((s, i) => (
                      <div key={i} className={`${styles.superCard} ${i === 0 ? styles.superCardBest : ''}`}>
                        {i === 0 && <div className={styles.cheapestTag}>Cheapest</div>}
                        {s.logo_url && (
                          <img src={s.logo_url} alt={s.brand} className={styles.superLogo}
                            onError={e => e.target.style.display='none'} />
                        )}
                        <div className={styles.superBrand}>{s.brand}</div>
                        <div className={styles.superStations}>{s.station_count} stations</div>
                        <div className={styles.superPrices}>
                          <div className={styles.superPrice}>
                            <div className={styles.superPriceLabel}>Petrol avg</div>
                            <div className={styles.superPriceValue} style={{ color: GREEN }}>
                              {s.avg_petrol ? `${parseFloat(s.avg_petrol).toFixed(1)}p` : '—'}
                            </div>
                            {s.min_petrol && (
                              <div className={styles.superPriceMin}>min {s.min_petrol.toFixed(1)}p</div>
                            )}
                          </div>
                          <div className={styles.superPrice}>
                            <div className={styles.superPriceLabel}>Diesel avg</div>
                            <div className={styles.superPriceValue} style={{ color: BLUE }}>
                              {s.avg_diesel ? `${parseFloat(s.avg_diesel).toFixed(1)}p` : '—'}
                            </div>
                            {s.min_diesel && (
                              <div className={styles.superPriceMin}>min {s.min_diesel.toFixed(1)}p</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className={styles.chartWrap} style={{ marginTop: '2rem' }}>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={supermarkets.supermarkets} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="brand" tick={{ fill: '#94a8cc', fontSize: 12 }} />
                        <YAxis tick={{ fill: '#94a8cc', fontSize: 12 }} domain={['auto', 'auto']} tickFormatter={v => `${v}p`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ color: '#94a8cc', fontSize: 13 }} />
                        <Bar dataKey="avg_petrol" name="Avg Petrol" fill={GREEN} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="avg_diesel" name="Avg Diesel" fill={BLUE} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </SectionCard>
          )}

          {/* MOTORWAY TAB */}
          {activeTab === 'motorway' && (
            <SectionCard title="Motorway vs Regular Pricing" icon="🛣️" loading={loadingMotorway}>
              {motorway && (
                <>
                  <p className={styles.sectionDesc}>
                    Price premium at motorway service stations vs regular forecourts across {motorway.motorway?.count} motorway stations.
                  </p>

                  {/* Premium callout */}
                  <div className={styles.premiumRow}>
                    <div className={styles.premiumCard}>
                      <div className={styles.premiumLabel}>Petrol Premium</div>
                      <div className={styles.premiumValue} style={{ color: CORAL }}>
                        +{motorway.petrol_premium?.toFixed(1)}p
                      </div>
                      <div className={styles.premiumSub}>per litre on motorway</div>
                      <div className={styles.premiumTankCost}>
                        +£{(motorway.petrol_premium * 0.55).toFixed(2)} per 55L tank
                      </div>
                    </div>
                    <div className={styles.premiumCard}>
                      <div className={styles.premiumLabel}>Diesel Premium</div>
                      <div className={styles.premiumValue} style={{ color: AMBER }}>
                        +{motorway.diesel_premium?.toFixed(1)}p
                      </div>
                      <div className={styles.premiumSub}>per litre on motorway</div>
                      <div className={styles.premiumTankCost}>
                        +£{(motorway.diesel_premium * 0.55).toFixed(2)} per 55L tank
                      </div>
                    </div>
                  </div>

                  {/* Comparison chart */}
                  <div className={styles.chartWrap}>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart
                        data={[
                          { type: 'Petrol (E10)', motorway: motorway.motorway?.avg_petrol, regular: motorway.regular?.avg_petrol },
                          { type: 'Diesel (B7)', motorway: motorway.motorway?.avg_diesel, regular: motorway.regular?.avg_diesel },
                        ]}
                        margin={{ top: 10, right: 30, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="type" tick={{ fill: '#94a8cc', fontSize: 13 }} />
                        <YAxis tick={{ fill: '#94a8cc', fontSize: 12 }} domain={['auto', 'auto']} tickFormatter={v => `${v}p`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ color: '#94a8cc', fontSize: 13 }} />
                        <Bar dataKey="regular" name="Regular" fill={GREEN} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="motorway" name="Motorway" fill={CORAL} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Most expensive motorway stations */}
                  {motorway.top_motorway_stations?.length > 0 && (
                    <>
                      <h3 className={styles.subHeading}>Most Expensive Motorway Petrol Stations</h3>
                      <div className={styles.tableWrap}>
                        <table className={styles.dataTable}>
                          <thead>
                            <tr>
                              <th>Station</th>
                              <th>Petrol Price</th>
                              <th>Premium vs UK avg</th>
                            </tr>
                          </thead>
                          <tbody>
                            {motorway.top_motorway_stations.map((s, i) => (
                              <tr key={i}>
                                <td>
                                  <div className={styles.brandCell}>
                                    {s.logo_url && <img src={s.logo_url} alt="" className={styles.tableLogo} onError={e => e.target.style.display='none'} />}
                                    <span>{s.trading_name || s.brand_name}</span>
                                  </div>
                                </td>
                                <td style={{ color: CORAL }}>{s.price?.toFixed(1)}p</td>
                                <td style={{ color: AMBER }}>
                                  +{(s.price - motorway.regular?.avg_petrol).toFixed(1)}p
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}
            </SectionCard>
          )}

          {/* REGIONS TAB */}
          {activeTab === 'regions' && (
            <SectionCard title="Regional Price Comparison" icon="🗺️" loading={loadingRegions}>
              {regions?.regions && (
                <>
                  <p className={styles.sectionDesc}>
                    Average fuel prices by UK region, derived from postcode area mapping across {regions.regions.reduce((a, b) => a + b.station_count, 0).toLocaleString()} stations.
                  </p>
                  <div className={styles.chartWrap}>
                    <ResponsiveContainer width="100%" height={420}>
                      <BarChart
                        data={[...regions.regions].sort((a, b) => (a.avg_petrol || 999) - (b.avg_petrol || 999))}
                        margin={{ top: 10, right: 30, left: 0, bottom: 80 }}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                        <XAxis type="number" tick={{ fill: '#94a8cc', fontSize: 12 }}
                          domain={['auto', 'auto']} tickFormatter={v => `${v}p`} />
                        <YAxis type="category" dataKey="region"
                          tick={{ fill: '#94a8cc', fontSize: 11 }} width={120} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ color: '#94a8cc', fontSize: 13 }} />
                        <Bar dataKey="avg_petrol" name="Avg Petrol" fill={GREEN} radius={[0, 4, 4, 0]} />
                        <Bar dataKey="avg_diesel" name="Avg Diesel" fill={BLUE} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className={styles.tableWrap} style={{ marginTop: '1.5rem' }}>
                    <table className={styles.dataTable}>
                      <thead>
                        <tr>
                          <th>Region</th>
                          <th>Avg Petrol</th>
                          <th>Avg Diesel</th>
                          <th>Stations</th>
                        </tr>
                      </thead>
                      <tbody>
                        {regions.regions.map((r, i) => (
                          <tr key={i} className={i === 0 ? styles.bestRow : i === regions.regions.length - 1 ? styles.worstRow : ''}>
                            <td>
                              {i === 0 && <span className={styles.cheapestTag} style={{marginRight:'8px'}}>Cheapest</span>}
                              {i === regions.regions.length - 1 && <span className={styles.priceyTag} style={{marginRight:'8px'}}>Priciest</span>}
                              {r.region}
                            </td>
                            <td style={{ color: i === 0 ? GREEN : 'inherit' }}>{r.avg_petrol ? `${r.avg_petrol}p` : '—'}</td>
                            <td style={{ color: i === 0 ? BLUE : 'inherit' }}>{r.avg_diesel ? `${r.avg_diesel}p` : '—'}</td>
                            <td className={styles.mutedCell}>{r.station_count?.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </SectionCard>
          )}

        </div>
      </div>
    </>
  )
}
