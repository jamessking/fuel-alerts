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
    const today = new Date()
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)
    const todayStr = today.toISOString().split('T')[0]
    const weekAgoStr = weekAgo.toISOString().split('T')[0]

    const [pricesRes, weekAgoRes, stationsRes] = await Promise.all([
      supabase
        .from('fuel_prices_daily')
        .select('node_id, fuel_type, price')
        .eq('snapshot_date', todayStr)
        .in('fuel_type', ['E10', 'B7', 'B7_STANDARD']),
      supabase
        .from('fuel_prices_daily')
        .select('node_id, fuel_type, price')
        .eq('snapshot_date', weekAgoStr)
        .in('fuel_type', ['E10', 'B7', 'B7_STANDARD']),
      supabase
        .from('pfs_stations')
        .select('node_id, country, is_motorway_service_station, is_supermarket_service_station'),
    ])

    if (pricesRes.error) throw pricesRes.error
    if (stationsRes.error) throw stationsRes.error

    const stationMap = {}
    for (const s of stationsRes.data) stationMap[s.node_id] = s

    const enrich = (rows) => rows.map(p => ({ ...p, station: stationMap[p.node_id] || {} }))
    const prices = enrich(pricesRes.data)
    const lastWeekPrices = enrich(weekAgoRes.data || [])

    const avg = (arr) => arr.length
      ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10
      : null

    const toP = (subset) => subset.map(p => parseFloat(p.price)).filter(Boolean)

    const build = (fuel) => {
      const fuelCodes = fuel === 'B7' ? ['B7', 'B7_STANDARD'] : [fuel]
      const rows = prices.filter(p => fuelCodes.includes(p.fuel_type))
      const lastRows = lastWeekPrices.filter(p => fuelCodes.includes(p.fuel_type))

      const byCountry = (src, country) =>
        src.filter(p => (p.station?.country || '').toLowerCase() === country.toLowerCase())

      const motorway = (s) => s.filter(p => p.station?.is_motorway_service_station === true)
      const supermarket = (s) => s.filter(p => p.station?.is_supermarket_service_station === true)
      const forecourt = (s) => s.filter(p => !p.station?.is_motorway_service_station && !p.station?.is_supermarket_service_station)

      const summary = (subset, lastSubset) => {
        const curAvg = avg(toP(subset))
        const prevAvg = avg(toP(lastSubset))
        const weekDelta = curAvg !== null && prevAvg !== null
          ? Math.round((curAvg - prevAvg) * 10) / 10
          : null
        return {
          avg: curAvg,
          weekDelta,
          motorway: avg(toP(motorway(subset))),
          supermarket: avg(toP(supermarket(subset))),
          forecourt: avg(toP(forecourt(subset))),
        }
      }

      return {
        uk:      summary(rows, lastRows),
        england: summary(byCountry(rows, 'england'), byCountry(lastRows, 'england')),
        scotland: summary(byCountry(rows, 'scotland'), byCountry(lastRows, 'scotland')),
        wales:   summary(byCountry(rows, 'wales'), byCountry(lastRows, 'wales')),
        ni:      summary(byCountry(rows, 'northern ireland'), byCountry(lastRows, 'northern ireland')),
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
