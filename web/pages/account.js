import Head from 'next/head'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'

const fmt = p => p != null ? `${parseFloat(p).toFixed(1)}p` : '—'
const FUEL_LABELS = { E10: 'Petrol (E10)', B7_STANDARD: 'Diesel', B7: 'Diesel', both: 'Both', petrol: 'Petrol (E10)', diesel: 'Diesel' }
const TABS = ['Overview', 'Map', 'Settings', 'Garage']

function Badge({ days, label }) {
  if (days == null) return <span style={{color:'#4a5a7a'}}>—</span>
  const expired = days < 0
  const warn = days >= 0 && days < 30
  const color = expired ? '#ff6b6b' : warn ? '#ffd93d' : '#00e676'
  const bg = expired ? '#ff6b6b18' : warn ? '#ffd93d18' : '#00e67618'
  const text = expired ? `Expired` : `${days}d`
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:'4px'}}>
      <span style={{color:'#8899bb',fontSize:'0.8rem'}}>{label}</span>
      <span style={{fontSize:'0.75rem',fontWeight:700,color,background:bg,padding:'2px 8px',borderRadius:'20px'}}>{text}</span>
    </span>
  )
}

function StatCard({ value, label, accent }) {
  return (
    <div style={{background:'#111827',border:'1px solid #1e2d4a',borderRadius:'16px',padding:'1.25rem',textAlign:'center',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',inset:0,background:`radial-gradient(circle at 50% 0%, ${accent}08 0%, transparent 70%)`}} />
      <div style={{fontSize:'1.8rem',fontWeight:900,color:accent,fontFamily:'monospace',letterSpacing:'-0.02em'}}>{value}</div>
      <div style={{fontSize:'0.7rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',color:'#4a5a7a',marginTop:'4px'}}>{label}</div>
    </div>
  )
}

function Section({ title, icon, children, action }) {
  return (
    <div style={{background:'#111827',border:'1px solid #1e2d4a',borderRadius:'16px',padding:'1.5rem',marginBottom:'1rem'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.25rem'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <span>{icon}</span>
          <span style={{fontSize:'0.7rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em',color:'#4a5a7a'}}>{title}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function StationRow({ s, isFav, onToggleFav }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:'0.75rem',padding:'0.65rem 0',borderBottom:'1px solid #0f1829'}}>
      <div style={{width:'44px',height:'24px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        {s.logo_url
          ? <img src={s.logo_url} alt="" style={{maxHeight:'22px',maxWidth:'44px',objectFit:'contain'}} onError={e=>e.target.style.display='none'} />
          : <div style={{width:'32px',height:'32px',borderRadius:'50%',background:'#1e2d4a',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.7rem',color:'#4a5a7a'}}>⛽</div>
        }
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:'0.9rem',fontWeight:600,color:'#f0f4ff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.display_name||s.brand_clean||s.trading_name}</div>
        <div style={{fontSize:'0.72rem',color:'#4a5a7a'}}>{s.postcode}</div>
      </div>
      <div style={{fontFamily:'monospace',fontSize:'1.05rem',fontWeight:800,color:'#00e676'}}>{fmt(s.price||s.petrol_price)}</div>
      {onToggleFav && (
        <button onClick={()=>onToggleFav(s.node_id,isFav)} style={{background:'none',border:'none',cursor:'pointer',fontSize:'1.1rem',color:isFav?'#ffd93d':'#2a3a5a',padding:'0 4px',flexShrink:0,lineHeight:1}}>
          {isFav?'★':'☆'}
        </button>
      )}
    </div>
  )
}

function FieldRow({ label, value, editing, editNode }) {
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.65rem 0',borderBottom:'1px solid #0f1829'}}>
      <span style={{fontSize:'0.82rem',color:'#4a5a7a',flexShrink:0}}>{label}</span>
      <span style={{fontSize:'0.88rem',color:'#f0f4ff',fontWeight:500,textAlign:'right'}}>
        {editing&&editNode ? editNode : (value||'—')}
      </span>
    </div>
  )
}

function MiniChart({ series }) {
  if (!series?.length) return null
  const w=600,h=90,pad={top:8,right:8,bottom:20,left:30}
  const iw=w-pad.left-pad.right, ih=h-pad.top-pad.bottom
  const vals=series.map(d=>d.avg).filter(Boolean)
  if(!vals.length) return null
  const minV=Math.floor(Math.min(...vals)-1), maxV=Math.ceil(Math.max(...vals)+1)
  const xS=i=>pad.left+(i/(series.length-1))*iw
  const yS=v=>pad.top+ih-((v-minV)/(maxV-minV))*ih
  const pts=series.map((d,i)=>d.avg!=null?`${xS(i)},${yS(d.avg)}`:null).filter(Boolean)
  const area=`M ${pts.join(' L ')} L ${xS(series.length-1)},${h} L ${xS(0)},${h} Z`
  const idxs=[0,Math.floor(series.length/2),series.length-1]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{width:'100%',display:'block'}}>
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00e676" stopOpacity="0.15"/>
          <stop offset="100%" stopColor="#00e676" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {[minV,maxV].map(v=>(
        <g key={v}>
          <line x1={pad.left} x2={w-pad.right} y1={yS(v)} y2={yS(v)} stroke="#1e2d4a" strokeWidth="1"/>
          <text x={pad.left-4} y={yS(v)+4} textAnchor="end" fontSize="9" fill="#4a5a7a">{v}p</text>
        </g>
      ))}
      {idxs.map(i=>(
        <text key={i} x={xS(i)} y={h-3} textAnchor="middle" fontSize="9" fill="#4a5a7a">{series[i]?.date?.slice(5)}</text>
      ))}
      {pts.length>1&&<path d={area} fill="url(#cg)"/>}
      {pts.length>1&&<path d={`M ${pts.join(' L ')}`} fill="none" stroke="#00e676" strokeWidth="2" strokeLinejoin="round"/>}
    </svg>
  )
}

const INPUT = {background:'#0a0f1e',border:'1px solid #1e2d4a',borderRadius:'8px',padding:'8px 12px',color:'#f0f4ff',fontSize:'0.88rem',outline:'none'}
const SEL = {...INPUT,cursor:'pointer'}
const BTN_P = {background:'#00e676',color:'#0a0f1e',fontWeight:800,fontSize:'0.82rem',border:'none',borderRadius:'8px',padding:'8px 18px',cursor:'pointer',letterSpacing:'0.02em'}
const BTN_S = {background:'transparent',color:'#8899bb',fontWeight:600,fontSize:'0.82rem',border:'1px solid #1e2d4a',borderRadius:'8px',padding:'8px 18px',cursor:'pointer'}
const BTN_SM = {background:'transparent',color:'#4a5a7a',fontWeight:700,fontSize:'0.75rem',border:'1px solid #1e2d4a',borderRadius:'6px',padding:'5px 12px',cursor:'pointer'}

export default function AccountPage() {
  const router = useRouter()
  const { token } = router.query
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [tab, setTab]         = useState('Overview')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const mapRef = useRef(null)
  const mapInstance = useRef(null)

  // Editable state
  const [postcode, setPostcode]           = useState('')
  const [radius, setRadius]               = useState('5')
  const [fuelType, setFuelType]           = useState('E10')
  const [address2Label, setAddress2Label] = useState('')
  const [address2, setAddress2]           = useState('')
  const [address2Radius, setAddress2Radius] = useState('5')
  const [threshold, setThreshold]         = useState('')
  const [annualMiles, setAnnualMiles]     = useState('')
  const [mpg, setMpg]                     = useState('')

  // Vehicle
  const [newReg, setNewReg]         = useState('')
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError]     = useState('')

  const loadData = () => {
    if (!token) return
    fetch(`/api/account?token=${token}`)
      .then(r=>r.json())
      .then(d=>{
        if(d.error){setError(d.error);setLoading(false);return}
        setData(d)
        const s=d.subscriber
        setPostcode(s.postcode||'')
        setRadius(String(s.radius_miles||5))
        setFuelType(s.fuel_type||'E10')
        setAddress2Label(s.address2_label||'')
        setAddress2(s.address2_postcode||'')
        setAddress2Radius(String(s.address2_radius_miles||5))
        setThreshold(s.price_alert_threshold?String(s.price_alert_threshold):'')
        setAnnualMiles(String(s.annual_miles||''))
        setMpg(String(s.mpg||''))
        setLoading(false)
      })
      .catch(()=>{setError('Failed to load account');setLoading(false)})
  }

  useEffect(()=>{loadData()},[token])

  // Map init when tab switches to Map
  useEffect(()=>{
    if(tab!=='Map'||!data||!mapRef.current||mapInstance.current) return
    if(typeof window==='undefined') return
    // Load Leaflet dynamically
    const link=document.createElement('link')
    link.rel='stylesheet'
    link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    const script=document.createElement('script')
    script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload=()=>{
      const L=window.L
      const s=data.subscriber
      const map=L.map(mapRef.current,{zoomControl:true}).setView([s.lat,s.lon],12)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{
        attribution:'&copy; OpenStreetMap &copy; CARTO',maxZoom:19
      }).addTo(map)
      // Home marker
      const homeIcon=L.divIcon({html:'<div style="background:#00e676;width:14px;height:14px;border-radius:50%;border:2px solid #0a0f1e;box-shadow:0 0 8px #00e676"></div>',iconSize:[14,14],iconAnchor:[7,7]})
      L.marker([s.lat,s.lon],{icon:homeIcon}).addTo(map).bindPopup(`<b>📍 ${s.postcode}</b>`)
      // Nearby stations
      for(const st of (data.nearby||[])){
        if(!st.latitude&&!st.longitude) continue
        const isFav=(data.favourites||[]).some(f=>f.node_id===st.node_id)
        const stIcon=L.divIcon({
          html:`<div style="background:${isFav?'#ffd93d':'#1e2d4a'};width:10px;height:10px;border-radius:50%;border:1.5px solid ${isFav?'#ffd93d':'#4a5a7a'}"></div>`,
          iconSize:[10,10],iconAnchor:[5,5]
        })
        L.marker([st.latitude||st.lat,st.longitude||st.lon],{icon:stIcon})
          .addTo(map)
          .bindPopup(`<b>${st.display_name}</b><br>${fmt(st.price)} · ${st.postcode}`)
      }
      mapInstance.current=map
    }
    document.head.appendChild(script)
  },[tab,data])

  const save = async () => {
    setSaving(true); setSaveMsg('')
    let lat=data.subscriber.lat, lon=data.subscriber.lon
    if(postcode.toUpperCase().replace(/\s/g,'')!==data.subscriber.postcode?.toUpperCase().replace(/\s/g,'')){
      const r=await fetch(`https://api.postcodes.io/postcodes/${postcode.replace(/\s/g,'')}`)
      const d=await r.json()
      if(d.status!==200){setSaveMsg('Invalid postcode');setSaving(false);return}
      lat=d.result.latitude; lon=d.result.longitude
    }
    let a2lat=data.subscriber.address2_lat, a2lon=data.subscriber.address2_lon
    if(address2&&address2.toUpperCase().replace(/\s/g,'')!==data.subscriber.address2_postcode?.toUpperCase().replace(/\s/g,'')){
      const r=await fetch(`https://api.postcodes.io/postcodes/${address2.replace(/\s/g,'')}`)
      const d=await r.json()
      if(d.status!==200){setSaveMsg('Invalid second postcode');setSaving(false);return}
      a2lat=d.result.latitude; a2lon=d.result.longitude
    }
    const res=await fetch(`/api/account?token=${token}`,{
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        token,postcode:postcode.toUpperCase(),lat,lon,
        radius_miles:parseInt(radius),fuel_type:fuelType,
        address2_postcode:address2||null,address2_lat:a2lat,address2_lon:a2lon,
        address2_radius_miles:parseInt(address2Radius),
        price_alert_threshold:threshold?parseFloat(threshold):null,
        annual_miles:annualMiles?parseInt(annualMiles):null,
        mpg:mpg?parseFloat(mpg):null,
      })
    })
    const result=await res.json()
    setSaving(false)
    if(res.ok){setSaveMsg('✓ Saved');setEditing(false);loadData()}
    else setSaveMsg(result.error||'Save failed')
  }

  const lookupReg = async () => {
    if(!newReg) return
    setRegLoading(true); setRegError('')
    try {
      const res=await fetch('/api/reg-lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reg:newReg})})
      const vData=await res.json()
      if(!res.ok){setRegError(vData.error||'Not found');setRegLoading(false);return}
      await fetch(`/api/account/vehicle?token=${token}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,vehicle:{reg:newReg,...vData}})})
      setNewReg(''); loadData()
    } catch { setRegError('Lookup failed') }
    finally { setRegLoading(false) }
  }

  const removeVehicle = async (vehicle_reg) => {
    await fetch(`/api/account/vehicle?token=${token}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,vehicle_reg})})
    loadData()
  }

  const toggleFav = async (node_id, isFav) => {
    await fetch(`/api/account/favourites?token=${token}`,{
      method:isFav?'DELETE':'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token,node_id})
    })
    loadData()
  }

  if(!token) return null

  if(loading) return (
    <div style={{minHeight:'100vh',background:'#0a0f1e',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:'2rem',marginBottom:'1rem'}}>⛽</div>
        <p style={{color:'#4a5a7a',fontFamily:'monospace'}}>Loading your account…</p>
      </div>
    </div>
  )

  if(error) return (
    <div style={{minHeight:'100vh',background:'#0a0f1e',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'1rem'}}>
      <p style={{color:'#ff6b6b'}}>{error==='Invalid or expired token'?'This sign-in link has expired.':error}</p>
      <Link href="/signin" style={{color:'#00e676',fontWeight:700}}>Get a new sign-in link →</Link>
    </div>
  )

  const { subscriber, vehicles, favourites, nearby, chartSeries, digestCount, savingsVsUk } = data
  const favIds = new Set((favourites||[]).map(f=>f.node_id))
  const daysSince = Math.floor((Date.now()-new Date(subscriber.created_at))/86400000)
  const savings = savingsVsUk != null && savingsVsUk > 0 ? `£${savingsVsUk}` : '—'

  return (
    <>
      <Head>
        <title>My Account — FuelAlerts</title>
        <meta name="robots" content="noindex"/>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #0a0f1e; color: #f0f4ff; font-family: 'Segoe UI', system-ui, sans-serif; }
          input:focus, select:focus { border-color: #00e676 !important; }
          .tab-btn { background: none; border: none; cursor: pointer; padding: 10px 20px; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #4a5a7a; border-bottom: 2px solid transparent; transition: all 0.2s; }
          .tab-btn:hover { color: #8899bb; }
          .tab-btn.active { color: #00e676; border-bottom-color: #00e676; }
          .vehicle-card { background: #0a0f1e; border: 1px solid #1e2d4a; border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 0.75rem; }
          .vehicle-card:hover { border-color: #2a3d5a; }
          @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
          .fade-in { animation: fadeIn 0.3s ease forwards; }
        `}</style>
      </Head>

      <div style={{minHeight:'100vh',background:'#0a0f1e'}}>

        {/* Nav */}
        <nav style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'1rem 1.5rem',borderBottom:'1px solid #1e2d4a',position:'sticky',top:0,background:'#0a0f1e',zIndex:100}}>
          <Link href="/" style={{textDecoration:'none',display:'flex',alignItems:'center',gap:'8px'}}>
            <span style={{fontSize:'1.3rem'}}>⛽</span>
            <span style={{fontWeight:900,color:'#f0f4ff',letterSpacing:'-0.02em'}}>FuelAlerts</span>
          </Link>
          <span style={{fontSize:'0.78rem',color:'#4a5a7a',fontFamily:'monospace'}}>{subscriber.email}</span>
        </nav>

        {/* Stats bar */}
        <div style={{background:'linear-gradient(180deg,#111827 0%,#0a0f1e 100%)',borderBottom:'1px solid #1e2d4a',padding:'1.5rem'}}>
          <div style={{maxWidth:'720px',margin:'0 auto',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'0.75rem'}}>
            <StatCard value={`${daysSince}d`}    label="Member for"        accent="#00e676"/>
            <StatCard value={digestCount||0}      label="Digests sent"      accent="#64b4ff"/>
            <StatCard value={savings}             label="Est. annual saving" accent="#ffd93d"/>
          </div>
        </div>

        {/* Tabs */}
        <div style={{borderBottom:'1px solid #1e2d4a',background:'#0a0f1e',position:'sticky',top:'57px',zIndex:99}}>
          <div style={{maxWidth:'720px',margin:'0 auto',display:'flex',gap:'0'}}>
            {TABS.map(t=>(
              <button key={t} className={`tab-btn${tab===t?' active':''}`} onClick={()=>setTab(t)}>{t}</button>
            ))}
          </div>
        </div>

        <div style={{maxWidth:'720px',margin:'0 auto',padding:'1.5rem 1rem 4rem'}} className="fade-in">

          {/* ── OVERVIEW TAB ── */}
          {tab==='Overview' && (
            <>
              {/* Price trend */}
              {chartSeries?.length>1 && (
                <Section title="Price trend — 30 days" icon="📈">
                  <MiniChart series={chartSeries}/>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:'0.5rem'}}>
                    <span style={{fontSize:'0.75rem',color:'#4a5a7a'}}>30 days ago: <span style={{color:'#f0f4ff',fontFamily:'monospace'}}>{fmt(chartSeries[0]?.avg)}</span></span>
                    <span style={{fontSize:'0.75rem',color:'#4a5a7a'}}>Today: <span style={{color:'#00e676',fontFamily:'monospace'}}>{fmt(chartSeries[chartSeries.length-1]?.avg)}</span></span>
                  </div>
                </Section>
              )}

              {/* Cheapest nearby */}
              <Section title="Cheapest near you now" icon="⛽"
                action={<span style={{fontSize:'0.75rem',color:'#4a5a7a'}}>{subscriber.postcode} · {subscriber.radius_miles}mi</span>}>
                {!(nearby?.length)
                  ? <p style={{color:'#4a5a7a',fontSize:'0.85rem'}}>No stations found nearby.</p>
                  : nearby.map(s=>(
                      <StationRow key={s.node_id} s={s} isFav={favIds.has(s.node_id)}
                        onToggleFav={(id,isFav)=>toggleFav(id,isFav)}/>
                    ))
                }
              </Section>

              {/* Favourites */}
              {(favourites?.length>0) && (
                <Section title="Favourite stations" icon="★">
                  {favourites.map(s=>(
                    <StationRow key={s.node_id} s={{...s,price:s.petrol_price,display_name:s.brand_clean||s.trading_name}}
                      isFav={true} onToggleFav={(id,isFav)=>toggleFav(id,isFav)}/>
                  ))}
                </Section>
              )}

              {/* Unsubscribe */}
              <div style={{textAlign:'center',marginTop:'2rem'}}>
                <Link href={`/unsubscribe?token=${token}`} style={{color:'#ff6b6b',fontSize:'0.8rem',fontWeight:600,textDecoration:'none',opacity:0.7}}>
                  Unsubscribe from FuelAlerts
                </Link>
              </div>
            </>
          )}

          {/* ── MAP TAB ── */}
          {tab==='Map' && (
            <Section title="Stations near you" icon="🗺">
              <div style={{display:'flex',gap:'1rem',marginBottom:'0.75rem',fontSize:'0.75rem',color:'#4a5a7a'}}>
                <span><span style={{color:'#00e676'}}>●</span> Your location</span>
                <span><span style={{color:'#ffd93d'}}>●</span> Favourites</span>
                <span><span style={{color:'#4a5a7a'}}>●</span> Nearby stations</span>
              </div>
              <div ref={mapRef} style={{height:'420px',borderRadius:'12px',overflow:'hidden',border:'1px solid #1e2d4a',background:'#0a0f1e'}}/>
            </Section>
          )}

          {/* ── SETTINGS TAB ── */}
          {tab==='Settings' && (
            <Section title="Alert settings" icon="📍"
              action={
                !editing
                  ? <button style={BTN_SM} onClick={()=>setEditing(true)}>Edit</button>
                  : <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
                      {saveMsg&&<span style={{fontSize:'0.78rem',color:saveMsg.startsWith('✓')?'#00e676':'#ff6b6b'}}>{saveMsg}</span>}
                      <button style={BTN_S} onClick={()=>{setEditing(false);setSaveMsg('')}}>Cancel</button>
                      <button style={BTN_P} onClick={save} disabled={saving}>{saving?'Saving…':'Save changes'}</button>
                    </div>
              }>

              <FieldRow label="Primary postcode" value={subscriber.postcode} editing={editing}
                editNode={<input style={{...INPUT,width:'130px'}} value={postcode} onChange={e=>setPostcode(e.target.value.toUpperCase())}/>}/>
              <FieldRow label="Radius" value={`${subscriber.radius_miles} miles`} editing={editing}
                editNode={<select style={{...SEL,width:'130px'}} value={radius} onChange={e=>setRadius(e.target.value)}>
                  {[1,2,3,5,10,15,20,25].map(r=><option key={r} value={r}>{r} miles</option>)}
                </select>}/>
              <FieldRow label="Fuel type" value={FUEL_LABELS[subscriber.fuel_type]||subscriber.fuel_type} editing={editing}
                editNode={<select style={{...SEL,width:'130px'}} value={fuelType} onChange={e=>setFuelType(e.target.value)}>
                  <option value="E10">Petrol (E10)</option>
                  <option value="B7_STANDARD">Diesel</option>
                  <option value="both">Both</option>
                </select>}/>
              <FieldRow label="Annual miles" value={subscriber.annual_miles?`${subscriber.annual_miles.toLocaleString()} miles`:null} editing={editing}
                editNode={<input style={{...INPUT,width:'130px'}} type="number" value={annualMiles} onChange={e=>setAnnualMiles(e.target.value)}/>}/>
              <FieldRow label="MPG" value={subscriber.mpg?`${subscriber.mpg} mpg`:null} editing={editing}
                editNode={<input style={{...INPUT,width:'130px'}} type="number" value={mpg} onChange={e=>setMpg(e.target.value)}/>}/>
              <FieldRow label="Price alert threshold" value={subscriber.price_alert_threshold?`${subscriber.price_alert_threshold}p`:'Not set'} editing={editing}
                editNode={<div style={{display:'flex',alignItems:'center',gap:'4px'}}>
                  <input style={{...INPUT,width:'90px'}} type="number" placeholder="e.g. 130" value={threshold} onChange={e=>setThreshold(e.target.value)}/>
                  <span style={{fontSize:'0.8rem',color:'#4a5a7a'}}>p/litre</span>
                </div>}/>

              <div style={{marginTop:'1.25rem',paddingTop:'1.25rem',borderTop:'1px solid #1e2d4a'}}>
                <div style={{fontSize:'0.7rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.1em',color:'#4a5a7a',marginBottom:'0.75rem'}}>Second address</div>
                <FieldRow label="Label" value={subscriber.address2_label||'Not set'} editing={editing}
                  editNode={<input style={{...INPUT,width:'130px'}} placeholder="e.g. Work" value={address2Label} onChange={e=>setAddress2Label(e.target.value)}/>}/>
                <FieldRow label="Postcode" value={subscriber.address2_postcode||'Not set'} editing={editing}
                  editNode={<input style={{...INPUT,width:'130px'}} placeholder="e.g. EC1A 1BB" value={address2} onChange={e=>setAddress2(e.target.value.toUpperCase())}/>}/>
                <FieldRow label="Radius" value={subscriber.address2_radius_miles?`${subscriber.address2_radius_miles} miles`:'5 miles'} editing={editing}
                  editNode={<select style={{...SEL,width:'130px'}} value={address2Radius} onChange={e=>setAddress2Radius(e.target.value)}>
                    {[1,2,3,5,10,15,20,25].map(r=><option key={r} value={r}>{r} miles</option>)}
                  </select>}/>
              </div>
            </Section>
          )}

          {/* ── GARAGE TAB ── */}
          {tab==='Garage' && (
            <>
              <Section title="Your vehicles" icon="🚗">
                {!(vehicles?.length)
                  ? <p style={{color:'#4a5a7a',fontSize:'0.85rem',marginBottom:'1rem'}}>No vehicles added yet.</p>
                  : vehicles.map(v=>{
                      const motDays=v.mot_expiry_date?Math.ceil((new Date(v.mot_expiry_date)-Date.now())/86400000):null
                      const taxDays=v.tax_due_date?Math.ceil((new Date(v.tax_due_date)-Date.now())/86400000):null
                      return (
                        <div key={v.id} className="vehicle-card">
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.75rem'}}>
                            <div>
                              <span style={{fontFamily:'monospace',fontWeight:900,fontSize:'1.1rem',color:'#f0f4ff',letterSpacing:'0.05em'}}>{v.vehicle_reg}</span>
                              <span style={{color:'#8899bb',marginLeft:'0.75rem',fontSize:'0.9rem'}}>{v.make} {v.year}</span>
                              {v.colour&&<span style={{color:'#4a5a7a',marginLeft:'0.5rem',fontSize:'0.82rem',textTransform:'capitalize'}}>{v.colour?.toLowerCase()}</span>}
                            </div>
                            <button onClick={()=>removeVehicle(v.vehicle_reg)} style={{background:'none',border:'none',cursor:'pointer',color:'#ff6b6b',fontSize:'0.75rem',opacity:0.6}}>Remove</button>
                          </div>
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem'}}>
                            <Badge days={motDays} label="MOT"/>
                            <Badge days={taxDays} label="Tax"/>
                          </div>
                          {(v.engine_capacity||v.co2_emissions||v.euro_status)&&(
                            <div style={{marginTop:'0.6rem',fontSize:'0.72rem',color:'#4a5a7a',display:'flex',gap:'1rem',flexWrap:'wrap'}}>
                              {v.engine_capacity&&<span>{v.engine_capacity}cc</span>}
                              {v.co2_emissions&&<span>{v.co2_emissions}g/km CO₂</span>}
                              {v.euro_status&&<span>{v.euro_status}</span>}
                              {v.fuel_type&&<span>{v.fuel_type}</span>}
                            </div>
                          )}
                        </div>
                      )
                    })
                }

                <div style={{display:'flex',gap:'0.5rem',marginTop:'1rem'}}>
                  <input
                    style={{...INPUT,flex:1,textTransform:'uppercase',fontFamily:'monospace',letterSpacing:'0.1em'}}
                    placeholder="Enter reg — e.g. AB12 CDE"
                    value={newReg}
                    onChange={e=>setNewReg(e.target.value.toUpperCase())}
                    onKeyDown={e=>e.key==='Enter'&&lookupReg()}
                  />
                  <button style={BTN_P} onClick={lookupReg} disabled={regLoading||!newReg}>
                    {regLoading?'…':'+ Add'}
                  </button>
                </div>
                {regError&&<p style={{color:'#ff6b6b',fontSize:'0.8rem',marginTop:'0.5rem'}}>{regError}</p>}
              </Section>
            </>
          )}

        </div>
      </div>
    </>
  )
}
