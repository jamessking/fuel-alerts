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
    const latF = parseFloat(lat)
    const lonF = parseFloat(lon)
    const r = parseInt(radius)

    // Bounding box approximation — fast, no full table scan
    // ~1 degree lat = 69 miles
    const latDelta = r / 69
    const lonDelta = r / (69 * Math.cos(latF * Math.PI / 180))

    const { count, error } = await supabase
      .from('pfs_stations')
      .select('node_id', { count: 'exact', head: true })
      .eq('permanent_closure', false)
      .eq('temporary_closure', false)
      .gte('latitude', latF - latDelta)
      .lte('latitude', latF + latDelta)
      .gte('longitude', lonF - lonDelta)
      .lte('longitude', lonF + lonDelta)

    if (error) throw error

    res.setHeader('Cache-Control', 's-maxage=3600')
    res.status(200).json({ count: count ?? 0 })
  } catch (err) {
    console.error('station-count error:', err)
    res.status(500).json({ count: null })
  }
}
