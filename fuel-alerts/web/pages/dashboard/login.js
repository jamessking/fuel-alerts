import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import styles from '../../styles/DashLogin.module.css'

export default function DashboardLogin() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Invalid email or password.')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <>
      <Head>
        <title>FuelAlerts — Dashboard Login</title>
      </Head>
      <div className={styles.page}>
        <div className={styles.orb1} />
        <div className={styles.orb2} />
        <div className={styles.card}>
          <div className={styles.logo}>
            <span>⛽</span>
            <span className={styles.logoText}>FuelAlerts</span>
          </div>
          <h1>Dashboard</h1>
          <p>Sign in to access your data dashboard</p>

          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.field}>
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <div className={styles.field}>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && <div className={styles.error}>{error}</div>}
            <button type="submit" className={styles.btn} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          <a href="/" className={styles.back}>← Back to FuelAlerts</a>
        </div>
      </div>
    </>
  )
}
