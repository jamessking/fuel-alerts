import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

let cache = null
let cacheTime = null
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

async function getLatestSnapshotDate() {
  const { data } = await supabase
    .from('fuel_prices_daily')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()
  return data?.snapshot_date || new Date().toISOString().split('T')[0]
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  if (cache && cacheTime && Date.now() - cacheTime < CACHE_TTL_MS) {
    res.setHeader('X-Cache', 'HIT')
    return res.status(200).json(cache)
  }

  try {
    const todayStr = await getLatestSnapshotDate()
    const weekAgoStr = new Date(new Date(todayStr).getTime() - 7 * 86400000)
      .toISOString().split('T')[0]

    // Country averages + supermarket brand averages in parallel
    const [avgRes, superRes] = await Promise.all([
      supabase.rpc('get_fuel_averages', {
        p_today:    todayStr,
        p_week_ago: weekAgoStr,
      }),
      supabase.rpc('get_supermarket_brand_averages', {
        p_today: todayStr,
      }),
    ])

    if (avgRes.error) throw avgRes.error

    const rows = avgRes.data || []

    // Index by lowercase country -> fuel_type
    const idx = {}
    for (const r of rows) {
      const key = r.country.toLowerCase()
      if (!idx[key]) idx[key] = {}
      idx[key][r.fuel_type] = r
    }

    const diesel = (country) => {
      const b7  = idx[country]?.['B7']
      const b7s = idx[country]?.['B7_STANDARD']
      if (b7 && b7s) {
        const avg = (a, b) => a != null && b != null
          ? Math.round(((parseFloat(a) + parseFloat(b)) / 2) * 10) / 10
          : parseFloat(a ?? b)
        return {
          avg:         avg(b7.avg_price, b7s.avg_price),
          weekDelta:   avg(b7.avg_price, b7s.avg_price) != null && avg(b7.avg_price_week_ago, b7s.avg_price_week_ago) != null
            ? Math.round((avg(b7.avg_price, b7s.avg_price) - avg(b7.avg_price_week_ago, b7s.avg_price_week_ago)) * 10) / 10 : null,
          motorway:    avg(b7.avg_motorway,    b7s.avg_motorway),
          supermarket: avg(b7.avg_supermarket, b7s.avg_supermarket),
          forecourt:   avg(b7.avg_forecourt,   b7s.avg_forecourt),
        }
      }
      const src = b7s || b7
      if (!src) return { avg: null, weekDelta: null, motorway: null, supermarket: null, forecourt: null }
      return {
        avg:         src.avg_price        != null ? parseFloat(src.avg_price)        : null,
        weekDelta:   src.avg_price != null && src.avg_price_week_ago != null
          ? Math.round((parseFloat(src.avg_price) - parseFloat(src.avg_price_week_ago)) * 10) / 10 : null,
        motorway:    src.avg_motorway     != null ? parseFloat(src.avg_motorway)     : null,
        supermarket: src.avg_supermarket  != null ? parseFloat(src.avg_supermarket)  : null,
        forecourt:   src.avg_forecourt    != null ? parseFloat(src.avg_forecourt)    : null,
      }
    }

    const petrol = (country) => {
      const src = idx[country]?.['E10']
      if (!src) return { avg: null, weekDelta: null, motorway: null, supermarket: null, forecourt: null }
      return {
        avg:         src.avg_price        != null ? parseFloat(src.avg_price)        : null,
        weekDelta:   src.avg_price != null && src.avg_price_week_ago != null
          ? Math.round((parseFloat(src.avg_price) - parseFloat(src.avg_price_week_ago)) * 10) / 10 : null,
        motorway:    src.avg_motorway     != null ? parseFloat(src.avg_motorway)     : null,
        supermarket: src.avg_supermarket  != null ? parseFloat(src.avg_supermarket)  : null,
        forecourt:   src.avg_forecourt    != null ? parseFloat(src.avg_forecourt)    : null,
      }
    }

    // UK = average of all four countries
    const ukAggregate = (fuelFn) => {
      const countries = ['england', 'scotland', 'wales', 'northern ireland']
      const stats = countries.map(c => fuelFn(c)).filter(s => s.avg != null)
      if (!stats.length) return { avg: null, weekDelta: null, motorway: null, supermarket: null, forecourt: null }
      const mean = arr => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10 : null
      const deltas = stats.map(s => s.weekDelta).filter(d => d != null)
      return {
        avg:         mean(stats.map(s => s.avg)),
        weekDelta:   deltas.length ? Math.round(deltas.reduce((s, v) => s + v, 0) / deltas.length * 10) / 10 : null,
        motorway:    mean(stats.map(s => s.motorway).filter(v => v != null)),
        supermarket: mean(stats.map(s => s.supermarket).filter(v => v != null)),
        forecourt:   mean(stats.map(s => s.forecourt).filter(v => v != null)),
      }
    }

    // Supermarket brand league table
    const supermarkets = (superRes.data || []).map(r => ({
      brand:         r.brand,
      logo_url:      r.logo_url,
      avg_petrol:    r.avg_petrol  != null ? parseFloat(r.avg_petrol)  : null,
      avg_diesel:    r.avg_diesel  != null ? parseFloat(r.avg_diesel)  : null,
      station_count: Number(r.station_count),
    }))

    cache = {
      unleaded: {
        uk:       ukAggregate(petrol),
        england:  petrol('england'),
        scotland: petrol('scotland'),
        wales:    petrol('wales'),
        ni:       petrol('northern ireland'),
      },
      diesel: {
        uk:       ukAggregate(diesel),
        england:  diesel('england'),
        scotland: diesel('scotland'),
        wales:    diesel('wales'),
        ni:       diesel('northern ireland'),
      },
      supermarkets,
      updatedAt: todayStr,
    }
    cacheTime = Date.now()

    res.setHeader('X-Cache', 'MISS')
    res.status(200).json(cache)
  } catch (err) {
    console.error('fuel-averages error:', err)
    res.status(500).json({ error: 'Failed to load price data' })
  }
}
