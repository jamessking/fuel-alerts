import Head from 'next/head'
import { useState, useEffect, useRef } from 'react'
import styles from '../styles/Home.module.css'

export default function Home() {
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
  const [annualMiles, setAnnualMiles] = useState('')
  const [mpg, setMpg] = useState('')
  const [tankLitres, setTankLitres] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const postcodeTimer = useRef(null)

  // Postcode lookup with debounce
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

  // Reg lookup
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
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Subscription failed')
      setSubmitted(true)
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

  return (
    <>
      <Head>
        <title>FuelAlerts — Never Overpay for Petrol Again</title>
        <meta name="description" content="Free weekly alerts showing the cheapest fuel near you. Enter your postcode and we'll do the watching." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className={styles.page}>
        {/* Background orbs */}
        <div className={styles.orb1} />
        <div className={styles.orb2} />

        {/* Nav */}
        <nav className={styles.nav}>
          <div className={styles.logo}>
            <span className={styles.logoMark}>⛽</span>
            <span className={styles.logoText}>FuelAlerts</span>
          </div>
          <div className={styles.navBadge}>Free · No app needed</div>
        </nav>

        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={`${styles.pill} animate-fade-up delay-1`}>
              🇬🇧 UK Government fuel data · Updated daily
            </div>
            <h1 className={`${styles.heroTitle} animate-fade-up delay-2`}>
              Stop guessing.<br />
              <span className={styles.accent}>Start saving.</span>
            </h1>
            <p className={`${styles.heroSub} animate-fade-up delay-3`}>
              FuelAlerts watches 7,150+ UK fuel stations so you don't have to.
              Get the cheapest prices near you delivered to your inbox — before prices go up.
            </p>
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
                <span className={styles.statNum}>Free</span>
                <span className={styles.statLabel}>Always</span>
              </div>
            </div>
          </div>

          {/* Sign Up Form */}
          <div className={`${styles.formCard} animate-fade-up delay-3`}>
            {submitted ? (
              <div className={styles.successState}>
                <div className={styles.successIcon}>✓</div>
                <h3>You're on the list!</h3>
                <p>Check your inbox to confirm your email. Your first FuelAlert will arrive shortly after.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formHeader}>
                  <h2>Start saving today</h2>
                  <p>Takes 60 seconds. No app, no spam.</p>
                </div>

                {/* Postcode */}
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Your postcode</label>
                  <div className={styles.inputWrapper}>
                    <input
                      className={`${styles.input} ${postcodeInfo ? styles.inputValid : ''} ${postcodeError ? styles.inputError : ''}`}
                      type="text"
                      placeholder="e.g. NG1 1AA"
                      value={postcode}
                      onChange={e => setPostcode(e.target.value.toUpperCase())}
                      maxLength={8}
                    />
                    {postcodeLoading && <span className={styles.inputSpinner} />}
                    {postcodeInfo && <span className={styles.inputCheck}>✓</span>}
                  </div>
                  {postcodeInfo && (
                    <div className={styles.postcodeConfirm}>
                      📍 {postcodeInfo.town}
                    </div>
                  )}
                  {postcodeError && <div className={styles.fieldError}>{postcodeError}</div>}
                </div>

                {/* Fuel Type */}
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Fuel type</label>
                  <div className={styles.fuelButtons}>
                    {['petrol', 'diesel', 'both'].map(f => (
                      <button
                        key={f}
                        type="button"
                        className={`${styles.fuelBtn} ${fuelType === f ? styles.fuelBtnActive : ''}`}
                        onClick={() => setFuelType(f)}
                      >
                        {f === 'petrol' ? '⛽ Petrol' : f === 'diesel' ? '🛢 Diesel' : '⚡ Both'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Radius */}
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Search radius</label>
                  <div className={styles.radiusButtons}>
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

                {/* Optional: Reg Lookup */}
                <details className={styles.optionalSection}>
                  <summary className={styles.optionalToggle}>
                    🚗 Add your vehicle <span>(optional — unlocks savings estimates)</span>
                  </summary>
                  <div className={styles.optionalFields}>
                    <div className={styles.regRow}>
                      <div className={styles.inputWrapper} style={{flex: 1}}>
                        <input
                          className={styles.input}
                          type="text"
                          placeholder="e.g. AB12 CDE"
                          value={reg}
                          onChange={e => setReg(e.target.value.toUpperCase())}
                          maxLength={8}
                        />
                      </div>
                      <button
                        type="button"
                        className={styles.regLookupBtn}
                        onClick={lookupReg}
                        disabled={regLoading || !reg}
                      >
                        {regLoading ? '...' : 'Look up'}
                      </button>
                    </div>
                    {regError && <div className={styles.fieldError}>{regError}</div>}
                    {regInfo && (
                      <div className={styles.regResult}>
                        ✓ {regInfo.make} {regInfo.model} · {regInfo.year} · {regInfo.fuelType}
                      </div>
                    )}

                    <div className={styles.vehicleFields}>
                      <div className={styles.miniField}>
                        <label className={styles.labelSmall}>Annual miles</label>
                        <input className={styles.input} type="number" placeholder="e.g. 8000" value={annualMiles} onChange={e => setAnnualMiles(e.target.value)} />
                      </div>
                      <div className={styles.miniField}>
                        <label className={styles.labelSmall}>MPG</label>
                        <input className={styles.input} type="number" placeholder="e.g. 45" value={mpg} onChange={e => setMpg(e.target.value)} />
                      </div>
                      <div className={styles.miniField}>
                        <label className={styles.labelSmall}>Tank (litres)</label>
                        <input className={styles.input} type="number" placeholder="e.g. 55" value={tankLitres} onChange={e => setTankLitres(e.target.value)} />
                      </div>
                    </div>

                    {saving && (
                      <div className={styles.savingPreview}>
                        💰 If prices vary by 10p/litre near you, you could save <strong>~£{saving}/yr</strong> by always picking the cheapest station
                      </div>
                    )}
                  </div>
                </details>

                {/* Email */}
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Email address</label>
                  <input
                    className={styles.input}
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>

                {submitError && <div className={styles.submitError}>{submitError}</div>}

                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={submitting}
                >
                  {submitting ? 'Signing up...' : 'Get my free FuelAlerts →'}
                </button>

                <p className={styles.formFootnote}>
                  Free forever. Unsubscribe anytime. No app required.
                </p>
              </form>
            )}
          </div>
        </section>

        {/* How it works */}
        <section className={styles.howItWorks}>
          <div className={styles.sectionInner}>
            <div className={styles.sectionLabel}>How it works</div>
            <h2 className={styles.sectionTitle}>Prices sent to you.<br />Not the other way around.</h2>
            <div className={styles.steps}>
              {[
                { n: '01', title: 'Enter your postcode', desc: 'Tell us where you are and how far you\'re willing to travel for fuel.' },
                { n: '02', title: 'We watch the prices', desc: 'Our system pulls live data from 7,150+ stations daily, direct from government sources.' },
                { n: '03', title: 'You get an alert', desc: 'Weekly digest lands in your inbox showing the top 5 cheapest nearby stations — with exact prices.' },
              ].map(step => (
                <div key={step.n} className={styles.step}>
                  <div className={styles.stepNum}>{step.n}</div>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepDesc}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Why FuelAlerts */}
        <section className={styles.why}>
          <div className={styles.sectionInner}>
            <div className={styles.sectionLabel}>Why FuelAlerts</div>
            <h2 className={styles.sectionTitle}>Other apps make you check.<br />We just <span className={styles.accent}>tell you.</span></h2>
            <div className={styles.compareGrid}>
              <div className={styles.compareCol}>
                <div className={styles.compareHeader}>
                  <span className={styles.compareLabelBad}>Other fuel apps</span>
                </div>
                {['Open the app to check', 'Remember to look before each fill-up', 'Download required', 'Cluttered with offers & ads', 'No savings calculation'].map(item => (
                  <div key={item} className={styles.compareItem}>
                    <span className={styles.crossIcon}>✕</span> {item}
                  </div>
                ))}
              </div>
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

        {/* Data trust */}
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
              Get started free →
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
