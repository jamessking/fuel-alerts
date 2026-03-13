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

    // Single RPC call — SQL does the join + aggregation server-side
    // No row-limit issues, no massive .in() queries
    const { data: rows, error } = await supabase.rpc('get_fuel_averages', {
      p_today:    todayStr,
      p_week_ago: weekAgoStr,
    })

    if (error) throw error

    // Index rows: country (lowercased) -> fuel_type -> stats
    const idx = {}
    for (const r of rows) {
      const key = (r.country || '').toLowerCase()
      if (!idx[key]) idx[key] = {}
      idx[key][r.fuel_type] = r
    }

    // Merge B7 + B7_STANDARD into one diesel figure
    const diesel = (country) => {
      const b7  = idx[country]?.['B7']
      const b7s = idx[country]?.['B7_STANDARD']
      // Prefer whichever has data; average both if both present
      if (b7 && b7s) {
        const avg = (a, b) => a != null && b != null
          ? Math.round(((parseFloat(a) + parseFloat(b)) / 2) * 10) / 10
          : (a ?? b)
        return {
          avg:        avg(b7.avg_price, b7s.avg_price),
          weekDelta:  avg(b7.avg_price_week_ago, b7s.avg_price_week_ago) != null
            ? Math.round(((parseFloat(b7.avg_price ?? b7s.avg_price) -
                parseFloat(b7.avg_price_week_ago ?? b7s.avg_price_week_ago))) * 10) / 10
            : null,
          motorway:   avg(b7.avg_motorway, b7s.avg_motorway),
          supermarket: avg(b7.avg_supermarket, b7s.avg_supermarket),
          forecourt:  avg(b7.avg_forecourt, b7s.avg_forecourt),
        }
      }
      const src = b7s || b7
      if (!src) return { avg: null, weekDelta: null, motorway: null, supermarket: null, forecourt: null }
      return {
        avg:         src.avg_price        != null ? parseFloat(src.avg_price)        : null,
        weekDelta:   src.avg_price != null && src.avg_price_week_ago != null
          ? Math.round((parseFloat(src.avg_price) - parseFloat(src.avg_price_week_ago)) * 10) / 10
          : null,
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
          ? Math.round((parseFloat(src.avg_price) - parseFloat(src.avg_price_week_ago)) * 10) / 10
          : null,
        motorway:    src.avg_motorway     != null ? parseFloat(src.avg_motorway)     : null,
        supermarket: src.avg_supermarket  != null ? parseFloat(src.avg_supermarket)  : null,
        forecourt:   src.avg_forecourt    != null ? parseFloat(src.avg_forecourt)    : null,
      }
    }

    // Supermarket averages
    const { data: superRows } = await supabase.rpc('get_all_supermarket_averages', { p_fuel_type: 'E10' })
    const { data: superRowsDiesel } = await supabase.rpc('get_all_supermarket_averages', { p_fuel_type: 'B7' })
    const dieselByBrand = {}
    for (const r of (superRowsDiesel || [])) dieselByBrand[r.brand_clean] = r

    const supermarkets = (superRows || []).map(r => ({
      brand:         r.brand_clean,
      avg_petrol:    r.avg_price != null ? parseFloat(r.avg_price) : null,
      avg_diesel:    dieselByBrand[r.brand_clean]?.avg_price != null ? parseFloat(dieselByBrand[r.brand_clean].avg_price) : null,
      station_count: r.station_count,
      logo_url:      r.logo_url || null,
    }))

    // Brand averages (non-supermarket forecourts)
    const { data: brandRows } = await supabase.rpc('get_all_brand_averages', { p_fuel_type: 'E10', p_min_stations: 10 })
    const brands = (brandRows || []).map(r => ({
      brand_clean:   r.brand_clean,
      avg_price:     r.avg_price != null ? parseFloat(r.avg_price) : null,
      station_count: r.station_count,
      logo_url:      r.logo_url || null,
    }))

    cache = {
      unleaded: {
        uk:       petrol('uk'),
        england:  petrol('england'),
        scotland: petrol('scotland'),
        wales:    petrol('wales'),
        ni:       petrol('northern ireland'),
      },
      diesel: {
        uk:       diesel('uk'),
        england:  diesel('england'),
        scotland: diesel('scotland'),
        wales:    diesel('wales'),
        ni:       diesel('northern ireland'),
      },
      supermarkets,
      brands,
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
