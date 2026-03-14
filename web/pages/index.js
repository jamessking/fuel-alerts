import Head from 'next/head'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import styles from '../styles/Home.module.css'
import StationCard from '../components/StationCard'

export default function Home() {
  const [townQuery, setTownQuery] = useState('')
  const [townList, setTownList] = useState([])
  const [townFiltered, setTownFiltered] = useState([])
  const [townOpen, setTownOpen] = useState(false)
  const townRef = useRef(null)

  // Load town list once on mount
  useEffect(() => {
    fetch('/api/towns').then(r => r.json()).then(d => setTownList(d || [])).catch(() => {})
  }, [])

  // Filter as user types
  useEffect(() => {
    const q = townQuery.trim().toLowerCase()
    if (q.length < 2) { setTownFiltered([]); setTownOpen(false); return }
    const matches = townList
      .filter(t => t.city.toLowerCase().startsWith(q))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
    setTownFiltered(matches)
    setTownOpen(matches.length > 0)
  }, [townQuery, townList])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = e => { if (townRef.current && !townRef.current.contains(e.target)) setTownOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const [postcode, setPostcode] = useState('')
  const [postcodeInfo, setPostcodeInfo] = useState(null)
  const [postcodeError, setPostcodeError] = useState('')
  const [postcodeLoading, setPostcodeLoading] = useState(false)
  
  const [reg, setReg] = useState('')
  const [regInfo, setRegInfo] = useState(null)
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError] = useState('')

  const [fuelType, setFuelType] = useState('')
  const [radius, setRadius] = useState('5')
  const [email, setEmail] = useState('')
  const [annualMiles, setAnnualMiles] = useState('10000')
  const [mpg, setMpg] = useState('45')
  const [tankLitres, setTankLitres] = useState('55')

  // Source tracking — read from URL on mount
  const [utmSource, setUtmSource] = useState(null)
  const [utmMedium, setUtmMedium] = useState(null)
  const [utmCampaign, setUtmCampaign] = useState(null)
  const [utmContent, setUtmContent] = useState(null)
  const [refCode, setRefCode] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('utm_source'))   setUtmSource(params.get('utm_source'))
    if (params.get('utm_medium'))   setUtmMedium(params.get('utm_medium'))
    if (params.get('utm_campaign')) setUtmCampaign(params.get('utm_campaign'))
    if (params.get('utm_content'))  setUtmContent(params.get('utm_content'))
    if (params.get('ref'))          setRefCode(params.get('ref'))
  }, [])

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [stationCount, setStationCount] = useState(null)
  const [stationCountLoading, setStationCountLoading] = useState(false)
  const [priceData, setPriceData] = useState(null)
  const [locating, setLocating] = useState(false)

  function handleGeolocate() {
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
  const [priceTab, setPriceTab] = useState('unleaded')
  const [nearbyStations, setNearbyStations] = useState([])
  const [nearbyLoading, setNearbyLoading] = useState(false)

  const postcodeTimer = useRef(null)
  const stationTimer = useRef(null)

  useEffect(() => {
    if (!postcodeInfo) { setStationCount(null); return }
    clearTimeout(stationTimer.current)
    stationTimer.current = setTimeout(async () => {
      setStationCountLoading(true)
      try {
        const res = await fetch(`/api/station-count?lat=${postcodeInfo.lat}&lon=${postcodeInfo.lon}&radius=${radius}`)
        const data = await res.json()
        setStationCount(data.count ?? null)
      } catch { setStationCount(null) }
      finally { setStationCountLoading(false) }
    }, 300)
  }, [postcodeInfo, radius])

  useEffect(() => {
    fetch('/api/fuel-averages')
      .then(r => r.json())
      .then(d => { if (!d.error) setPriceData(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const clean = postcode.replace(/\s/g, '').toUpperCase()
    if (clean.length < 5) {
      setPostcodeInfo(null)
      setPostcodeError('')
      return
    }
    clearTimeout(postcodeTimer.current)
    postcodeTimer.current = setTimeout(async () => {
      setPostcodeLoading(true)
      setPostcodeError('')
      try {
        const res = await fetch(`https://api.postcodes.io/postcodes/${clean}`)
        const data = await res.json()
        if (data.status === 200) {
          setPostcodeInfo({
            town: data.result.admin_district || data.result.parish || data.result.region,
            lat: data.result.latitude,
            lon: data.result.longitude,
            formatted: data.result.postcode
          })
        } else {
          setPostcodeInfo(null)
          setPostcodeError('Postcode not found')
        }
      } catch {
        setPostcodeError('Could not verify postcode')
      } finally {
        setPostcodeLoading(false)
      }
    }, 500)
  }, [postcode])

  const lookupReg = async () => {
    const cleanReg = reg.replace(/\s/g, '').toUpperCase()
    if (!cleanReg) return
    setRegLoading(true)
    setRegError('')
    setRegInfo(null)
    try {
      const res = await fetch('/api/reg-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reg: cleanReg })
      })
      const data = await res.json()
      if (data.error) {
        setRegError(data.error)
      } else {
        setRegInfo(data)
        if (data.fuelType) setFuelType(data.fuelType)
        if (data.mpg) setMpg(String(data.mpg))
        if (data.engineCapacity) {
          const litres = data.engineCapacity / 1000
          const tankGuess = litres < 1.4 ? 45 : litres < 2.0 ? 50 : 60
          setTankLitres(String(tankGuess))
        }
      }
    } catch {
      setRegError('Could not look up registration')
    } finally {
      setRegLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!postcodeInfo) { setSubmitError('Please enter a valid postcode'); return }
    if (!fuelType) { setSubmitError('Please select a fuel type'); return }
    if (!email) { setSubmitError('Please enter your email'); return }

    setSubmitting(true)
    setSubmitError('')

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          postcode: postcodeInfo.formatted,
          lat: postcodeInfo.lat,
          lon: postcodeInfo.lon,
          fuel_type: fuelType,
          radius_miles: parseInt(radius),
          annual_miles: annualMiles ? parseInt(annualMiles) : null,
          mpg: mpg ? parseFloat(mpg) : null,
          tank_litres: tankLitres ? parseFloat(tankLitres) : null,
          vehicle: regInfo ? { ...regInfo, reg: reg.replace(/\s/g, '').toUpperCase() } : null,
          utm_source:   utmSource,
          utm_medium:   utmMedium,
          utm_campaign: utmCampaign,
          utm_content:  utmContent,
          ref:          refCode,
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Subscription failed')
      setSubmitted(true)

      // Load nearby stations for the success state
      setNearbyLoading(true)
      try {
        const fuel = fuelType === 'B7' || fuelType === 'SDV' ? 'B7_STANDARD' : 'E10'
        const res2 = await fetch(`/api/nearby-stations?lat=${postcodeInfo.lat}&lon=${postcodeInfo.lon}&radius=${radius}&fuel=${fuel}`)
        const d2 = await res2.json()
        if (d2.stations) setNearbyStations(d2.stations)
      } catch {}
      finally { setNearbyLoading(false) }

    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const estimatedSaving = () => {
    if (!annualMiles || !mpg) return null
    const litresPerYear = (parseInt(annualMiles) / parseFloat(mpg)) * 4.546
    const savingPer10p = litresPerYear * 0.10
    return Math.round(savingPer10p)
  }

  const saving = estimatedSaving()

  const fmt = (v) => v ? `${v.toFixed(1)}p` : '—'
  const fmtDelta = (v) => {
    if (v === null || v === undefined) return null
    return `${v > 0 ? '+' : ''}${v.toFixed(1)}p`
  }

  // Country slug map for price table links
  const countryLinks = {
    '🇬🇧 UK': null,
    '🏴󠁧󠁢󠁥󠁮󠁧󠁿 England': '/country/england',
    '🏴󠁧󠁢󠁳󠁣󠁴󠁿 Scotland': '/country/scotland',
    '🏴󠁧󠁢󠁷󠁬󠁳󠁿 Wales': '/country/wales',
    '🇬🇧 N. Ireland': '/country/northern-ireland',
  }

  return (
    <>
      <Head>
        <title>FuelAlerts — Never Overpay for Petrol Again</title>
        <meta name="description" content="Weekly alerts showing the cheapest fuel near you. Enter your postcode and we'll do the watching." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className={styles.page}>
        <div className={styles.heroBg} style={{backgroundImage: 'url(https://images.unsplash.com/photo-1709536240401-58dff8e8d597?q=80&w=1548&auto=format&fit=crop)'}} />
        <div className={styles.heroBgOverlay} />
        <div className={styles.orb1} />
        <div className={styles.orb2} />

        <nav className={styles.nav}>
          <div className={styles.logo}>
            <span className={styles.logoMark}>⛽</span>
            <span className={styles.logoText}>FuelAlerts</span>
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
            <Link href="/signin" style={{fontSize: '0.85rem', color: '#8899bb', textDecoration: 'none', fontWeight: 600}}>Sign in</Link>
            <div className={styles.navBadge}>No app needed</div>
          </div>
        </nav>

        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={`${styles.pill} animate-fade-up delay-1`}>
              🇬🇧 UK Government fuel data · Updated daily
            </div>
            <h1 className={`${styles.heroTitle} animate-fade-up delay-2`}>
              UK average prices today.<br />
              <span className={styles.accent}>Find your fuel cheaper.</span>
            </h1>
            <p className={`${styles.heroSub} animate-fade-up delay-3`}>
              FuelAlerts watches 7,150+ UK fuel stations so you don't have to.
              Get the cheapest prices near you delivered to your inbox — before prices go up.
            </p>

            {/* Live price table */}
            {priceData && (
              <div className={`${styles.priceTableWrap} animate-fade-up delay-4`}>
                <div className={styles.priceTableTabs}>
                  <button
                    className={`${styles.priceTab} ${priceTab === 'unleaded' ? styles.priceTabActive : ''}`}
                    onClick={() => setPriceTab('unleaded')}
                  >⛽ Unleaded</button>
                  <button
                    className={`${styles.priceTab} ${priceTab === 'diesel' ? styles.priceTabActive : ''}`}
                    onClick={() => setPriceTab('diesel')}
                  >🛢 Diesel</button>
                </div>
                {(() => {
                  const d = priceData[priceTab]
                  const rows = [
                    { label: '🇬🇧 UK',           key: 'uk',      data: d.uk },
                    { label: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 England',    key: 'england', data: d.england },
                    { label: '🏴󠁧󠁢󠁳󠁣󠁴󠁿 Scotland',   key: 'scotland',data: d.scotland },
                    { label: '🏴󠁧󠁢󠁷󠁬󠁳󠁿 Wales',      key: 'wales',   data: d.wales },
                    { label: '🇬🇧 N. Ireland',   key: 'ni',      data: d.ni },
                  ]
                  return (
                    <div className={styles.priceTable}>
                      <div className={styles.priceTableHeader}>
                        <span></span>
                        <span>Avg</span>
                        <span>vs last week</span>
                        <span>Motorway</span>
                        <span>Supermarket</span>
                        <span>Forecourt</span>
                      </div>
                      {rows.map(row => {
                        const delta = row.data?.weekDelta
                        const deltaStr = fmtDelta(delta)
                        const link = countryLinks[row.label]
                        const regionCell = link
                          ? <Link href={link} className={styles.priceTableRegionLink} style={{color: "#f0f4ff", fontWeight: 600, textDecoration: "none", fontSize: "0.95rem"}}>{row.label}</Link>
                          : <span>{row.label}</span>
                        return (
                          <div key={row.key} className={styles.priceTableRow}>
                            <span className={styles.priceTableRegion}>{regionCell}</span>
                            <span className={styles.priceTableAvg}>{fmt(row.data?.avg)}</span>
                            <span className={delta === null ? '' : delta > 0 ? styles.deltaUp : delta < 0 ? styles.deltaDown : styles.deltaNeutral}>
                              {deltaStr || '—'}
                            </span>
                            <span>{fmt(row.data?.motorway)}</span>
                            <span>{fmt(row.data?.supermarket)}</span>
                            <span>{fmt(row.data?.forecourt)}</span>
                          </div>
                        )
                      })}
                      <div className={styles.priceTableFooter}>
                        Updated {priceData.updatedAt
                          ? priceData.updatedAt.includes('T')
                            ? new Date(priceData.updatedAt).toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'})
                            : priceData.updatedAt
                          : 'today'}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Supermarket league table */}
            {(() => {
              const supers = (priceData?.supermarkets || [])
                .filter(s => s.avg_petrol != null && s.brand !== 'Costco')
              if (!supers.length) return null
              const hero = supers[0]
              const rest = supers.slice(1)
              const toSlug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
              return (
                <div style={{marginTop: '1.5rem', border: '1px solid #1e2d4a', borderRadius: '14px', overflow: 'hidden'}}>
                  <div style={{fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4a5a7a', padding: '0.75rem 1rem', borderBottom: '1px solid #1e2d4a', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <span>🛒 Supermarket fuel prices today</span>
                  </div>
                  {/* Hero — cheapest */}
                  <a href={`/supermarket/${toSlug(hero.brand)}`} style={{textDecoration: 'none', display: 'block'}}>
                    <div style={{padding: '1.1rem 1.25rem', borderBottom: '1px solid #1e2d4a', display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(0,230,118,0.03)', transition: 'background 0.15s', cursor: 'pointer'}}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(0,230,118,0.07)'}
                      onMouseLeave={e => e.currentTarget.style.background='rgba(0,230,118,0.03)'}
                    >
                      <div style={{fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#00e676', minWidth: '1.5rem'}}>#1</div>
                      <div style={{width: '40px', height: '40px', borderRadius: '10px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.25)'}}>
                        {hero.logo_url
                          ? <img src={hero.logo_url} alt={hero.brand} style={{width: '80%', height: '80%', objectFit: 'contain'}} onError={e => e.target.style.display='none'} />
                          : <span style={{fontWeight: 800, color: '#1e2d4a', fontSize: '0.9rem'}}>{hero.brand.charAt(0)}</span>
                        }
                      </div>
                      <div style={{flex: 1}}>
                        <div style={{fontWeight: 700, fontSize: '0.95rem', color: '#f0f4ff'}}>{hero.brand}</div>
                        <div style={{fontSize: '0.7rem', color: '#4a5a7a', marginTop: '2px'}}>Cheapest supermarket this week</div>
                      </div>
                      <div style={{display: 'flex', gap: '0.75rem', alignItems: 'center'}}>
                        <div style={{textAlign: 'right'}}>
                          <div style={{fontSize: '0.6rem', color: '#4a5a7a', textTransform: 'uppercase', letterSpacing: '0.06em'}}>Petrol</div>
                          <div style={{fontFamily: 'monospace', fontWeight: 800, fontSize: '1rem', color: '#00e676'}}>{hero.avg_petrol.toFixed(1)}p</div>
                        </div>
                        {hero.avg_diesel && (
                          <div style={{textAlign: 'right'}}>
                            <div style={{fontSize: '0.6rem', color: '#4a5a7a', textTransform: 'uppercase', letterSpacing: '0.06em'}}>Diesel</div>
                            <div style={{fontFamily: 'monospace', fontWeight: 800, fontSize: '1rem', color: '#64b4ff'}}>{hero.avg_diesel.toFixed(1)}p</div>
                          </div>
                        )}
                        <div style={{color: '#4a5a7a', fontSize: '0.8rem'}}>›</div>
                      </div>
                    </div>
                  </a>
                  {/* Rest */}
                  {rest.map((s, i) => (
                    <a key={s.brand} href={`/supermarket/${toSlug(s.brand)}`} style={{textDecoration: 'none', display: 'block'}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 1.25rem', borderBottom: i < rest.length - 1 ? '1px solid rgba(30,45,74,0.7)' : 'none', transition: 'background 0.1s', cursor: 'pointer'}}
                        onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.025)'}
                        onMouseLeave={e => e.currentTarget.style.background='transparent'}
                      >
                        <span style={{fontSize: '0.7rem', color: '#4a5a7a', fontWeight: 700, width: '1.4rem', flexShrink: 0}}>#{i + 2}</span>
                        <div style={{width: '32px', height: '32px', borderRadius: '8px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.2)'}}>
                          {s.logo_url
                            ? <img src={s.logo_url} alt={s.brand} style={{width: '80%', height: '80%', objectFit: 'contain'}} onError={e => e.target.style.display='none'} />
                            : <span style={{fontWeight: 800, color: '#1e2d4a', fontSize: '0.75rem'}}>{s.brand.charAt(0)}</span>
                          }
                        </div>
                        <div style={{flex: 1}}>
                          <div style={{fontSize: '0.85rem', fontWeight: 600, color: '#c8d8f0'}}>{s.brand}</div>
                        </div>
                        <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                          <span style={{fontSize: '0.82rem', color: '#00e676', fontFamily: 'monospace', fontWeight: 700}}>{s.avg_petrol.toFixed(1)}p</span>
                          {s.avg_diesel && <span style={{fontSize: '0.82rem', color: '#64b4ff', fontFamily: 'monospace', fontWeight: 700}}>{s.avg_diesel.toFixed(1)}p</span>}
                          <span style={{color: '#4a5a7a', fontSize: '0.8rem'}}>›</span>
                        </div>
                      </div>
                    </a>
                  ))}
                  {/* Costco footnote */}
                  {(priceData?.supermarkets || []).find(s => s.brand === 'Costco') && (() => {
                    const costco = (priceData.supermarkets).find(s => s.brand === 'Costco')
                    return (
                      <a href="/supermarket/costco" style={{textDecoration: 'none', display: 'block'}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1.25rem', background: 'rgba(255,179,0,0.04)', borderTop: '1px solid rgba(30,45,74,0.7)', cursor: 'pointer', transition: 'background 0.1s'}}
                          onMouseEnter={e => e.currentTarget.style.background='rgba(255,179,0,0.08)'}
                          onMouseLeave={e => e.currentTarget.style.background='rgba(255,179,0,0.04)'}
                        >
                          <span style={{fontSize: '0.65rem', fontWeight: 800, color: '#ffb300', background: 'rgba(255,179,0,0.15)', border: '1px solid rgba(255,179,0,0.3)', borderRadius: '999px', padding: '2px 7px', whiteSpace: 'nowrap'}}>Members only</span>
                          <div style={{flex: 1, fontSize: '0.82rem', color: '#c8d8f0', fontWeight: 600}}>Costco</div>
                          <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                            {costco.avg_petrol && <span style={{fontSize: '0.82rem', color: '#00e676', fontFamily: 'monospace', fontWeight: 700}}>{costco.avg_petrol.toFixed(1)}p</span>}
                            {costco.avg_diesel && <span style={{fontSize: '0.82rem', color: '#64b4ff', fontFamily: 'monospace', fontWeight: 700}}>{costco.avg_diesel.toFixed(1)}p</span>}
                            <span style={{color: '#4a5a7a', fontSize: '0.8rem'}}>›</span>
                          </div>
                        </div>
                      </a>
                    )
                  })()}
                </div>
              )
            })()}

            {/* Brands box */}
            {(() => {
              const brands = (priceData?.brands || [])
              if (!brands.length) return null
              const toSlug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
              return (
                <div style={{marginTop: '1rem', border: '1px solid #1e2d4a', borderRadius: '14px', overflow: 'hidden'}}>
                  <div style={{fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4a5a7a', padding: '0.75rem 1rem', borderBottom: '1px solid #1e2d4a', background: 'rgba(255,255,255,0.02)'}}>
                    ⛽ Forecourt brand averages today
                  </div>
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr'}}>
                    {brands.slice(0, 8).map((b, i) => (
                      <a key={b.brand_clean} href={`/brand/${toSlug(b.brand_clean)}`} style={{textDecoration: 'none'}}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '0.6rem',
                          padding: '0.65rem 1rem',
                          borderRight: i % 2 === 0 ? '1px solid rgba(30,45,74,0.7)' : 'none',
                          borderBottom: i < brands.slice(0, 8).length - 2 ? '1px solid rgba(30,45,74,0.7)' : 'none',
                          cursor: 'pointer', transition: 'background 0.1s',
                        }}
                          onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.025)'}
                          onMouseLeave={e => e.currentTarget.style.background='transparent'}
                        >
                          {b.logo_url
                            ? <div style={{width: '28px', height: '28px', borderRadius: '6px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
                                <img src={b.logo_url} alt={b.brand_clean} style={{width: '80%', height: '80%', objectFit: 'contain'}} onError={e => e.target.style.display='none'} />
                              </div>
                            : <div style={{width: '28px', height: '28px', borderRadius: '6px', background: '#1e2d4a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.75rem', fontWeight: 800, color: '#8899bb'}}>
                                {b.brand_clean.charAt(0)}
                              </div>
                          }
                          <div style={{flex: 1, minWidth: 0}}>
                            <div style={{fontSize: '0.8rem', fontWeight: 600, color: '#c8d8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{b.brand_clean}</div>
                            <div style={{fontSize: '0.75rem', fontFamily: 'monospace', color: '#00e676', fontWeight: 700}}>{b.avg_price?.toFixed(1)}p</div>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )
            })()}

            <div className={styles.tableFooterCta}>
              <span className={styles.tableFooterCtaDot} />
              Subscribe to get the cheapest price near your postcode every Monday —{' '}
              <a href="#signup" className={styles.tableFooterCtaLink} onClick={e => {
                e.preventDefault()
                document.querySelector('input[placeholder="e.g. NG1 1AA"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                document.querySelector('input[placeholder="e.g. NG1 1AA"]')?.focus()
              }}>
                it's free →
              </a>
            </div>

            <div className={`${styles.heroStats} animate-fade-up delay-4`}>
              <div className={styles.stat}>
                <span className={styles.statNum}>7,150+</span>
                <span className={styles.statLabel}>Stations tracked</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.stat}>
                <span className={styles.statNum}>Daily</span>
                <span className={styles.statLabel}>Price updates</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.stat}>
                <span className={styles.statNum}>Weekly</span>
                <span className={styles.statLabel}>Digest</span>
              </div>
            </div>
          </div>

          {/* Sign Up Form — integrated town search + geolocation */}
          <div className={`${styles.formCard} animate-fade-up delay-2`}>
            {submitted ? (
              <div className={styles.successState}>
                <div className={styles.successIcon}>✓</div>
                <h3>You're on the list!</h3>
                <p>Check your inbox to confirm your email. Your first FuelAlert arrives Monday.</p>

                {/* Nearby stations */}
                {nearbyLoading && (
                  <p style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>Finding cheapest nearby stations…</p>
                )}
                {!nearbyLoading && nearbyStations.length > 0 && (
                  <div style={{width: '100%', marginTop: '0.5rem'}}>
                    <p style={{fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem'}}>
                      Cheapest near {postcodeInfo?.formatted}
                    </p>
                    <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                      {nearbyStations.slice(0, 5).map((s, i) => (
                        <StationCard
                          key={s.node_id}
                          station={s}
                          rank={i + 1}
                          showFuelBadge={true}
                          compact={true}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formHeader}>
                  <h2>See the cheapest fuel near you</h2>
                  <p>Free weekly email. No app, no spam.</p>
                </div>

                {/* Step 1: Your car — sets fuel type automatically */}
                <div className={styles.vehicleSection}>
                  <div className={styles.vehicleSectionHeader}>
                    <span className={styles.vehicleSectionIcon}>🚗</span>
                    <div>
                      <div className={styles.vehicleSectionTitle}>Your car <span className={styles.vehicleSectionBadge}>Sets fuel type automatically</span></div>
                      <div className={styles.vehicleSectionSub}>Enter your reg to personalise your alerts and see your MOT status</div>
                    </div>
                  </div>
                  <div className={styles.regRow}>
                    <div className={styles.regPlate}>
                      <span className={styles.regPlateFlag}>🇬🇧</span>
                      <input
                        className={styles.regPlateInput}
                        type="text"
                        placeholder="AB12 CDE"
                        value={reg}
                        onChange={e => setReg(e.target.value.toUpperCase())}
                        maxLength={8}
                      />
                    </div>
                    <button type="button" className={styles.regLookupBtn} onClick={lookupReg} disabled={regLoading || !reg}>
                      {regLoading ? '...' : 'Look up'}
                    </button>
                  </div>
                  {regError && <div className={styles.fieldError}>{regError}</div>}
                  {regInfo && (
                    <div className={styles.vehicleCardNew}>
                      <div className={styles.vehicleCardTop}>
                        <div className={styles.vehicleCardMake}>{regInfo.make}</div>
                        <div className={styles.vehicleCardBadges}>
                          <span className={styles.vcBadge}>{regInfo.year}</span>
                          <span className={styles.vcBadge}>{regInfo.colour}</span>
                          <span className={styles.vcBadgeFuel}>{regInfo.fuelTypeRaw}</span>
                          {regInfo.engineCapacity && <span className={styles.vcBadge}>{(regInfo.engineCapacity/1000).toFixed(1)}L</span>}
                        </div>
                      </div>
                      <div className={styles.vehicleCardChecks}>
                        {regInfo.motExpired ? (
                          <div className={styles.vcCheckFail}>⚠ MOT EXPIRED</div>
                        ) : regInfo.motDaysRemaining !== null && regInfo.motDaysRemaining <= 30 ? (
                          <div className={styles.vcCheckWarn}>🔴 MOT expires in {regInfo.motDaysRemaining} days</div>
                        ) : regInfo.motExpiryDate ? (
                          <div className={styles.vcCheckOk}>✓ MOT valid until {regInfo.motExpiryDate}</div>
                        ) : null}
                        {regInfo.taxStatus && (
                          <div className={regInfo.taxStatus === 'Taxed' ? styles.vcCheckOk : styles.vcCheckWarn}>
                            {regInfo.taxStatus === 'Taxed' ? `✓ Tax until ${regInfo.taxDueDate || '—'}` : `⚠ Tax: ${regInfo.taxStatus}`}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {!regInfo && (
                    <div style={{fontSize:'0.75rem',color:'#4a5a7a',marginTop:'0.5rem'}}>
                      No reg? No problem — <span style={{color:'#8899bb'}}>skip this step</span>
                    </div>
                  )}
                </div>

                {/* Step 2: Where you fill up */}
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>
                    Where do you fill up?
                    {postcodeInfo && stationCount !== null && (
                      <span className={styles.stationCount}> · {stationCountLoading ? 'checking...' : `~${stationCount} stations nearby`}</span>
                    )}
                  </label>
                  <div style={{display: 'flex', gap: '0.5rem'}}>
                    <div className={styles.inputWrapper} style={{flex: 1}}>
                      <input
                        className={`${styles.input} ${postcodeInfo ? styles.inputValid : ''} ${postcodeError ? styles.inputError : ''}`}
                        type="text"
                        placeholder="Enter your postcode"
                        value={postcode}
                        onChange={e => setPostcode(e.target.value.toUpperCase())}
                        maxLength={8}
                      />
                      {postcodeLoading && <span className={styles.inputSpinner} />}
                      {postcodeInfo && <span className={styles.inputCheck}>✓</span>}
                    </div>
                    <button
                      type="button"
                      onClick={handleGeolocate}
                      disabled={locating}
                      title="Use my location"
                      style={{
                        background: '#1a2640', border: '1px solid #1e2d4a', borderRadius: '10px',
                        padding: '0 0.85rem', color: locating ? '#4a5a7a' : '#8899bb',
                        fontSize: '1.1rem', cursor: locating ? 'default' : 'pointer',
                        flexShrink: 0, transition: 'border-color 0.15s, color 0.15s',
                      }}
                      onMouseEnter={e => { if (!locating) { e.currentTarget.style.borderColor='rgba(0,230,118,0.3)'; e.currentTarget.style.color='#00e676' }}}
                      onMouseLeave={e => { e.currentTarget.style.borderColor='#1e2d4a'; e.currentTarget.style.color= locating ? '#4a5a7a' : '#8899bb' }}
                    >
                      {locating ? '…' : '⌖'}
                    </button>
                  </div>
                  {postcodeInfo && (
                    <div className={styles.postcodeConfirm}>
                      📍 {postcodeInfo.town}
                    </div>
                  )}
                  {postcodeError && <div className={styles.fieldError}>{postcodeError}</div>}
                  <div className={styles.radiusButtons} style={{marginTop:'0.6rem'}}>
                    {['2', '5', '10', '20'].map(r => (
                      <button
                        key={r}
                        type="button"
                        className={`${styles.radiusBtn} ${radius === r ? styles.radiusBtnActive : ''}`}
                        onClick={() => setRadius(r)}
                      >
                        {r} mi
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 3: Fuel type — only shown if reg didn't auto-set it */}
                {!regInfo && (
                  <div className={styles.fieldGroup}>
                    <label className={styles.label}>Fuel type</label>
                    <div className={styles.fuelButtons}>
                      {[
                        { value: 'E10', label: '⛽ Unleaded' },
                        { value: 'E5',  label: '⛽ Super Unleaded' },
                        { value: 'B7',  label: '🛢 Diesel' },
                        { value: 'SDV', label: '🛢 Super Diesel' },
                      ].map(f => (
                        <button
                          key={f.value}
                          type="button"
                          className={`${styles.fuelBtn} ${fuelType === f.value ? styles.fuelBtnActive : ''}`}
                          onClick={() => setFuelType(f.value)}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {regInfo && fuelType && (
                  <div style={{fontSize:'0.8rem',color:'#4ade80',marginBottom:'0.5rem',marginTop:'-0.25rem'}}>
                    ⛽ Fuel type set to <strong>{fuelType === 'E10' ? 'Unleaded' : fuelType === 'B7' ? 'Diesel' : fuelType === 'E5' ? 'Super Unleaded' : 'Super Diesel'}</strong> from your reg
                  </div>
                )}

                {/* Savings estimate + annual miles */}
                <div className={styles.vehicleFields}>
                  <div className={styles.miniField}>
                    <label className={styles.labelSmall}>Annual miles</label>
                    <div className={styles.stepperRow}>
                      <button type="button" className={styles.stepperBtn}
                        onClick={() => setAnnualMiles(v => String(Math.max(1000, (parseInt(v)||10000) - 1000)))}>−</button>
                      <span className={styles.stepperValue}>{Number(annualMiles).toLocaleString()}</span>
                      <button type="button" className={styles.stepperBtn}
                        onClick={() => setAnnualMiles(v => String((parseInt(v)||10000) + 1000))}>+</button>
                    </div>
                  </div>
                  <div className={styles.miniField}>
                    <label className={styles.labelSmall}>MPG</label>
                    <input className={styles.input} type="number" value={mpg} onChange={e => setMpg(e.target.value)} />
                  </div>
                  <div className={styles.miniField}>
                    <label className={styles.labelSmall}>Tank (L)</label>
                    <input className={styles.input} type="number" value={tankLitres} onChange={e => setTankLitres(e.target.value)} />
                  </div>
                </div>
                {saving && (
                  <div className={styles.savingPreview}>
                    💰 Choosing the cheapest station near you could save <strong>~£{saving}/yr</strong>
                  </div>
                )}

                {/* Step 4: Email */}
                <div className={styles.fieldGroup} style={{marginTop:'0.5rem'}}>
                  <label className={styles.label}>Where should we send your alerts?</label>
                  <input
                    className={styles.input}
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>

                {submitError && <div className={styles.submitError}>{submitError}</div>}

                <button type="submit" className={styles.submitBtn} disabled={submitting}>
                  {submitting ? 'Setting up your alerts...' : 'Send me weekly fuel prices →'}
                </button>

                <p className={styles.formFootnote}>
                  Free forever. Unsubscribe anytime. No app required.
                </p>
              <div className={`${styles.compareCol} ${styles.compareColGood}`}>
                <div className={styles.compareHeader}>
                  <span className={styles.compareLabelGood}>FuelAlerts</span>
                </div>
                {['Prices come to you weekly', 'Alerts before price rises', 'Just an email — nothing to install', 'Clean, focused, no noise', 'Personalised savings based on your car'].map(item => (
                  <div key={item} className={styles.compareItemGood}>
                    <span className={styles.checkIcon}>✓</span> {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Trust */}
        <section className={styles.trust}>
          <div className={styles.sectionInner}>
            <div className={styles.trustGrid}>
              <div className={styles.trustItem}>
                <div className={styles.trustIcon}>🏛️</div>
                <h4>Official UK Government data</h4>
                <p>Prices sourced directly from the UK Fuel Finder API — the same data fuel retailers are legally required to submit.</p>
              </div>
              <div className={styles.trustItem}>
                <div className={styles.trustIcon}>🔄</div>
                <h4>Updated every day</h4>
                <p>Stations must report price changes within 30 minutes. Our system pulls the latest every 24 hours.</p>
              </div>
              <div className={styles.trustItem}>
                <div className={styles.trustIcon}>🔒</div>
                <h4>Your data stays yours</h4>
                <p>We only store what's needed to send your alerts. No selling, no profiling. Unsubscribe with one click.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className={styles.cta}>
          <div className={styles.ctaInner}>
            <h2>Ready to stop overpaying?</h2>
            <p>Join the drivers already getting smarter about fuel.</p>
            <a href="#top" className={styles.ctaBtn} onClick={e => { e.preventDefault(); window.scrollTo({top: 0, behavior: 'smooth'}) }}>
              Get started with your free email today →
            </a>
          </div>
        </section>

        {/* Footer */}
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <div className={styles.footerLogo}>
              <span>⛽</span> FuelAlerts
            </div>
            <p className={styles.footerText}>
              Fuel price data sourced from the UK Government Fuel Finder API.
              FuelAlerts is not affiliated with any fuel retailer.
            </p>
            <div className={styles.footerLinks}>
              <a href="/privacy">Privacy Policy</a>
              <a href="/unsubscribe">Unsubscribe</a>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}
