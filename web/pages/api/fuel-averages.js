import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

let cache = null
let cacheTime = null
const CACHE_TTL_MS = 60 * 60 * 1000

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  if (cache && cacheTime && Date.now() - cacheTime < CACHE_TTL_MS) {
    return res.status(200).json(cache)
  }

  try {
    const today = new Date().toISOString().split('T')[0]

    // Fetch prices and stations separately then join in memory
    const [pricesRes, stationsRes] = await Promise.all([
      supabase
        .from('fuel_prices_daily')
        .select('node_id, fuel_type, price')
        .eq('snapshot_date', today)
        .in('fuel_type', ['E10', 'B7']),
      supabase
        .from('pfs_stations')
        .select('node_id, country, is_motorway_service_station, is_supermarket_service_station'),
    ])

    if (pricesRes.error) throw pricesRes.error
    if (stationsRes.error) throw stationsRes.error

    // Index stations by node_id
    const stationMap = {}
    for (const s of stationsRes.data) {
      stationMap[s.node_id] = s
    }

    // Join
    const prices = pricesRes.data.map(p => ({
      ...p,
      station: stationMap[p.node_id] || {},
    }))

    const avg = (arr) => arr.length
      ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10
      : null

    const build = (fuel) => {
      const rows = prices.filter(p => p.fuel_type === fuel)

      const byCountry = (country) =>
        rows.filter(p => (p.station?.country || '').toLowerCase() === country.toLowerCase())

      const motorway = (subset) => subset.filter(p => p.station?.is_motorway_service_station === true)
      const supermarket = (subset) => subset.filter(p => p.station?.is_supermarket_service_station === true)
      const forecourt = (subset) => subset.filter(p =>
        !p.station?.is_motorway_service_station && !p.station?.is_supermarket_service_station
      )
      const toP = (subset) => subset.map(p => parseFloat(p.price)).filter(Boolean)

      const summary = (subset) => ({
        avg: avg(toP(subset)),
        motorway: avg(toP(motorway(subset))),
        supermarket: avg(toP(supermarket(subset))),
        forecourt: avg(toP(forecourt(subset))),
      })

      return {
        uk: summary(rows),
        england: summary(byCountry('england')),
        scotland: summary(byCountry('scotland')),
        wales: summary(byCountry('wales')),
        ni: summary(byCountry('northern ireland')),
      }
    }

    cache = {
      unleaded: build('E10'),
      diesel: build('B7'),
      updatedAt: new Date().toISOString(),
    }
    cacheTime = Date.now()

    res.status(200).json(cache)
  } catch (err) {
    console.error('fuel-averages error:', err)
    res.status(500).json({ error: 'Failed to load price data' })
  }
}
