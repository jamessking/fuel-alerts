/**
 * StationCard — reusable across town pages, front page, email preview
 *
 * Props:
 *   station       — station object (fuel_prices_daily joined with pfs_stations)
 *   rank          — number or null (1 shows trophy)
 *   showFuelBadge — bool, default true
 *   compact       — bool, smaller variant (hides amenities)
 */

import styles from '../styles/StationCard.module.css'

const AMENITY_META = {
  car_wash:                     { icon: '🚿', label: 'Car wash' },
  jet_wash:                     { icon: '💧', label: 'Jet wash' },
  customer_toilets:             { icon: '🚻', label: 'Toilets' },
  atm:                          { icon: '🏧', label: 'ATM' },
  adblue_packaged:              { icon: '🧪', label: 'AdBlue' },
  adblue_pump:                  { icon: '🧪', label: 'AdBlue pump' },
  air_and_water:                { icon: '💨', label: 'Air & water' },
  water_filling:                { icon: '💧', label: 'Water' },
  payphone:                     { icon: '📞', label: 'Payphone' },
  shop:                         { icon: '🛒', label: 'Shop' },
  food:                         { icon: '🍔', label: 'Food' },
  hgv_facilities:               { icon: '🚛', label: 'HGV' },
  electric_vehicle_fast_charge: { icon: '⚡', label: 'EV fast charge' },
  electric_vehicle_slow_charge: { icon: '🔌', label: 'EV charge' },
}

const fmt = p => p != null ? `${parseFloat(p).toFixed(1)}p` : '—'

function DirectionsBtn({ station }) {
  if (!station.latitude || !station.longitude) return null
  const url = `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}&travelmode=driving`
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={styles.directionsBtn}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="3 11 22 2 13 21 11 13 3 11"/>
      </svg>
      Directions
    </a>
  )
}

function LogoPill({ logoUrl, name }) {
  const initial = (name || '?')[0].toUpperCase()
  return (
    <div className={styles.logoPill}>
      {logoUrl
        ? <img src={logoUrl} alt="" className={styles.logoImg} onError={e => { e.target.style.display='none'; e.target.parentNode.querySelector('[data-fallback]').style.display='flex' }} />
        : null}
      <span data-fallback className={styles.logoFallback} style={logoUrl ? { display: 'none' } : {}}>
        {initial}
      </span>
    </div>
  )
}

export default function StationCard({ station: s, rank, showFuelBadge = true, compact = false }) {
  const isTop = rank === 1
  const amenities = Array.isArray(s.amenities) ? s.amenities : []

  const addressParts = [s.address, s.address2].filter(Boolean)
  const addressLine = addressParts.join(', ') || null

  return (
    <div className={[styles.card, isTop && styles.cardTop, compact && styles.cardCompact].filter(Boolean).join(' ')}>

      {/* Rank + Logo */}
      <div className={styles.left}>
        {rank != null && (
          <div className={styles.rank}>{isTop ? '🏆' : `#${rank}`}</div>
        )}
        <LogoPill logoUrl={s.logo_url} name={s.display_name || s.brand_name} />
      </div>

      {/* Info */}
      <div className={styles.centre}>
        <div className={styles.name}>
          {s.display_name || s.brand_name || s.trading_name || 'Station'}
        </div>

        <div className={styles.meta}>
          {addressLine && <span className={styles.address}>{addressLine}</span>}
          {s.postcode && <span className={styles.postcode}>{s.postcode}</span>}
          <DirectionsBtn station={s} />
        </div>

        <div className={styles.badges}>
          {showFuelBadge && (
            <span className={s.fuel_type === 'E10' ? styles.badgePetrol : styles.badgeDiesel}>
              {s.fuel_type === 'E10' ? 'Petrol' : 'Diesel'}
            </span>
          )}
          {s.is_supermarket_service_station && (
            <span className={styles.badgeSupermarket}>Supermarket</span>
          )}
          {s.is_motorway_service_station && (
            <span className={styles.badgeMotorway}>Motorway</span>
          )}
        </div>

        {!compact && amenities.length > 0 && (
          <div className={styles.amenities}>
            {amenities.map(key => {
              const m = AMENITY_META[key]
              return m ? (
                <span key={key} className={styles.amenity} title={m.label}>
                  <span className={styles.amenityIcon}>{m.icon}</span>
                  <span className={styles.amenityLabel}>{m.label}</span>
                </span>
              ) : null
            })}
          </div>
        )}
      </div>

      {/* Price */}
      <div className={styles.right}>
        <div className={[styles.price, isTop && styles.priceTop].filter(Boolean).join(' ')}>
          {fmt(s.price)}
        </div>
      </div>

    </div>
  )
}
