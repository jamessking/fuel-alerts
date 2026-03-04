import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { lat, lon, radius = '5', fuel = 'E10' } = req.query
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' })

  // Map frontend fuel codes to DB fuel types
  const fuelType = fuel === 'B7_STANDARD' || fuel === 'B7' ? 'B7_STANDARD' : 'E10'

  try {
    const { data, error } = await supabase.rpc('top5_cheapest_nearby', {
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      radius_miles: parseFloat(radius),
      fuel: fuelType,
    })

    if (error) throw error

    // Enrich with station details
    if (!data || data.length === 0) return res.status(200).json({ stations: [] })

    const nodeIds = data.map(s => s.node_id)
    const { data: stationDetails } = await supabase
      .from('pfs_stations')
      .select('node_id, brand_name, brand_clean, trading_name, logo_url, postcode, is_supermarket_service_station, is_motorway_service_station, latitude, longitude, amenities')
      .in('node_id', nodeIds)

    const detailMap = Object.fromEntries((stationDetails || []).map(s => [s.node_id, s]))

    const stations = data.map(s => {
      const d = detailMap[s.node_id] || {}
      return {
        ...d,
        node_id: s.node_id,
        price: parseFloat(s.price),
        fuel_type: fuelType,
        display_name: d.brand_clean || d.brand_name || d.trading_name || 'Station',
      }
    })

    return res.status(200).json({ stations })
  } catch (err) {
    console.error('nearby-stations error:', err)
    return res.status(500).json({ error: 'Failed to fetch nearby stations' })
  }
}
