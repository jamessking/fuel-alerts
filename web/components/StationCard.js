import styles from './StationCard.module.css'

const AMENITY_ICONS = {
  adblue_packaged: { icon: '🟦', label: 'AdBlue' },
  adblue_pumps: { icon: '⛽', label: 'AdBlue Pump' },
  car_wash: { icon: '🚿', label: 'Car Wash' },
  customer_toilets: { icon: '🚻', label: 'Toilets' },
  water_filling: { icon: '💧', label: 'Water' },
  lpg_pumps: { icon: '🔵', label: 'LPG' },
  jet_wash: { icon: '💦', label: 'Jet Wash' },
  vacuum: { icon: '🌀', label: 'Vacuum' },
}

const FUEL_LABELS = {
  E10: 'Unleaded',
  B7_STANDARD: 'Diesel',
  B7: 'Diesel',
  E5: 'Super Unleaded',
  SDV: 'Super Diesel',
}

export default function StationCard({ station, rank, cheapestPrice }) {
  const isBest = rank === 0
  const diff = cheapestPrice && rank > 0
    ? (parseFloat(station.price) - parseFloat(cheapestPrice)).toFixed(1)
    : null

  return (
    <div className={`${styles.card} ${isBest ? styles.cardBest : ''}`}>
      {/* Rank + Logo */}
      <div className={styles.left}>
        <div className={styles.rank}>
          {isBest ? '🏆' : `#${rank + 1}`}
        </div>
        {station.logo_url && (
          <img
            src={station.logo_url}
            alt={station.brand_name || ''}
            className={styles.logo}
            onError={e => e.target.style.display = 'none'}
          />
        )}
      </div>

      {/* Station info */}
      <div className={styles.info}>
        <div className={styles.name}>{station.trading_name || station.brand_name || 'Station'}</div>
        <div className={styles.meta}>
          {station.postcode && <span>{station.postcode}</span>}
          {station.distance_miles != null && (
            <span className={styles.dist}>{parseFloat(station.distance_miles).toFixed(1)} mi</span>
          )}
          <span className={styles.fuelBadge}>{FUEL_LABELS[station.fuel_type] || station.fuel_type}</span>
        </div>

        {/* Amenity icons */}
        {station.amenities && station.amenities.length > 0 && (
          <div className={styles.amenities}>
            {station.amenities.map(a => {
              const item = AMENITY_ICONS[a]
              if (!item) return null
              return (
                <span key={a} className={styles.amenity} title={item.label}>
                  <img
                    src={`https://qwmdhhdxsxyfwyvvbzgg.supabase.co/storage/v1/object/public/logos/${a}.svg`}
                    alt={item.label}
                    className={styles.amenityIcon}
                    onError={e => {
                      e.target.style.display = 'none'
                      if (e.target.nextSibling) e.target.nextSibling.style.display = 'inline'
                    }}
                  />
                  <span style={{display:'none'}}>{item.icon}</span>
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* Price */}
      <div className={styles.priceCol}>
        <div className={`${styles.price} ${isBest ? styles.priceBest : ''}`}>
          {parseFloat(station.price).toFixed(1)}p
        </div>
        {isBest && <div className={styles.cheapestBadge}>Cheapest</div>}
        {diff && <div className={styles.priceDiff}>+{diff}p</div>}
      </div>
    </div>
  )
}
