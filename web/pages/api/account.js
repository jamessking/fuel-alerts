import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

async function getSubscriberFromToken(token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const { data } = await supabase
    .from('subscribers')
    .select('*')
    .eq('magic_token_hash', tokenHash)
    .gt('magic_token_expiry', new Date().toISOString())
    .single()
  return data
}

export default async function handler(req, res) {
  const token = req.query.token || req.body?.token
  if (!token) return res.status(401).json({ error: 'No token' })

  const subscriber = await getSubscriberFromToken(token)
  if (!subscriber) return res.status(401).json({ error: 'Invalid or expired token' })

  // ── GET — load full account data ─────────────────────────────────────────
  if (req.method === 'GET') {
    const today = new Date().toISOString().split('T')[0]

    const [vehiclesRes, favouritesRes, digestsRes, nearbyRes, historyRes] = await Promise.all([
      // Vehicles
      supabase.from('subscriber_vehicles')
        .select('*')
        .eq('subscriber_id', subscriber.id)
        .order('created_at', { ascending: false }),

      // Favourites with current prices
      supabase.from('subscriber_favourites')
        .select('node_id, created_at, pfs_stations(node_id, trading_name, brand_clean, logo_url, postcode, latitude, longitude)')
        .eq('subscriber_id', subscriber.id),

      // Digest count
      supabase.from('weekly_sends')
        .select('id, sent_at, cheapest_price', { count: 'exact' })
        .eq('subscriber_id', subscriber.id)
        .order('sent_at', { ascending: false })
        .limit(1),

      // Current cheapest nearby (primary address)
      supabase.rpc('top5_cheapest_nearby', {
        lat: subscriber.lat,
        lon: subscriber.lon,
        radius_miles: subscriber.radius_miles,
        fuel: subscriber.fuel_type === 'diesel' ? 'B7_STANDARD' : 'E10',
      }),

      // 30-day price history near them
      supabase.from('fuel_prices_daily')
        .select('snapshot_date, price')
        .eq('fuel_type', subscriber.fuel_type === 'diesel' ? 'B7_STANDARD' : 'E10')
        .gte('snapshot_date', new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0])
        .lte('snapshot_date', today)
        .limit(5000),
    ])

    // Enrich favourites with today's prices
    const favNodeIds = (favouritesRes.data || []).map(f => f.node_id)
    let favPrices = []
    if (favNodeIds.length > 0) {
      const { data } = await supabase
        .from('fuel_prices_daily')
        .select('node_id, fuel_type, price')
        .in('node_id', favNodeIds)
        .eq('snapshot_date', today)
        .in('fuel_type', ['E10', 'B7_STANDARD'])
      favPrices = data || []
    }

    const favPriceMap = {}
    for (const p of favPrices) {
      if (!favPriceMap[p.node_id]) favPriceMap[p.node_id] = {}
      favPriceMap[p.node_id][p.fuel_type] = parseFloat(p.price)
    }

    const favourites = (favouritesRes.data || []).map(f => ({
      node_id:    f.node_id,
      created_at: f.created_at,
      ...f.pfs_stations,
      petrol_price: favPriceMap[f.node_id]?.['E10']    || null,
      diesel_price: favPriceMap[f.node_id]?.['B7_STANDARD'] || null,
    }))

    // Enrich nearby with station details
    const nearbyRaw = nearbyRes.data || []
    let nearby = []
    if (nearbyRaw.length > 0) {
      const { data: stDetails } = await supabase
        .from('pfs_stations')
        .select('node_id, brand_clean, trading_name, logo_url, postcode')
        .in('node_id', nearbyRaw.map(s => s.node_id))
      const stMap = Object.fromEntries((stDetails || []).map(s => [s.node_id, s]))
      nearby = nearbyRaw.map(s => ({
        ...s,
        ...stMap[s.node_id],
        price: parseFloat(s.price),
        display_name: stMap[s.node_id]?.brand_clean || stMap[s.node_id]?.trading_name || 'Station',
      }))
    }

    // 30-day chart — aggregate by date
    const chartMap = {}
    for (const r of (historyRes.data || [])) {
      if (!chartMap[r.snapshot_date]) chartMap[r.snapshot_date] = []
      chartMap[r.snapshot_date].push(parseFloat(r.price))
    }
    const chartSeries = Object.entries(chartMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, prices]) => ({
        date,
        avg: Math.round(prices.reduce((s, v) => s + v, 0) / prices.length * 10) / 10,
      }))

    // UK average for savings calc
    const { data: ukAvgData } = await supabase.rpc('get_fuel_averages', {
      p_today:    today,
      p_week_ago: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
    })
    const ukAvg = (ukAvgData || []).find(r => r.fuel_type === 'E10')
    const ukAvgPrice = ukAvg?.avg_price ? parseFloat(ukAvg.avg_price) : null

    // Savings estimate: (ukAvg - their cheapest) * litres * fills per year
    const cheapestNearby = nearby[0]?.price || null
    const annualMiles = subscriber.annual_miles || 10000
    const mpg = subscriber.mpg || 45
    const tankLitres = subscriber.tank_litres || 55
    const litresPerYear = (annualMiles / mpg) * 4.546
    const fillsPerYear = litresPerYear / tankLitres
    const savingsVsUk = ukAvgPrice && cheapestNearby
      ? Math.round(((ukAvgPrice - cheapestNearby) / 100) * litresPerYear)
      : null

    const digestCount = digestsRes.count || 0
    const lastDigest = digestsRes.data?.[0] || null

    return res.status(200).json({
      subscriber: {
        id:                    subscriber.id,
        email:                 subscriber.email,
        postcode:              subscriber.postcode,
        lat:                   subscriber.lat,
        lon:                   subscriber.lon,
        radius_miles:          subscriber.radius_miles,
        fuel_type:             subscriber.fuel_type,
        annual_miles:          subscriber.annual_miles,
        mpg:                   subscriber.mpg,
        tank_litres:           subscriber.tank_litres,
        created_at:            subscriber.created_at,
        address2_postcode:     subscriber.address2_postcode,
        address2_lat:          subscriber.address2_lat,
        address2_lon:          subscriber.address2_lon,
        address2_radius_miles: subscriber.address2_radius_miles,
        price_alert_threshold: subscriber.price_alert_threshold,
      },
      vehicles:      vehiclesRes.data  || [],
      favourites,
      nearby,
      chartSeries,
      digestCount,
      lastDigest,
      savingsVsUk,
      ukAvgPrice,
      token, // pass back so page can use it for subsequent PATCH calls
    })
  }

  // ── PATCH — update subscriber settings ───────────────────────────────────
  if (req.method === 'PATCH') {
    const allowed = [
      'postcode', 'lat', 'lon', 'radius_miles',
      'fuel_type', 'annual_miles', 'mpg', 'tank_litres',
      'address2_postcode', 'address2_lat', 'address2_lon', 'address2_radius_miles',
      'price_alert_threshold',
    ]
    const updates = {}
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' })

    const { error } = await supabase
      .from('subscribers')
      .update(updates)
      .eq('id', subscriber.id)

    if (error) return res.status(500).json({ error: 'Update failed' })
    return res.status(200).json({ message: 'Updated' })
  }

  return res.status(405).end()
}
