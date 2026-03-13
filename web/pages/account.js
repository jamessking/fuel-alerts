import Head from 'next/head'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'

const fmt = p => p != null ? `${parseFloat(p).toFixed(1)}p` : '—'

const FUEL_LABELS = { E10: 'Petrol (E10)', B7_STANDARD: 'Diesel', B7: 'Diesel', both: 'Both' }

function Section({ title, children }) {
  return (
    <div style={{background: '#111827', border: '1px solid #1e2d4a', borderRadius: '16px', padding: '1.5rem', marginBottom: '1rem'}}>
      <h2 style={{fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4a5a7a', marginBottom: '1.25rem'}}>{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, value, editing, editNode }) {
  return (
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #1e2d4a'}}>
      <span style={{fontSize: '0.85rem', color: '#4a5a7a'}}>{label}</span>
      <span style={{fontSize: '0.9rem', color: '#f0f4ff', fontWeight: 500}}>
        {editing && editNode ? editNode : (value ?? '—')}
      </span>
    </div>
  )
}

function MOTBadge({ days }) {
  if (days == null) return null
  const expired = days < 0
  const warn = days < 30
  const color = expired ? '#ff6b6b' : warn ? '#ffd93d' : '#00e676'
  const label = expired ? `Expired ${Math.abs(days)}d ago` : `${days}d remaining`
  return <span style={{fontSize: '0.75rem', fontWeight: 700, color, background: `${color}20`, padding: '2px 8px', borderRadius: '20px', marginLeft: '8px'}}>{label}</span>
}

export default function AccountPage() {
  const router = useRouter()
  const { token } = router.query

  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [saveMsg, setSaveMsg]   = useState('')
  const [editing, setEditing]   = useState(false)

  // Editable fields
  const [postcode, setPostcode]       = useState('')
  const [radius, setRadius]           = useState('')
  const [fuelType, setFuelType]       = useState('')
  const [address2, setAddress2]       = useState('')
  const [address2Radius, setAddress2Radius] = useState('')
  const [threshold, setThreshold]     = useState('')
  const [annualMiles, setAnnualMiles] = useState('')
  const [mpg, setMpg]                 = useState('')

  // Vehicle
  const [newReg, setNewReg]         = useState('')
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError]     = useState('')

  useEffect(() => {
    if (!token) return
    fetch(`/api/account?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setData(d)
        const s = d.subscriber
        setPostcode(s.postcode || '')
        setRadius(String(s.radius_miles || 5))
        setFuelType(s.fuel_type || 'E10')
        setAddress2(s.address2_postcode || '')
        setAddress2Radius(String(s.address2_radius_miles || 5))
        setThreshold(s.price_alert_threshold ? String(s.price_alert_threshold) : '')
        setAnnualMiles(String(s.annual_miles || ''))
        setMpg(String(s.mpg || ''))
        setLoading(false)
      })
      .catch(() => { setError('Failed to load account'); setLoading(false) })
  }, [token])

  const save = async () => {
    setSaving(true)
    setSaveMsg('')

    // Resolve postcode to lat/lon if changed
    let lat = data.subscriber.lat
    let lon = data.subscriber.lon
    if (postcode.toUpperCase() !== data.subscriber.postcode?.toUpperCase()) {
      const res = await fetch(`https://api.postcodes.io/postcodes/${postcode.replace(/\s/g, '')}`)
      const d = await res.json()
      if (d.status !== 200) { setSaveMsg('Invalid postcode'); setSaving(false); return }
      lat = d.result.latitude
      lon = d.result.longitude
    }

    // Resolve address2 if set
    let a2lat = data.subscriber.address2_lat
    let a2lon = data.subscriber.address2_lon
    if (address2 && address2.toUpperCase() !== data.subscriber.address2_postcode?.toUpperCase()) {
      const res = await fetch(`https://api.postcodes.io/postcodes/${address2.replace(/\s/g, '')}`)
      const d = await res.json()
      if (d.status !== 200) { setSaveMsg('Invalid second postcode'); setSaving(false); return }
      a2lat = d.result.latitude
      a2lon = d.result.longitude
    }

    const res = await fetch(`/api/account?token=${token}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        postcode: postcode.toUpperCase(),
        lat, lon,
        radius_miles: parseInt(radius),
        fuel_type: fuelType,
        address2_postcode: address2 || null,
        address2_lat: a2lat,
        address2_lon: a2lon,
        address2_radius_miles: parseInt(address2Radius),
        price_alert_threshold: threshold ? parseFloat(threshold) : null,
        annual_miles: annualMiles ? parseInt(annualMiles) : null,
        mpg: mpg ? parseFloat(mpg) : null,
      }),
    })

    const result = await res.json()
    setSaving(false)
    if (res.ok) {
      setSaveMsg('✓ Saved')
      setEditing(false)
      // Refresh data
      fetch(`/api/account?token=${token}`).then(r => r.json()).then(d => { if (!d.error) setData(d) })
    } else {
      setSaveMsg(result.error || 'Save failed')
    }
  }

  const lookupReg = async () => {
    if (!newReg) return
    setRegLoading(true)
    setRegError('')
    try {
      const res = await fetch('/api/reg-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reg: newReg }),
      })
      const vData = await res.json()
      if (!res.ok) { setRegError(vData.error || 'Not found'); setRegLoading(false); return }

      // Save vehicle
      await fetch(`/api/account/vehicle?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, vehicle: { reg: newReg, ...vData } }),
      })
      setNewReg('')
      // Refresh
      fetch(`/api/account?token=${token}`).then(r => r.json()).then(d => { if (!d.error) setData(d) })
    } catch {
      setRegError('Lookup failed')
    } finally {
      setRegLoading(false)
    }
  }

  const toggleFavourite = async (node_id, isFav) => {
    await fetch(`/api/account/favourites?token=${token}`, {
      method: isFav ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, node_id }),
    })
    fetch(`/api/account?token=${token}`).then(r => r.json()).then(d => { if (!d.error) setData(d) })
  }

  const navStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '1rem 1.5rem', borderBottom: '1px solid #1e2d4a', marginBottom: '1.5rem',
  }

  const inputStyle = {
    background: '#0a0f1e', border: '1px solid #1e2d4a', borderRadius: '8px',
    padding: '8px 12px', color: '#f0f4ff', fontSize: '0.9rem', outline: 'none', width: '140px',
  }

  const btnPrimary = {
    background: '#00e676', color: '#0a0f1e', fontWeight: 700, fontSize: '0.85rem',
    border: 'none', borderRadius: '8px', padding: '8px 18px', cursor: 'pointer',
  }

  const btnSecondary = {
    background: 'transparent', color: '#8899bb', fontWeight: 600, fontSize: '0.85rem',
    border: '1px solid #1e2d4a', borderRadius: '8px', padding: '8px 18px', cursor: 'pointer',
  }

  if (!token) return null

  if (loading) return (
    <div style={{minHeight: '100vh', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <p style={{color: '#8899bb'}}>Loading your account…</p>
    </div>
  )

  if (error) return (
    <div style={{minHeight: '100vh', background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem'}}>
      <p style={{color: '#ff6b6b'}}>{error === 'Invalid or expired token' ? 'This sign-in link has expired.' : error}</p>
      <Link href="/signin" style={{color: '#00e676', fontWeight: 700}}>Request a new sign-in link →</Link>
    </div>
  )

  const { subscriber, vehicles, favourites, nearby, chartSeries, digestCount, lastDigest, savingsVsUk } = data
  const favIds = new Set((favourites || []).map(f => f.node_id))

  const daysSince = Math.floor((Date.now() - new Date(subscriber.created_at)) / 86400000)

  return (
    <>
      <Head>
        <title>My Account — FuelAlerts</title>
        <meta name="robots" content="noindex" />
      </Head>

      <div style={{minHeight: '100vh', background: '#0a0f1e', color: '#f0f4ff', fontFamily: 'Arial, sans-serif'}}>
        <nav style={navStyle}>
          <Link href="/" style={{textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px'}}>
            <span style={{fontSize: '1.3rem'}}>⛽</span>
            <span style={{fontWeight: 800, color: '#f0f4ff'}}>FuelAlerts</span>
          </Link>
          <span style={{fontSize: '0.8rem', color: '#4a5a7a'}}>{subscriber.email}</span>
        </nav>

        <div style={{maxWidth: '680px', margin: '0 auto', padding: '0 1rem 4rem'}}>

          {/* Stats bar */}
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem'}}>
            {[
              { label: 'Member for', value: `${daysSince} days` },
              { label: 'Digests sent', value: digestCount },
              { label: 'Est. annual saving', value: savingsVsUk != null ? `£${savingsVsUk}` : '—' },
            ].map(s => (
              <div key={s.label} style={{background: '#111827', border: '1px solid #1e2d4a', borderRadius: '12px', padding: '1rem', textAlign: 'center'}}>
                <div style={{fontSize: '1.3rem', fontWeight: 800, color: '#00e676'}}>{s.value}</div>
                <div style={{fontSize: '0.7rem', color: '#4a5a7a', marginTop: '4px'}}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Alert settings */}
          <Section title="📍 Your Alert Settings">
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
              <span style={{fontSize: '0.85rem', color: '#8899bb'}}>Changes take effect for the next weekly digest.</span>
              {!editing
                ? <button style={btnSecondary} onClick={() => setEditing(true)}>Edit</button>
                : <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                    {saveMsg && <span style={{fontSize: '0.8rem', color: saveMsg.startsWith('✓') ? '#00e676' : '#ff6b6b'}}>{saveMsg}</span>}
                    <button style={btnSecondary} onClick={() => setEditing(false)}>Cancel</button>
                    <button style={btnPrimary} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                  </div>
              }
            </div>

            <Field label="Primary postcode" value={subscriber.postcode} editing={editing}
              editNode={<input style={inputStyle} value={postcode} onChange={e => setPostcode(e.target.value)} />} />
            <Field label="Radius" value={`${subscriber.radius_miles} miles`} editing={editing}
              editNode={
                <select style={inputStyle} value={radius} onChange={e => setRadius(e.target.value)}>
                  {[1,2,3,5,10,15,20,25].map(r => <option key={r} value={r}>{r} miles</option>)}
                </select>
              } />
            <Field label="Fuel type" value={FUEL_LABELS[subscriber.fuel_type] || subscriber.fuel_type} editing={editing}
              editNode={
                <select style={inputStyle} value={fuelType} onChange={e => setFuelType(e.target.value)}>
                  <option value="E10">Petrol (E10)</option>
                  <option value="B7_STANDARD">Diesel</option>
                  <option value="both">Both</option>
                </select>
              } />
            <Field label="Price alert threshold" value={subscriber.price_alert_threshold ? `${subscriber.price_alert_threshold}p` : 'Not set'} editing={editing}
              editNode={
                <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                  <input style={{...inputStyle, width: '80px'}} type="number" placeholder="e.g. 130" value={threshold} onChange={e => setThreshold(e.target.value)} />
                  <span style={{fontSize: '0.8rem', color: '#4a5a7a'}}>p</span>
                </div>
              } />

            <div style={{marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #1e2d4a'}}>
              <div style={{fontSize: '0.75rem', color: '#4a5a7a', marginBottom: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em'}}>Second address (optional)</div>
              <Field label="Postcode" value={subscriber.address2_postcode || 'Not set'} editing={editing}
                editNode={<input style={inputStyle} placeholder="e.g. W1A 1AA" value={address2} onChange={e => setAddress2(e.target.value)} />} />
              <Field label="Radius" value={subscriber.address2_radius_miles ? `${subscriber.address2_radius_miles} miles` : '5 miles'} editing={editing}
                editNode={
                  <select style={inputStyle} value={address2Radius} onChange={e => setAddress2Radius(e.target.value)}>
                    {[1,2,3,5,10,15,20,25].map(r => <option key={r} value={r}>{r} miles</option>)}
                  </select>
                } />
            </div>
          </Section>

          {/* Vehicles */}
          <Section title="🚗 Your Vehicles">
            {(vehicles || []).map(v => {
              const motDays = v.mot_expiry_date
                ? Math.ceil((new Date(v.mot_expiry_date) - Date.now()) / 86400000) : null
              const taxDays = v.tax_due_date
                ? Math.ceil((new Date(v.tax_due_date) - Date.now()) / 86400000) : null
              return (
                <div key={v.id} style={{background: '#0a0f1e', borderRadius: '10px', padding: '1rem', marginBottom: '0.75rem', border: '1px solid #1e2d4a'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                    <div>
                      <span style={{fontWeight: 700, fontSize: '1rem'}}>{v.vehicle_reg}</span>
                      <span style={{color: '#8899bb', marginLeft: '0.5rem', fontSize: '0.9rem'}}>{v.make} {v.year}</span>
                      {v.colour && <span style={{color: '#4a5a7a', marginLeft: '0.5rem', fontSize: '0.85rem'}}>{v.colour}</span>}
                    </div>
                  </div>
                  <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem'}}>
                    <span style={{fontSize: '0.8rem', color: '#8899bb'}}>
                      MOT: {v.mot_expiry_date || '—'}<MOTBadge days={motDays} />
                    </span>
                    <span style={{fontSize: '0.8rem', color: '#8899bb', marginLeft: '1rem'}}>
                      Tax: {v.tax_due_date || '—'}<MOTBadge days={taxDays} />
                    </span>
                  </div>
                  {v.engine_capacity && (
                    <div style={{fontSize: '0.75rem', color: '#4a5a7a', marginTop: '0.5rem'}}>
                      {v.engine_capacity}cc · {v.co2_emissions && `${v.co2_emissions}g/km CO₂ · `}{v.euro_status || ''}
                    </div>
                  )}
                </div>
              )
            })}

            <div style={{marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
              <input
                style={{...inputStyle, flex: 1}}
                placeholder="Add reg (e.g. AB12 CDE)"
                value={newReg}
                onChange={e => setNewReg(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && lookupReg()}
              />
              <button style={btnPrimary} onClick={lookupReg} disabled={regLoading || !newReg}>
                {regLoading ? '…' : '+ Add'}
              </button>
            </div>
            {regError && <p style={{color: '#ff6b6b', fontSize: '0.8rem', marginTop: '0.5rem'}}>{regError}</p>}
          </Section>

          {/* Price history chart */}
          {chartSeries?.length > 1 && (
            <Section title="📈 Local price trend — 30 days">
              <MiniChart series={chartSeries} />
            </Section>
          )}

          {/* Cheapest nearby right now */}
          <Section title="⛽ Cheapest near you right now">
            {(nearby || []).length === 0
              ? <p style={{color: '#4a5a7a', fontSize: '0.85rem'}}>No stations found nearby.</p>
              : (nearby).map(s => {
                  const isFav = favIds.has(s.node_id)
                  return (
                    <div key={s.node_id} style={{display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid #1e2d4a'}}>
                      <BrandLogo logoUrl={s.logo_url} brandName={s.display_name} size="sm" />
                      <div style={{flex: 1}}>
                        <div style={{fontSize: '0.9rem', fontWeight: 600}}>{s.display_name}</div>
                        <div style={{fontSize: '0.75rem', color: '#4a5a7a'}}>{s.postcode}</div>
                      </div>
                      <span style={{fontWeight: 800, color: '#00e676', fontSize: '1rem'}}>{fmt(s.price)}</span>
                      <button
                        onClick={() => toggleFavourite(s.node_id, isFav)}
                        title={isFav ? 'Remove favourite' : 'Add to favourites'}
                        style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '0 4px'}}
                      >{isFav ? '★' : '☆'}</button>
                    </div>
                  )
                })
            }
          </Section>

          {/* Favourite stations */}
          {(favourites || []).length > 0 && (
            <Section title="★ Favourite stations">
              {favourites.map(s => (
                <div key={s.node_id} style={{display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid #1e2d4a'}}>
                  <BrandLogo logoUrl={s.logo_url} brandName={s.display_name} size="sm" />
                  <div style={{flex: 1}}>
                    <div style={{fontSize: '0.9rem', fontWeight: 600}}>{s.brand_clean || s.trading_name}</div>
                    <div style={{fontSize: '0.75rem', color: '#4a5a7a'}}>{s.postcode}</div>
                  </div>
                  <div style={{textAlign: 'right'}}>
                    {s.petrol_price && <div style={{fontSize: '0.85rem', color: '#00e676'}}>⛽ {fmt(s.petrol_price)}</div>}
                    {s.diesel_price && <div style={{fontSize: '0.85rem', color: '#64b4ff'}}>🛢 {fmt(s.diesel_price)}</div>}
                  </div>
                  <button onClick={() => toggleFavourite(s.node_id, true)} style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#ffd93d'}}>★</button>
                </div>
              ))}
            </Section>
          )}

          {/* Danger zone */}
          <Section title="⚠️ Account">
            <Link
              href={`/unsubscribe?token=${token}`}
              style={{color: '#ff6b6b', fontSize: '0.85rem', fontWeight: 600}}
            >
              Unsubscribe from FuelAlerts
            </Link>
          </Section>

        </div>
      </div>
    </>
  )
}

function MiniChart({ series }) {
  const w = 600, h = 100, pad = { top: 8, right: 8, bottom: 24, left: 32 }
  const iw = w - pad.left - pad.right
  const ih = h - pad.top - pad.bottom
  const vals = series.map(d => d.avg).filter(Boolean)
  const minV = Math.floor(Math.min(...vals) - 1)
  const maxV = Math.ceil(Math.max(...vals) + 1)
  const xScale = i => pad.left + (i / (series.length - 1)) * iw
  const yScale = v => pad.top + ih - ((v - minV) / (maxV - minV)) * ih
  const pts = series.map((d, i) => d.avg != null ? `${xScale(i)},${yScale(d.avg)}` : null).filter(Boolean)
  const labelIdxs = [0, Math.floor(series.length / 2), series.length - 1]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{width: '100%', display: 'block'}}>
      {[minV, maxV].map(v => (
        <g key={v}>
          <line x1={pad.left} x2={w - pad.right} y1={yScale(v)} y2={yScale(v)} stroke="#1e2d4a" strokeWidth="1" />
          <text x={pad.left - 4} y={yScale(v) + 4} textAnchor="end" fontSize="9" fill="#4a5a7a">{v}p</text>
        </g>
      ))}
      {labelIdxs.map(i => (
        <text key={i} x={xScale(i)} y={h - 4} textAnchor="middle" fontSize="9" fill="#4a5a7a">{series[i].date.slice(5)}</text>
      ))}
      {pts.length > 1 && <path d={`M ${pts.join(' L ')}`} fill="none" stroke="#00e676" strokeWidth="2" strokeLinejoin="round" />}
    </svg>
  )
}
