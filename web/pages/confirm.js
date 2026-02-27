import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import styles from '../styles/Confirm.module.css'

export default function Confirm() {
  const router = useRouter()
  const { token } = router.query
  const [status, setStatus] = useState('loading') // loading | success | error

  useEffect(() => {
    if (!token) return
    fetch('/api/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) setStatus('error')
        else setStatus('success')
      })
      .catch(() => setStatus('error'))
  }, [token])

  return (
    <>
      <Head>
        <title>FuelAlerts — Confirming your subscription</title>
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
              <p>Just a moment.</p>
            </div>
          )}

          {status === 'success' && (
            <div className={styles.card}>
              <div className={styles.iconSuccess}>✓</div>
              <h1>You're confirmed!</h1>
              <p>Your FuelAlerts subscription is now active. We'll send your first weekly digest on Monday morning with the cheapest fuel stations near you.</p>
              <a href="/" className={styles.btn}>Back to home →</a>
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
        </div>
      </div>
    </>
  )
}
