import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import styles from '../styles/Unsubscribe.module.css'

const FUEL_LABELS = {
  E10: 'Petrol (E10)',
  B7_STANDARD: 'Diesel (B7)',
  both: 'Petrol & Diesel',
  petrol: 'Petrol',
  diesel: 'Diesel',
}

function formatPrice(p) {
  if (!p) return null
  return `${parseFloat(p).toFixed(1)}p`
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function Unsubscribe() {
  const router = useRouter()
  const { token } = router.query

  const [status, setStatus] = useState('loading') // loading | confirm | done | error | already
  const [data, setData] = useState(null)
  const [unsubbing, setUnsubbing] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/unsubscribe?token=${token}`)
      .then(res => res.json())
      .then(d => {
        if (d.error) { setStatus('error'); return }
        if (d.alreadyUnsubscribed) { setStatus('already'); return }
        setData(d)
        setStatus('confirm')
      })
      .catch(() => setStatus('error'))
  }, [token])

  const handleUnsubscribe = async () => {
    setUnsubbing(true)
    try {
      const res = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const d = await res.json()
      if (d.error) setStatus('error')
      else setStatus('done')
    } catch {
      setStatus('error')
    } finally {
      setUnsubbing(false)
    }
  }

  const priceDiff = data?.cheapestNow && data?.signupPrice
    ? (parseFloat(data.cheapestNow.price) - data.signupPrice).toFixed(1)
    : null

  return (
    <>
      <Head>
        <title>FuelAlerts — Unsubscribe</title>
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
              <h1>Loading your account…</h1>
            </div>
          )}

          {status === 'error' && (
            <div className={styles.card}>
              <div className={styles.iconError}>✕</div>
              <h1>Invalid link</h1>
              <p>This unsubscribe link may have expired. Contact us if you need help.</p>
              <a href="/" className={styles.btnSecondary}>Back to home</a>
            </div>
          )}

          {status === 'already' && (
            <div className={styles.card}>
              <div className={styles.iconNeutral}>✓</div>
              <h1>Already unsubscribed</h1>
              <p>You're not receiving any FuelAlerts emails. Changed your mind?</p>
              <a href="/" className={styles.btnGreen}>Resubscribe →</a>
            </div>
          )}

          {status === 'done' && (
            <div className={styles.card}>
              <div className={styles.iconNeutral}>👋</div>
              <h1>You've been unsubscribed</h1>
              <p>Sorry to see you go. You won't receive any more FuelAlerts emails.</p>
              <p className={styles.resubText}>Changed your mind?</p>
              <a href="/" className={styles.btnGreen}>Resubscribe for free →</a>
            </div>
          )}

          {status === 'confirm' && data && (
            <div className={styles.confirmWrap}>

              {/* Header */}
              <div className={styles.confirmHeader}>
                <div className={styles.iconWarning}>⚠️</div>
                <h1>Before you go…</h1>
                <p>You've been subscribed since <strong>{formatDate(data.created_at)}</strong>, watching <strong>{FUEL_LABELS[data.fuel_type]}</strong> prices within your area of <strong>{data.postcode}</strong>.</p>
              </div>

              {/* Price comparison */}
              {data.cheapestNow && (
                <div className={styles.priceCard}>
                  <div className={styles.priceCardHeader}>⛽ Fuel prices near you</div>
                  <div className={styles.priceComparison}>
                    {data.signupPrice && (
                      <div className={styles.priceCol}>
                        <div className={styles.priceColLabel}>When you joined</div>
                        <div className={styles.priceColValue}>{formatPrice(data.signupPrice)}</div>
                        <div className={styles.priceColSub}>avg. nearby</div>
                      </div>
                    )}
                    {data.signupPrice && priceDiff && (
                      <div className={styles.priceDiffCol}>
                        <div className={`${styles.priceDiffBadge} ${parseFloat(priceDiff) < 0 ? styles.priceDiffDown : styles.priceDiffUp}`}>
                          {parseFloat(priceDiff) < 0 ? '↓' : '↑'} {Math.abs(priceDiff)}p
                        </div>
                        <div className={styles.priceDiffLabel}>
                          {parseFloat(priceDiff) < 0 ? 'cheaper now' : 'more expensive'}
                        </div>
                      </div>
                    )}
                    <div className={styles.priceCol}>
                      <div className={styles.priceColLabel}>Cheapest nearby now</div>
                      <div className={`${styles.priceColValue} ${styles.priceColGreen}`}>
                        {formatPrice(data.cheapestNow.price)}
                      </div>
                      <div className={styles.priceColSub}>{data.cheapestNow.trading_name}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* BBC News */}
              {data.news && data.news.length > 0 && (
                <div className={styles.newsCard}>
                  <div className={styles.newsHeader}>
                    <span className={styles.bbcBadge}>BBC</span>
                    <span className={styles.newsHeaderLabel}>Latest fuel & energy news</span>
                  </div>
                  {data.news.map((item, i) => (
                    <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" className={styles.newsItem}>
                      <div className={styles.newsTitle}>{item.title}</div>
                      {item.desc && <div className={styles.newsDesc}>{item.desc.replace(/<[^>]+>/g, '').slice(0, 120)}…</div>}
                    </a>
                  ))}
                </div>
              )}

              {/* CTA */}
              <div className={styles.ctaCard}>
                <p className={styles.ctaText}>We'll keep watching prices every day. Your Monday digest takes 30 seconds to read and could save you money every time you fill up.</p>
                <div className={styles.ctaButtons}>
                  <a href="/" className={styles.btnGreen}>Keep my alerts ✓</a>
                  <button
                    className={styles.btnDanger}
                    onClick={handleUnsubscribe}
                    disabled={unsubbing}
                  >
                    {unsubbing ? 'Unsubscribing…' : 'Yes, unsubscribe me'}
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </>
  )
}
