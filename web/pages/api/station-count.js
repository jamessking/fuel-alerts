import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export default async function handler(req, res) {
  const { lat, lon, radius } = req.query
  if (!lat || !lon || !radius) return res.status(400).json({ error: 'Missing params' })

  try {
    const { data, error } = await supabase.rpc('top5_cheapest_nearby', {
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      radius_miles: parseInt(radius),
      fuel: 'E10',
    })

    if (error) throw error

    // top5 only returns 5 — use a count RPC instead
    // Fall back: count stations within radius using haversine
    const { data: stations, error: err2 } = await supabase
      .from('pfs_stations')
      .select('node_id, latitude, longitude')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .eq('permanent_closure', false)
      .eq('temporary_closure', false)

    if (err2) throw err2

    const R = 3958.7613
    const latR = parseFloat(lat) * Math.PI / 180
    const lonR = parseFloat(lon) * Math.PI / 180
    const r = parseInt(radius)

    const count = stations.filter(s => {
      const sLat = parseFloat(s.latitude) * Math.PI / 180
      const sLon = parseFloat(s.longitude) * Math.PI / 180
      const dLat = sLat - latR
      const dLon = sLon - lonR
      const a = Math.sin(dLat/2)**2 + Math.cos(latR) * Math.cos(sLat) * Math.sin(dLon/2)**2
      const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
      return d <= r
    }).length

    res.setHeader('Cache-Control', 's-maxage=3600')
    res.status(200).json({ count })
  } catch (err) {
    console.error('station-count error:', err)
    res.status(500).json({ error: 'Failed' })
  }
}
