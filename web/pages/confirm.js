import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import styles from '../styles/Confirm.module.css'
import StationCard from '../components/StationCard'
import ShareFuel from '../components/ShareFuel'

const FUEL_LABELS = {
  E10: 'Unleaded',
  B7_STANDARD: 'Diesel',
  B7: 'Diesel',
  E5: 'Super Unleaded',
  SDV: 'Super Diesel',
}

function formatPrice(p) {
  return p ? `${p.toFixed(1)}p` : '—'
}

function priceDiff(price, stations) {
  if (!stations || stations.length < 2) return null
  const cheapest = stations[0].price
  const diff = price - cheapest
  return diff > 0 ? `+${diff.toFixed(1)}p` : null
}

export default function Confirm() {
  const router = useRouter()
  const { token } = router.query
  const [status, setStatus] = useState('loading')
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!token) return
    fetch('/api/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(res => res.json())
      .then(d => {
        if (d.error) setStatus('error')
        else {
          setData(d)
          setStatus('success')
        }
      })
      .catch(() => setStatus('error'))
  }, [token])

  return (
    <>
      <Head>
        <title>FuelAlerts — You're confirmed!</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className={styles.page}>
        <div className={styles.orb1} />
        <div className={styles.orb2} />

        <nav className={styles.nav}>
          <div className={styles.logo}>
            <span>⛽</span>
            <span className={styles.logoText}>FuelAlerts</span>
          </div>
        </nav>

        <div className={styles.container}>
          {status === 'loading' && (
            <div className={styles.card}>
              <div className={styles.spinner} />
              <h1>Confirming your email…</h1>
              <p>Finding cheapest fuel near you too.</p>
            </div>
          )}

          {status === 'error' && (
            <div className={styles.card}>
              <div className={styles.iconError}>✕</div>
              <h1>Something went wrong</h1>
              <p>This confirmation link may have expired or already been used. Try signing up again and we'll send a fresh link.</p>
              <a href="/" className={styles.btn}>Try again →</a>
            </div>
          )}

          {status === 'success' && data && (
            <div className={styles.successWrap}>
              {/* Hero confirmation */}
              <div className={styles.successHero}>
                <div className={styles.iconSuccess}>✓</div>
                <h1>You're confirmed!</h1>
                <p>
                  Watching fuel prices within <strong>{data.radius_miles} miles</strong> of <strong>{data.postcode}</strong>.
                  Your first digest arrives Monday morning.
                </p>
              </div>

              {/* Live prices */}
              {data.stations && data.stations.length > 0 && (
                <div className={styles.pricesSection}>
                  <div className={styles.pricesHeader}>
                    <span className={styles.pricesLabel}>⚡ Live prices near you right now</span>
                    <span className={styles.pricesDate}>Updated today</span>
                  </div>

                  <div className={styles.stationsList}>
                    {data.stations.map((s, i) => (
                      <div key={i} className={`${styles.stationRow} ${i === 0 ? styles.stationRowBest : ''}`}>
                        <div className={styles.stationRank}>
                          {i === 0 ? '🏆' : `#${i + 1}`}
                          {s.logo_url && (
                            <img src={s.logo_url} alt="" style={{width:'36px',height:'24px',objectFit:'contain',marginTop:'4px'}} onError={e => e.target.style.display='none'} />
                          )}
                        </div>
                        <div className={styles.stationInfo}>
                          <div className={styles.stationName}>{s.display_name || s.trading_name || s.brand_name || 'Station'}</div>
                          <div className={styles.stationMeta}>
                            {s.address && <span>{s.address}</span>}
                            {s.distance_miles != null && (
                              <span className={styles.stationDist}>{s.distance_miles.toFixed(1)} miles away</span>
                            )}
                            <span className={styles.fuelBadge}>{FUEL_LABELS[s.fuel_type] || s.fuel_type}</span>
                          </div>
                        </div>
                        <div className={styles.stationPriceCol}>
                          <div className={`${styles.stationPrice} ${i === 0 ? styles.stationPriceBest : ''}`}>
                            {formatPrice(s.price)}
                          </div>
                          {i === 0 && (
                            <div className={styles.cheapestBadge}>Cheapest</div>
                          )}
                          {i > 0 && priceDiff(s.price, data.stations) && (
                            <div className={styles.priceDiff}>{priceDiff(s.price, data.stations)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {data.stations.length > 1 && (
                    <div className={styles.savingsTip}>
                      {(() => {
                        const priceDiffP = data.stations[data.stations.length - 1].price - data.stations[0].price
                        const tankSaving = (priceDiffP / 100) * 55
                        const annualSaving = data.annual_miles && data.mpg
                          ? (priceDiffP / 100) * ((data.annual_miles / data.mpg) * 4.546)
                          : null
                        return (
                          <>
                            💰 Choosing the cheapest over the priciest saves <strong>{priceDiffP.toFixed(1)}p/litre</strong>
                            {' '}— a full tank saves <strong>£{tankSaving.toFixed(2)}</strong>
                            {annualSaving && <>, and based on your mileage you could save <strong>~£{Math.round(annualSaving)}/yr</strong></>}
                          </>
                        )
                      })()}
                    </div>
                  )}

                  <ShareFuel
                    carMake={data.car_make}
                    stationName={data.stations?.[0]?.display_name}
                    price={data.stations?.[0]?.price}
                    fuelLabel={data.fuel_type === 'B7_STANDARD' ? 'diesel' : 'petrol'}
                    postcode={data.postcode}
                  />
                </div>
              )}

              {data.stations && data.stations.length === 0 && (
                <div className={styles.noStations}>
                  No stations found within {data.radius_miles} miles yet — your Monday digest will show results as data updates.
                </div>
              )}

              <a href="/" className={styles.btn}>Back to home →</a>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
