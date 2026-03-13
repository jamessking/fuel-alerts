import { useState, useEffect } from 'react'
import styles from './ShareFuel.module.css'

export default function ShareFuel({ carMake, stationName, price, fuelLabel = 'fuel', postcode }) {
  const [copied, setCopied]     = useState(false)
  const [hasNative, setHasNative] = useState(false)

  useEffect(() => { setHasNative(!!navigator?.share) }, [])

  const priceStr = price ? `${parseFloat(price).toFixed(1)}p/litre` : null
  const url      = 'https://fuelalert.co.uk'

  const message = carMake && stationName && priceStr
    ? `I found ${fuelLabel} for my ${carMake} at ${stationName} for ${priceStr} — check your area and let me know if you find cheaper! 😉\n${url}`
    : stationName && priceStr
    ? `Found ${fuelLabel} at ${stationName} for ${priceStr} near ${postcode} — check your area and let me know if you find cheaper! 😉\n${url}`
    : `Tracking the cheapest ${fuelLabel} prices near ${postcode} with FuelAlerts — free at ${url}`

  const enc = encodeURIComponent(message)

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: 'FuelAlerts', text: message, url })
    } catch {}
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div className={styles.shareWrap}>
      <div className={styles.shareLabel}>⚡ Help a friend save too</div>
      <div className={styles.shareMessage}>"{message}"</div>
      <div className={styles.shareBtns}>

        {/* Native OS share — primary button on mobile, shown first */}
        {hasNative && (
          <button
            className={`${styles.shareBtn} ${styles.shareBtnNative}`}
            onClick={handleNativeShare}
          >
            <ShareIcon /> Share
          </button>
        )}

        {/* WhatsApp — always shown */}
        <a
          className={`${styles.shareBtn} ${styles.shareBtnWA}`}
          href={`https://wa.me/?text=${enc}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <WAIcon /> WhatsApp
        </a>

        {/* iMessage / SMS — always shown */}
        <a
          className={`${styles.shareBtn} ${styles.shareBtnSMS}`}
          href={`sms:?body=${enc}`}
        >
          <MsgIcon /> iMessage
        </a>

        {/* Facebook — always shown */}
        <a
          className={`${styles.shareBtn} ${styles.shareBtnFB}`}
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${enc}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <FBIcon /> Facebook
        </a>

        {/* Copy — shown when no native share, or as fallback */}
        <button
          className={`${styles.shareBtn} ${styles.shareBtnCopy}`}
          onClick={handleCopy}
        >
          {copied ? '✓ Copied!' : <><ClipIcon /> Copy</>}
        </button>

      </div>
    </div>
  )
}

// Icons
const ShareIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
)

const WAIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

const MsgIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)

const FBIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
)

const ClipIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
)
