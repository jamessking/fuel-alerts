import Head from 'next/head'
import Link from 'next/link'
import { useState } from 'react'
import styles from '../styles/TownPage.module.css'

export default function SignIn() {
  const [email, setEmail]     = useState('')
  const [sent, setSent]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async () => {
    if (!email) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const data = await res.json()
      if (res.ok) setSent(true)
      else setError(data.error || 'Something went wrong')
    } catch {
      setError('Could not send sign-in link. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>Sign in — FuelAlerts</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div style={{minHeight: '100vh', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem'}}>
        <div style={{width: '100%', maxWidth: '420px'}}>
          <Link href="/" style={{textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2rem'}}>
            <span style={{fontSize: '1.5rem'}}>⛽</span>
            <span style={{fontWeight: 800, fontSize: '1.2rem', color: '#f0f4ff'}}>FuelAlerts</span>
          </Link>

          <div style={{background: '#111827', border: '1px solid #1e2d4a', borderRadius: '20px', padding: '2.5rem'}}>
            {sent ? (
              <>
                <div style={{fontSize: '2rem', marginBottom: '1rem'}}>📬</div>
                <h1 style={{fontSize: '1.4rem', fontWeight: 800, color: '#f0f4ff', marginBottom: '0.75rem'}}>Check your inbox</h1>
                <p style={{color: '#8899bb', lineHeight: 1.7, fontSize: '0.95rem'}}>
                  If <strong style={{color: '#f0f4ff'}}>{email}</strong> is registered, we've sent a sign-in link.
                  It expires in 15 minutes.
                </p>
                <p style={{color: '#4a5a7a', fontSize: '0.8rem', marginTop: '1.5rem'}}>
                  No email? Check your spam folder or <button onClick={() => setSent(false)} style={{background: 'none', border: 'none', color: '#00e676', cursor: 'pointer', fontSize: '0.8rem', padding: 0}}>try again</button>.
                </p>
              </>
            ) : (
              <>
                <h1 style={{fontSize: '1.4rem', fontWeight: 800, color: '#f0f4ff', marginBottom: '0.5rem'}}>Sign in to FuelAlerts</h1>
                <p style={{color: '#8899bb', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.6}}>
                  Enter your email and we'll send you a sign-in link — no password needed.
                </p>

                <div style={{marginBottom: '1rem'}}>
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: '#0a0f1e', border: '1px solid #1e2d4a',
                      borderRadius: '10px', padding: '12px 16px',
                      color: '#f0f4ff', fontSize: '1rem', outline: 'none',
                    }}
                  />
                </div>

                {error && <p style={{color: '#ff6b6b', fontSize: '0.85rem', marginBottom: '1rem'}}>{error}</p>}

                <button
                  onClick={handleSubmit}
                  disabled={loading || !email}
                  style={{
                    width: '100%', padding: '13px', borderRadius: '10px',
                    background: loading || !email ? '#1e2d4a' : '#00e676',
                    color: loading || !email ? '#4a5a7a' : '#0a0f1e',
                    fontWeight: 700, fontSize: '1rem', border: 'none',
                    cursor: loading || !email ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {loading ? 'Sending…' : 'Send sign-in link →'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
