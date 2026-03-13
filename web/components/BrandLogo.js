// BrandLogo.js — uniform logo treatment across FuelAlerts
// White rounded square pill, consistent sizing everywhere

const SIZES = {
  sm:  { pill: 36, radius: 7  },
  md:  { pill: 48, radius: 10 },
  lg:  { pill: 60, radius: 12 },
}

export default function BrandLogo({ logoUrl, brandName, size = 'md' }) {
  const { pill, radius } = SIZES[size] || SIZES.md
  const initial = (brandName || '?').charAt(0).toUpperCase()

  return (
    <div style={{
      width:           `${pill}px`,
      height:          `${pill}px`,
      borderRadius:    `${radius}px`,
      background:      '#ffffff',
      boxShadow:       '0 2px 8px rgba(0,0,0,0.25), 0 1px 3px rgba(0,0,0,0.15)',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      overflow:        'hidden',
      flexShrink:      0,
    }}>
      {logoUrl
        ? <img
            src={logoUrl}
            alt={brandName || ''}
            style={{ width: '80%', height: '80%', objectFit: 'contain' }}
            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
          />
        : null
      }
      <div style={{
        display:         logoUrl ? 'none' : 'flex',
        alignItems:      'center',
        justifyContent:  'center',
        width:           '80%',
        height:          '80%',
        fontSize:        `${pill * 0.35}px`,
        fontWeight:      800,
        color:           '#1e2d4a',
        fontFamily:      'Syne, sans-serif',
      }}>
        {initial}
      </div>
    </div>
  )
}
