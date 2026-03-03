import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// Cache in memory — resets on Vercel cold start but good enough for daily data
let cache = null
let cacheTime = null
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  // Return cached data if fresh
  if (cache && cacheTime && Date.now() - cacheTime < CACHE_TTL_MS) {
    return res.status(200).json(cache)
  }

  try {
    // Get today's prices joined with station country data
    const today = new Date().toISOString().split('T')[0]

    const { data: prices, error } = await supabase
      .from('fuel_prices_daily')
      .select(`
        fuel_type,
        price,
        pfs_stations!inner(country, is_motorway_service_station, is_supermarket_service_station)
      `)
      .eq('snapshot_date', today)
      .in('fuel_type', ['E10', 'B7'])

    if (error) throw error

    // Helper to avg prices
    const avg = (arr) => arr.length
      ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10
      : null

    const build = (fuel) => {
      const rows = prices.filter(p => p.fuel_type === fuel)

      const byCountry = (country) =>
        rows.filter(p => (p.pfs_stations?.country || '').toUpperCase() === country.toUpperCase())

      const motorway = (subset) =>
        subset.filter(p => p.pfs_stations?.is_motorway_service_station === true)

      const supermarket = (subset) =>
        subset.filter(p => p.pfs_stations?.is_supermarket_service_station === true)

      const forecourt = (subset) =>
        subset.filter(p =>
          !p.pfs_stations?.is_motorway_service_station &&
          !p.pfs_stations?.is_supermarket_service_station
        )

      const toP = (subset) => subset.map(p => parseFloat(p.price)).filter(Boolean)

      const summary = (subset) => ({
        avg: avg(toP(subset)),
        motorway: avg(toP(motorway(subset))),
        supermarket: avg(toP(supermarket(subset))),
        forecourt: avg(toP(forecourt(subset))),
      })

      const england = byCountry('England')
      const scotland = byCountry('Scotland')
      const wales = byCountry('Wales')
      const ni = byCountry('Northern Ireland')

      return {
        uk: summary(rows),
        england: summary(england),
        scotland: summary(scotland),
        wales: summary(wales),
        ni: summary(ni),
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
