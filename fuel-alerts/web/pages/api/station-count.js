import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export default async function handler(req, res) {
  const { lat, lon, radius } = req.query
  if (!lat || !lon || !radius) return res.status(400).json({ error: 'Missing params' })

  const latF = parseFloat(lat)
  const lonF = parseFloat(lon)
  const r = parseInt(radius)

  const latDelta = r / 69
  const lonDelta = r / (69 * Math.cos(latF * Math.PI / 180))

  const { data, error } = await supabase.rpc('count_stations_in_bbox', {
    min_lat: latF - latDelta,
    max_lat: latF + latDelta,
    min_lon: lonF - lonDelta,
    max_lon: lonF + lonDelta,
  })

  if (error) {
    console.error('station-count error:', error)
    return res.status(500).json({ count: null })
  }

  res.setHeader('Cache-Control', 's-maxage=3600')
  res.status(200).json({ count: data ?? 0, estimated: true })
}