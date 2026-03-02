import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

async function getFuelNews() {
  try {
    const res = await fetch('https://feeds.bbci.co.uk/news/business/rss.xml', {
      headers: { 'User-Agent': 'FuelAlerts/1.0' }
    })
    const xml = await res.text()
    
    // Parse RSS items
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    const fuelKeywords = ['fuel', 'petrol', 'diesel', 'oil', 'energy', 'price', 'pump']
    
    const fuelItems = items
      .map(m => {
        const title = m[1].match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
                      m[1].match(/<title>(.*?)<\/title>/)?.[1] || ''
        const desc = m[1].match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ||
                     m[1].match(/<description>(.*?)<\/description>/)?.[1] || ''
        const link = m[1].match(/<link>(.*?)<\/link>/)?.[1] || '#'
        const pubDate = m[1].match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
        return { title, desc, link, pubDate }
      })
      .filter(item =>
        fuelKeywords.some(kw =>
          item.title.toLowerCase().includes(kw) ||
          item.desc.toLowerCase().includes(kw)
        )
      )
      .slice(0, 2)

    // Fall back to top 2 business headlines if no fuel news
    if (fuelItems.length === 0) {
      return items.slice(0, 2).map(m => {
        const title = m[1].match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
                      m[1].match(/<title>(.*?)<\/title>/)?.[1] || ''
        const desc = m[1].match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ||
                     m[1].match(/<description>(.*?)<\/description>/)?.[1] || ''
        const link = m[1].match(/<link>(.*?)<\/link>/)?.[1] || '#'
        return { title, desc, link }
      })
    }

    return fuelItems
  } catch {
    return []
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = req.method === 'GET' ? req.query.token : req.body.token
  if (!token) return res.status(400).json({ error: 'No token provided' })

  // Try plain token first (new subscribers), fall back to hash lookup (old subscribers)
  let subscriber = null
  let error = null

  const byToken = await supabase
    .from('subscribers')
    .select('id, status, lat, lon, fuel_type, radius_miles, postcode, created_at')
    .eq('unsubscribe_token', token)
    .single()

  if (byToken.data) {
    subscriber = byToken.data
  } else {
    // Legacy: token in URL is raw, hash it to find old-style subscribers
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const byHash = await supabase
      .from('subscribers')
      .select('id, status, lat, lon, fuel_type, radius_miles, postcode, created_at')
      .eq('unsubscribe_token_hash', tokenHash)
      .single()
    subscriber = byHash.data
    error = byHash.error
  }

  if (error || !subscriber) {
    return res.status(404).json({ error: 'Invalid unsubscribe link.' })
  }

  // GET = load the page data (don't unsubscribe yet)
  if (req.method === 'GET') {
    // Current cheapest nearby
    const fuelTypes = subscriber.fuel_type === 'both'
      ? ['E10', 'B7_STANDARD']
      : subscriber.fuel_type === 'petrol' ? ['E10'] : ['B7_STANDARD']

    let currentStations = []
    for (const ft of fuelTypes) {
      const { data } = await supabase.rpc('top5_cheapest_nearby', {
        lat: subscriber.lat,
        lon: subscriber.lon,
        radius_miles: subscriber.radius_miles,
        fuel: ft,
      })
      if (data) currentStations = currentStations.concat(data.map(s => ({ ...s, fuel_type: ft })))
    }
    currentStations.sort((a, b) => a.price - b.price)
    const cheapestNow = currentStations[0] || null

    // Price when they subscribed - UK average around signup date
    const signupDate = subscriber.created_at.split('T')[0]
    const weekLater = new Date(new Date(signupDate).getTime() + 7 * 86400000).toISOString().split('T')[0]
    const { data: historicPrices } = await supabase
      .from('fuel_prices_daily')
      .select('price')
      .in('fuel_type', fuelTypes)
      .gte('snapshot_date', signupDate)
      .lte('snapshot_date', weekLater)
      .limit(500)

    let signupPrice = null
    if (historicPrices && historicPrices.length > 0) {
      const avg = historicPrices.reduce((sum, r) => sum + parseFloat(r.price), 0) / historicPrices.length
      signupPrice = avg
    }

    // Enrich cheapestNow with logo and amenities
    if (cheapestNow) {
      const { data: stationDetails } = await supabase
        .from('pfs_stations')
        .select('node_id, logo_url, amenities')
        .eq('node_id', cheapestNow.node_id)
        .single()
      if (stationDetails) {
        cheapestNow.logo_url = stationDetails.logo_url
        cheapestNow.amenities = stationDetails.amenities
      }
    }

    const news = await getFuelNews()

    return res.status(200).json({
      postcode: subscriber.postcode,
      fuel_type: subscriber.fuel_type,
      created_at: subscriber.created_at,
      cheapestNow,
      signupPrice,
      news,
      alreadyUnsubscribed: subscriber.status === 'unsubscribed',
    })
  }

  // POST = confirm unsubscribe
  if (subscriber.status === 'unsubscribed') {
    return res.status(200).json({ message: 'Already unsubscribed.' })
  }

  const { error: updateError } = await supabase
    .from('subscribers')
    .update({
      status: 'unsubscribed',
      unsubscribed_at: new Date().toISOString(),
    })
    .eq('id', subscriber.id)

  if (updateError) {
    return res.status(500).json({ error: 'Failed to unsubscribe.' })
  }

  return res.status(200).json({ message: 'Unsubscribed successfully.' })
}
